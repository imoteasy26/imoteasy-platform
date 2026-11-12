#!/usr/bin/env bash
# Apply Imoteasy migrations on a disposable local Postgres, verify both new
# migrations twice, run isolation and concurrent-leave tests, roll them back
# in reverse order, re-apply, and re-test. Never points at a remote database.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="${PG_EMBEDDED_BIN:-/tmp/pg-embedded/dist/bin}:/usr/lib/postgresql/17/bin:${PATH}"
if [ -d /tmp/pg-embedded/dist/lib ]; then
  export LD_LIBRARY_PATH="/tmp/pg-embedded/dist/lib:${LD_LIBRARY_PATH:-}"
fi

PGHOST="${PGHOST:-/tmp}"
PGPORT="${PGPORT:-55432}"
PGUSER="${PGUSER:-box}"
PGDATA="${PGDATA:-/tmp/imoteasy-org-rls-pg}"
DB="${PGDATABASE:-imoteasy_rls}"

if ! pg_isready -h "$PGHOST" -p "$PGPORT" >/dev/null 2>&1; then
  echo "Starting a disposable Postgres in $PGDATA on port $PGPORT"
  if [ ! -d "$PGDATA" ]; then
    initdb -D "$PGDATA" --auth=trust --no-instructions --username="$PGUSER"
  fi
  pg_ctl -D "$PGDATA" -o "-p $PGPORT -k $PGHOST --listen_addresses=127.0.0.1" -l "${PGDATA}/server.log" start
  started_here=1
else
  started_here=0
fi

psql=(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -v ON_ERROR_STOP=1 --no-psqlrc)

dropdb -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" --if-exists "$DB"
createdb -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" "$DB"

run() { "${psql[@]}" -d "$DB" "$@"; }

echo "== harness =="
run -f "$ROOT/supabase/tests/rls/local_harness.sql"

echo "== apply all migrations =="
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "  $(basename "$f")"
  run -f "$f"
done

HARDENING="$ROOT/supabase/migrations/20261112130000_organization_rls_hardening.sql"
INVITE_FIX="$ROOT/supabase/migrations/20261112140000_fix_invitation_inviter_role_null.sql"

echo "== pre-apply check (expected 0 on an empty database) =="
run -c "select count(*) as listing_images_alt_text_over_200 from public.listing_images where char_length(alt_text) > 200;"

echo "== second apply of both new migrations (idempotency) =="
run -f "$HARDENING"
run -f "$INVITE_FIX"

echo "== isolation test (1) =="
run -f "$ROOT/supabase/tests/rls/organizations_isolation.sql"

echo "== concurrent two-owner leave (1) =="
"$ROOT/supabase/tests/rls/organizations_concurrent_leave.sh"

echo "== rollback new migrations (140000 then 130000) =="
run --single-transaction -f "$ROOT/supabase/rollback/20261112140000_fix_invitation_inviter_role_null.rollback.sql"
run --single-transaction -f "$ROOT/supabase/rollback/20261112130000_organization_rls_hardening.rollback.sql"

echo "== re-apply both new migrations after rollback =="
run -f "$HARDENING"
run -f "$INVITE_FIX"

echo "== isolation test (2) =="
run -f "$ROOT/supabase/tests/rls/organizations_isolation.sql"

echo "== concurrent two-owner leave (2) =="
"$ROOT/supabase/tests/rls/organizations_concurrent_leave.sh"

echo "All local org/RLS checks passed."
if [ "$started_here" = 1 ] && [ "${KEEP_PG:-0}" != 1 ]; then
  pg_ctl -D "$PGDATA" stop -m fast
fi
