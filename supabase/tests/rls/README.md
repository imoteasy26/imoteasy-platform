# Local RLS verification

These SQL tests are for a **disposable local Postgres** only. They must not be
run against Development, Preview, Production, or any other remote Supabase
project. GitHub Actions CI does not run them until a test database exists.

## What you need

PostgreSQL 17 (17.11 is what was used when this was written). A cluster you
created yourself is enough; you do not need a full Supabase stack.

## Apply and test

From the repository root:

```bash
# Start a throwaway server, or point these at an empty local database.
export PGHOST=/tmp
export PGPORT=55432
export PGDATABASE=imoteasy_rls

psql -v ON_ERROR_STOP=1 -f supabase/tests/rls/local_harness.sql
for f in supabase/migrations/*.sql; do
  psql -v ON_ERROR_STOP=1 -f "$f"
done

# The isolation test always rolls back its fixtures.
psql -v ON_ERROR_STOP=1 -f supabase/tests/rls/organizations_isolation.sql
```

`scripts/run-org-rls-local.sh` does the same, then applies
`20261112130000_organization_rls_hardening.sql` a second time (idempotency),
runs the rollback, re-applies the hardening migration, and re-runs the test.

`local_harness.sql` stubs the `anon` / `authenticated` / `service_role` roles,
`auth.uid()` / `auth.users`, and a minimal `storage.buckets` / `storage.objects`
schema so the production migration files can be applied verbatim.
