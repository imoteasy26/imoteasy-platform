#!/usr/bin/env bash
# Apply Imoteasy migrations on a disposable local Postgres, verify the
# org/RLS hardening migration twice, run the isolation test, roll it back,
# re-apply, and re-test. Never points at a remote database.
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
echo "== second apply of hardening (idempotency) =="
run -f "$HARDENING"

echo "== isolation test (1) =="
run -f "$ROOT/supabase/tests/rls/organizations_isolation.sql"

echo "== rollback hardening =="
run --single-transaction -f "$ROOT/supabase/rollback/20261112130000_organization_rls_hardening.rollback.sql"

echo "== re-apply hardening after rollback =="
run -f "$HARDENING"

echo "== isolation test (2) =="
run -f "$ROOT/supabase/tests/rls/organizations_isolation.sql"

echo "All local org/RLS checks passed."
if [ "$started_here" = 1 ] && [ "${KEEP_PG:-0}" != 1 ]; then
  pg_ctl -D "$PGDATA" stop -m fast
fi
