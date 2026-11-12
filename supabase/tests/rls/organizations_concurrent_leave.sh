#!/usr/bin/env bash
# Two active owners leave the same organization at the same time, from two
# parallel psql sessions. The last-owner guard locks the organization row, so
# exactly one leave must succeed and the other must raise last_owner_required.
#
# Run only against a disposable local database after the migrations. Do not
# point this at a remote or production project.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
export PATH="${PG_EMBEDDED_BIN:-/tmp/pg-embedded/dist/bin}:/usr/lib/postgresql/17/bin:${PATH}"
if [ -d /tmp/pg-embedded/dist/lib ]; then
  export LD_LIBRARY_PATH="/tmp/pg-embedded/dist/lib:${LD_LIBRARY_PATH:-}"
fi

PGHOST="${PGHOST:-/tmp}"
PGPORT="${PGPORT:-55432}"
PGUSER="${PGUSER:-box}"
DB="${PGDATABASE:-imoteasy_rls}"

psql=(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$DB" -v ON_ERROR_STOP=1 --no-psqlrc -At)

OWNER_A="$("${psql[@]}" -c "select gen_random_uuid()")"
OWNER_B="$("${psql[@]}" -c "select gen_random_uuid()")"

WORKDIR="$(mktemp -d /tmp/imoteasy-concurrent-leave.XXXXXX)"
cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

ORG_ID="$("${psql[@]}" <<SQL
drop table if exists public._rls_test_leave_gate;
drop table if exists public._rls_test_leave_result;
create table public._rls_test_leave_gate (open boolean not null);
insert into public._rls_test_leave_gate values (false);
create table public._rls_test_leave_result (
  actor uuid primary key,
  ok boolean not null,
  err text
);
grant select, update on public._rls_test_leave_gate to authenticated;
grant insert, update, select on public._rls_test_leave_result to authenticated;

insert into auth.users (id, email, aud, role, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('${OWNER_A}', 'concurrent-owner-a-${OWNER_A}@example.invalid', 'authenticated', 'authenticated', '', now(), '{}'::jsonb, jsonb_build_object('display_name', 'Owner A')),
  ('${OWNER_B}', 'concurrent-owner-b-${OWNER_B}@example.invalid', 'authenticated', 'authenticated', '', now(), '{}'::jsonb, jsonb_build_object('display_name', 'Owner B'));

set role authenticated;
select set_config('request.jwt.claim.sub', '${OWNER_A}', false),
       set_config('request.jwt.claim.role', 'authenticated', false),
       set_config('request.jwt.claims',
         json_build_object('sub', '${OWNER_A}', 'role', 'authenticated')::text, false);
select public.create_broker_workspace('Конкурентно напускане', 'София', 'broker-trial-v1', true);
SQL
)"

if [ -z "$ORG_ID" ]; then
  echo "failed to seed concurrent-leave organization" >&2
  exit 1
fi

# The last SELECT in the block above returns the workspace id (after set_config
# rows). Take the last line just in case psql printed more than one.
ORG_ID="$(printf '%s\n' "$ORG_ID" | tail -n 1)"

"${psql[@]}" <<SQL
reset role;
insert into public.organization_memberships (organization_id, user_id, role, status)
values ('${ORG_ID}'::uuid, '${OWNER_B}', 'owner', 'active');
SQL

write_worker() {
  local actor="$1"
  local outfile="$2"
  cat > "$outfile" <<SQL
set role authenticated;
select set_config('request.jwt.claim.sub', '${actor}', false),
       set_config('request.jwt.claim.role', 'authenticated', false),
       set_config('request.jwt.claims',
         json_build_object('sub', '${actor}', 'role', 'authenticated')::text, false);

do \$\$
begin
  while not coalesce((select open from public._rls_test_leave_gate), false) loop
    perform pg_sleep(0.01);
  end loop;
end;
\$\$;

do \$\$
begin
  perform public.leave_organization('${ORG_ID}'::uuid);
  insert into public._rls_test_leave_result (actor, ok, err)
  values ('${actor}', true, null);
exception
  when others then
    insert into public._rls_test_leave_result (actor, ok, err)
    values ('${actor}', false, sqlerrm);
end;
\$\$;
SQL
}

write_worker "$OWNER_A" "$WORKDIR/leave_a.sql"
write_worker "$OWNER_B" "$WORKDIR/leave_b.sql"

# Use ON_ERROR_STOP in workers too (the array already has it). Start both
# sessions so they spin on the gate, then open it.
psql_file=(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$DB" -v ON_ERROR_STOP=1 --no-psqlrc)
"${psql_file[@]}" -f "$WORKDIR/leave_a.sql" >"$WORKDIR/leave_a.log" 2>&1 &
pid_a=$!
"${psql_file[@]}" -f "$WORKDIR/leave_b.sql" >"$WORKDIR/leave_b.log" 2>&1 &
pid_b=$!

sleep 0.4
"${psql[@]}" -c "update public._rls_test_leave_gate set open = true"

set +e
wait "$pid_a"
status_a=$?
wait "$pid_b"
status_b=$?
set -e

if [ "$status_a" -ne 0 ] || [ "$status_b" -ne 0 ]; then
  echo "concurrent leave worker failed" >&2
  echo "---- session A ----" >&2
  cat "$WORKDIR/leave_a.log" >&2
  echo "---- session B ----" >&2
  cat "$WORKDIR/leave_b.log" >&2
  exit 1
fi

"${psql[@]}" <<SQL
do \$\$
declare
  success_count int;
  failure_count int;
  remaining_owners int;
  failure_err text;
begin
  select count(*) filter (where ok), count(*) filter (where not ok)
    into success_count, failure_count
  from public._rls_test_leave_result
  where actor in ('${OWNER_A}', '${OWNER_B}');

  if success_count <> 1 or failure_count <> 1 then
    raise exception 'RLS_TEST_FAILED: concurrent leave expected one success and one failure, got % success and % failure',
      success_count, failure_count;
  end if;

  select err into failure_err
  from public._rls_test_leave_result
  where actor in ('${OWNER_A}', '${OWNER_B}') and not ok;

  if failure_err not like '%last_owner_required%' then
    raise exception 'RLS_TEST_FAILED: concurrent leave loser did not raise last_owner_required: %', failure_err;
  end if;

  select count(*) into remaining_owners
  from public.organization_memberships
  where organization_id = '${ORG_ID}'::uuid
    and role = 'owner'
    and status = 'active';

  if remaining_owners <> 1 then
    raise exception 'RLS_TEST_FAILED: concurrent leave left % active owners', remaining_owners;
  end if;
end;
\$\$;

drop table if exists public._rls_test_leave_gate;
drop table if exists public._rls_test_leave_result;
SQL

echo "organizations_concurrent_leave: exactly one leave succeeded, one raised last_owner_required"
