#!/usr/bin/env bash
# Two sessions each update a different image on the same listing, then set
# the listing to pending_review. The image trigger takes FOR NO KEY UPDATE
# on the listing row so the sessions serialize instead of deadlocking
# (40P01) when they later update listings.status.
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

OWNER="$("${psql[@]}" -c "select gen_random_uuid()")"
LISTING="$("${psql[@]}" -c "select gen_random_uuid()")"
IMAGE_A="$("${psql[@]}" -c "select gen_random_uuid()")"
IMAGE_B="$("${psql[@]}" -c "select gen_random_uuid()")"

WORKDIR="$(mktemp -d /tmp/imoteasy-listing-image-status.XXXXXX)"
cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

"${psql[@]}" <<SQL
drop table if exists public._rls_test_alt_gate;
drop table if exists public._rls_test_alt_result;
create table public._rls_test_alt_gate (open boolean not null);
insert into public._rls_test_alt_gate values (false);
create table public._rls_test_alt_result (
  actor text primary key,
  ok boolean not null,
  err text,
  errcode text
);

insert into auth.users (id, email, aud, role, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values ('${OWNER}', 'concurrent-alt-${OWNER}@example.invalid', 'authenticated', 'authenticated', '', now(), '{}'::jsonb, jsonb_build_object('display_name', 'Owner'));

select set_config('request.jwt.claim.sub', '${OWNER}', false),
       set_config('request.jwt.claim.role', 'authenticated', false),
       set_config('request.jwt.claims',
         json_build_object('sub', '${OWNER}', 'role', 'authenticated')::text, false);

insert into public.listings (
  id, owner_id, title, slug, description, property_type, transaction_type,
  city, price_eur, area_sqm, status
) values (
  '${LISTING}',
  '${OWNER}',
  'Чернова обява за конкурентен тест',
  'concurrent-alt-${LISTING}',
  'Описание на чернова обява, достатъчно дълго за проверката.',
  'apartment',
  'sale',
  'София',
  120000,
  70,
  'draft'
);

insert into public.listing_images (id, listing_id, storage_path, alt_text, position, is_cover, is_decorative)
values
  ('${IMAGE_A}', '${LISTING}', '${OWNER}/${LISTING}/a.jpg', 'Дневна с тераса', 0, true, false),
  ('${IMAGE_B}', '${LISTING}', '${OWNER}/${LISTING}/b.jpg', 'Кухня с остров', 1, false, false);
SQL

write_worker() {
  local actor="$1"
  local image="$2"
  local alt="$3"
  local outfile="$4"
  cat > "$outfile" <<SQL
select set_config('request.jwt.claim.sub', '${OWNER}', false),
       set_config('request.jwt.claim.role', 'authenticated', false),
       set_config('request.jwt.claims',
         json_build_object('sub', '${OWNER}', 'role', 'authenticated')::text, false);

do \$\$
begin
  while not coalesce((select open from public._rls_test_alt_gate), false) loop
    perform pg_sleep(0.01);
  end loop;
end;
\$\$;

do \$\$
begin
  update public.listing_images
  set alt_text = '${alt}'
  where id = '${image}'::uuid;
  update public.listings
  set status = 'pending_review'
  where id = '${LISTING}'::uuid;
  insert into public._rls_test_alt_result (actor, ok, err, errcode)
  values ('${actor}', true, null, null);
exception
  when others then
    insert into public._rls_test_alt_result (actor, ok, err, errcode)
    values ('${actor}', false, sqlerrm, sqlstate);
end;
\$\$;
SQL
}

write_worker "session_a" "$IMAGE_A" "Дневна към двора" "$WORKDIR/alt_a.sql"
write_worker "session_b" "$IMAGE_B" "Кухня към терасата" "$WORKDIR/alt_b.sql"

psql_file=(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$DB" -v ON_ERROR_STOP=1 --no-psqlrc)
"${psql_file[@]}" -f "$WORKDIR/alt_a.sql" >"$WORKDIR/alt_a.log" 2>&1 &
pid_a=$!
"${psql_file[@]}" -f "$WORKDIR/alt_b.sql" >"$WORKDIR/alt_b.log" 2>&1 &
pid_b=$!

sleep 0.4
"${psql[@]}" -c "update public._rls_test_alt_gate set open = true"

set +e
wait "$pid_a"
status_a=$?
wait "$pid_b"
status_b=$?
set -e

if [ "$status_a" -ne 0 ] || [ "$status_b" -ne 0 ]; then
  echo "listing image/status concurrency worker failed" >&2
  echo "---- session A ----" >&2
  cat "$WORKDIR/alt_a.log" >&2
  echo "---- session B ----" >&2
  cat "$WORKDIR/alt_b.log" >&2
  exit 1
fi

"${psql[@]}" <<SQL
do \$\$
declare
  success_count int;
  failure_count int;
  failure_err text;
  failure_code text;
  listing_status text;
begin
  select count(*) filter (where ok), count(*) filter (where not ok)
    into success_count, failure_count
  from public._rls_test_alt_result
  where actor in ('session_a', 'session_b');

  if success_count + failure_count <> 2 then
    raise exception 'RLS_TEST_FAILED: image/status concurrency expected 2 results, got % success and % failure',
      success_count, failure_count;
  end if;

  if exists (
    select 1 from public._rls_test_alt_result
    where errcode = '40P01' or err like '%40P01%' or err ilike '%deadlock%'
  ) then
    select err, errcode into failure_err, failure_code
    from public._rls_test_alt_result
    where errcode = '40P01' or err like '%40P01%' or err ilike '%deadlock%'
    limit 1;
    raise exception 'RLS_TEST_FAILED: image then status update deadlocked: % (%)', failure_err, failure_code;
  end if;

  if failure_count > 0 then
    select err, errcode into failure_err, failure_code
    from public._rls_test_alt_result
    where not ok
    limit 1;
    raise exception 'RLS_TEST_FAILED: image then status update raised an unexpected error: % (%)',
      failure_err, failure_code;
  end if;

  select status into listing_status from public.listings where id = '${LISTING}'::uuid;
  if listing_status is distinct from 'pending_review' then
    raise exception 'RLS_TEST_FAILED: listing status after concurrent updates was %', listing_status;
  end if;
end;
\$\$;

drop table if exists public._rls_test_alt_gate;
drop table if exists public._rls_test_alt_result;
SQL

echo "listing_images_status_concurrency: both sessions finished without 40P01"
