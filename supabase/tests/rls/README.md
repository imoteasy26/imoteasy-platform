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

# Pre-apply check before validating listing_images_alt_text_length:
#   select count(*) from public.listing_images where char_length(alt_text) > 200;
# Then, in a separate step (not in the migration):
#   alter table public.listing_images validate constraint listing_images_alt_text_length;

# The isolation test always rolls back its fixtures.
psql -v ON_ERROR_STOP=1 -f supabase/tests/rls/organizations_isolation.sql

# Two parallel sessions: one of two concurrent owner leaves must fail.
./supabase/tests/rls/organizations_concurrent_leave.sh
```

`scripts/run-org-rls-local.sh` does the same, then applies
`20261112130000_organization_rls_hardening.sql`,
`20261112140000_fix_invitation_inviter_role_null.sql`, and
`20261112150000_org_rls_followups.sql` a second time (idempotency),
rolls them back in reverse order (150000, then 140000, then 130000),
re-applies all three, and re-runs the isolation and concurrent-leave tests.
The 140000 and 150000 rollbacks are documented no-ops: they keep the
NULL-safe invitation function and the `is distinct from` lead-assignment
check instead of restoring those holes.

`local_harness.sql` stubs the `anon` / `authenticated` / `service_role` roles,
`auth.uid()` / `auth.users`, and a minimal `storage.buckets` / `storage.objects`
schema so the production migration files can be applied verbatim.
