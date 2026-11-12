#!/usr/bin/env bash
# Two active owners each call remove_organization_member on the other at the
# same time, from two parallel psql sessions. Lock order is organization
# then membership, so the sessions serialize on the org row: exactly one
# removal must succeed and the other must raise a clean error
# (last_owner_required, organization_admin_required, or member_not_found).
# A deadlock (40P01) is a failure.
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

WORKDIR="$(mktemp -d /tmp/imoteasy-concurrent-mutual-remove.XXXXXX)"
cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

ORG_ID="$("${psql[@]}" <<SQL
drop table if exists public._rls_test_remove_gate;
drop table if exists public._rls_test_remove_result;
create table public._rls_test_remove_gate (open boolean not null);
insert into public._rls_test_remove_gate values (false);
create table public._rls_test_remove_result (
  actor uuid primary key,
  ok boolean not null,
  err text,
  errcode text
);
grant select, update on public._rls_test_remove_gate to authenticated;
grant insert, update, select on public._rls_test_remove_result to authenticated;

insert into auth.users (id, email, aud, role, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('${OWNER_A}', 'concurrent-remove-a-${OWNER_A}@example.invalid', 'authenticated', 'authenticated', '', now(), '{}'::jsonb, jsonb_build_object('display_name', 'Owner A')),
  ('${OWNER_B}', 'concurrent-remove-b-${OWNER_B}@example.invalid', 'authenticated', 'authenticated', '', now(), '{}'::jsonb, jsonb_build_object('display_name', 'Owner B'));

set role authenticated;
select set_config('request.jwt.claim.sub', '${OWNER_A}', false),
       set_config('request.jwt.claim.role', 'authenticated', false),
       set_config('request.jwt.claims',
         json_build_object('sub', '${OWNER_A}', 'role', 'authenticated')::text, false);
select public.create_broker_workspace('Конкурентно взаимно премахване', 'София', 'broker-trial-v1', true);
SQL
)"

if [ -z "$ORG_ID" ]; then
  echo "failed to seed concurrent-mutual-remove organization" >&2
  exit 1
fi

ORG_ID="$(printf '%s\n' "$ORG_ID" | tail -n 1)"

"${psql[@]}" <<SQL
reset role;
insert into public.organization_memberships (organization_id, user_id, role, status)
values ('${ORG_ID}'::uuid, '${OWNER_B}', 'owner', 'active');
SQL

write_worker() {
  local actor="$1"
  local target="$2"
  local outfile="$3"
  cat > "$outfile" <<SQL
set role authenticated;
select set_config('request.jwt.claim.sub', '${actor}', false),
       set_config('request.jwt.claim.role', 'authenticated', false),
       set_config('request.jwt.claims',
         json_build_object('sub', '${actor}', 'role', 'authenticated')::text, false);

do \$\$
begin
  while not coalesce((select open from public._rls_test_remove_gate), false) loop
    perform pg_sleep(0.01);
  end loop;
end;
\$\$;

do \$\$
begin
  perform public.remove_organization_member('${ORG_ID}'::uuid, '${target}'::uuid);
  insert into public._rls_test_remove_result (actor, ok, err, errcode)
  values ('${actor}', true, null, null);
exception
  when others then
    insert into public._rls_test_remove_result (actor, ok, err, errcode)
    values ('${actor}', false, sqlerrm, sqlstate);
end;
\$\$;
SQL
}

write_worker "$OWNER_A" "$OWNER_B" "$WORKDIR/remove_a.sql"
write_worker "$OWNER_B" "$OWNER_A" "$WORKDIR/remove_b.sql"

psql_file=(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$DB" -v ON_ERROR_STOP=1 --no-psqlrc)
"${psql_file[@]}" -f "$WORKDIR/remove_a.sql" >"$WORKDIR/remove_a.log" 2>&1 &
pid_a=$!
"${psql_file[@]}" -f "$WORKDIR/remove_b.sql" >"$WORKDIR/remove_b.log" 2>&1 &
pid_b=$!

sleep 0.4
"${psql[@]}" -c "update public._rls_test_remove_gate set open = true"

set +e
wait "$pid_a"
status_a=$?
wait "$pid_b"
status_b=$?
set -e

if [ "$status_a" -ne 0 ] || [ "$status_b" -ne 0 ]; then
  echo "concurrent mutual-remove worker failed" >&2
  echo "---- session A ----" >&2
  cat "$WORKDIR/remove_a.log" >&2
  echo "---- session B ----" >&2
  cat "$WORKDIR/remove_b.log" >&2
  exit 1
fi

"${psql[@]}" <<SQL
do \$\$
declare
  success_count int;
  failure_count int;
  remaining_owners int;
  failure_err text;
  failure_code text;
begin
  select count(*) filter (where ok), count(*) filter (where not ok)
    into success_count, failure_count
  from public._rls_test_remove_result
  where actor in ('${OWNER_A}', '${OWNER_B}');

  if success_count <> 1 or failure_count <> 1 then
    raise exception 'RLS_TEST_FAILED: concurrent mutual remove expected one success and one failure, got % success and % failure',
      success_count, failure_count;
  end if;

  select err, errcode into failure_err, failure_code
  from public._rls_test_remove_result
  where actor in ('${OWNER_A}', '${OWNER_B}') and not ok;

  if failure_code = '40P01' or failure_err like '%40P01%' or failure_err ilike '%deadlock%' then
    raise exception 'RLS_TEST_FAILED: concurrent mutual remove deadlocked: % (%)', failure_err, failure_code;
  end if;

  if failure_err not like '%last_owner_required%'
     and failure_err not like '%organization_admin_required%'
     and failure_err not like '%member_not_found%' then
    raise exception 'RLS_TEST_FAILED: concurrent mutual remove loser raised an unexpected error: % (%)',
      failure_err, failure_code;
  end if;

  select count(*) into remaining_owners
  from public.organization_memberships
  where organization_id = '${ORG_ID}'::uuid
    and role = 'owner'
    and status = 'active';

  if remaining_owners <> 1 then
    raise exception 'RLS_TEST_FAILED: concurrent mutual remove left % active owners', remaining_owners;
  end if;
end;
\$\$;

drop table if exists public._rls_test_remove_gate;
drop table if exists public._rls_test_remove_result;
SQL

echo "organizations_concurrent_mutual_remove: exactly one removal succeeded, one raised a clean error (no 40P01)"
