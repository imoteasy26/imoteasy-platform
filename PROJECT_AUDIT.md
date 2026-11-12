# Imoteasy Project Audit

Audit date: 2026-11-12
Scope: repository, current Vercel project metadata, and read-only inspection of the Supabase project identified by the app's Development URL. The hardening migration is committed as source only; no database migration, environment setting, deployment, or user data was changed.

## Executive summary

Imoteasy is a Next.js 16 marketplace with Supabase-backed listings, accounts, favorites, inquiries, reports, and moderation. This branch preserves those flows and adds marketplace hardening plus an initial broker-operations foundation: agency workspaces and invitations, explicit no-card trials, configurable entitlements, CRM lead conversion and assignment, tasks, viewing schedules, a transaction pipeline, attribution, and shared agency listings. The P0 and P1 migrations are source-only and must be reviewed and tested on an isolated Supabase project before their features are enabled. **P0 privacy risks remain until its migration is applied and verified; P1 acceptance is not complete until tenant/RLS flows pass against a migrated test database.** No demo listings were added; the app-matched database currently has no published listing rows.

## Runtime and data-source identity

- Framework: Next.js 16.4.3, React 19, TypeScript, Supabase SSR; Leaflet/react-leaflet are installed for maps.
- App-matched Supabase project: `imoteasy-production`, ref `aeezwzkngpwuoccjfrnl`, region `eu-west-1`, status `ACTIVE_HEALTHY`, Postgres 17.11.0.018. The local Development `NEXT_PUBLIC_SUPABASE_URL` resolves to this ref.
- A separate Supabase tool context is named `supabase-red-lamp` (`uaiihcvkppmdvyecqixv`). Its schema differs from the app-matched project and its project metadata lookup was denied. It was not used for application schema decisions or mutations; its region/deployment target remain unverified.
- Vercel project: `imoteasy-platform-development`. Supabase variable names are configured for Development, Preview, and Production. Values were not read or printed. The Vercel variable listing alone does not prove that Preview/Production point at `aeezwzkngpwuoccjfrnl`; verify only the non-secret `NEXT_PUBLIC_SUPABASE_URL` project ref in each target before rollout.
- No project environment values, Vercel settings, Supabase project settings, live tables, or migration ledger were changed.

## Feature readiness

| Area | Status | Evidence / remaining work |
|---|---|---|
| Public marketplace and search | IMPLEMENTED IN CODE | Public columns are explicit; filters and page bounds are validated; exact count and stable sort are used. The map client receives only its display fields. Live data has no published listings, so result/detail flows need a controlled test project. |
| Map and listing detail | IMPLEMENTED IN CODE | Public coordinates are rounded in app queries and before writes; detail/profile data omits private contact fields. The database still exposes current exact coordinates until the prepared migration is applied. |
| Draft, upload, submit | IMPLEMENTED IN CODE; MIGRATION REQUIRED | Existing owner-scoped actions remain. Image uploads validate MIME/signature/size/count and listing photos now use signed URLs. Storage remains public until the migration is applied, so the code alone does not prevent direct object access to drafts. |
| Email/password auth | IMPLEMENTED IN CODE | Sign-in/sign-up validation is stronger; password reset and update routes use Supabase Auth and the existing callback flow. End-to-end email delivery was not tested because no controlled test account/mailbox was used. |
| Favorites, inquiries, reports | EXISTING; REGRESSION CHECK NEEDED | Existing Supabase-backed actions and pages are preserved. Browser testing did not create inquiries or mutate account data. |
| Owner dashboard/account | EXISTING; REGRESSION CHECK NEEDED | Existing owner-scoped profile/listing flows remain. Exact-location editor is gated when the new private-coordinate schema is unavailable. |
| Admin moderation | EXISTING; REGRESSION CHECK NEEDED | Existing admin routes/actions remain; the migration consolidates related RLS policies. Verify with an authorized admin/test project before rollout. |
| Organizations and invitations | IMPLEMENTED IN CODE; MIGRATION REQUIRED | Additive P1 migration includes organizations, role-scoped memberships, hashed one-time invite tokens, confirmed-email acceptance, and organization event history. No database authorization test has been run. |
| Broker onboarding and trial | IMPLEMENTED IN CODE; MIGRATION REQUIRED | Activation explicitly records terms, the 30-day Professional trial, and per-broker usage counters. No card, price, billing, or auto-renew flow exists. Database entitlement enforcement still needs isolated-target tests. |
| CRM, tasks, viewings, and pipeline | IMPLEMENTED IN CODE; MIGRATION REQUIRED | Inquiry conversion references the canonical inquiry and is idempotent; lead/task/viewing/deal events are modeled. Availability editing, reminders, and full contact management remain partial/future work. |
| Agency workspace and shared listings | IMPLEMENTED IN CODE; MIGRATION REQUIRED | Team, dashboard, pipeline, and shared-inventory routes are present; organization membership and plan entitlements guard listing/media access in the P1 migration. Multi-tenant RLS remains unverified. |
| Attribution | IMPLEMENTED IN CODE; MIGRATION REQUIRED | Inquiry UTM/referrer context is stored through a consent-scoped RPC; no fingerprinting or external marketing action is used. Broader source-to-closed-deal attribution remains future work. |
| AI marketing, investor intelligence, seller rewards | ARCHITECTURE ONLY | Planning documents exist; generation, financial scoring, reward calculations, and payouts are not implemented or activated. |
| Saved searches | IMPLEMENTED IN CODE; MIGRATION REQUIRED | Save action, deduplication, owner management, enable/disable/delete, and criteria-to-results links are implemented. UI reports that the migration is required when the table is absent. |
| Matching alerts / notifications | IMPLEMENTED IN CODE; MIGRATION REQUIRED | In-app inbox, unread counts, and listing/inquiry trigger functions are implemented. No email integration was added. |
| Price history | IMPLEMENTED IN CODE; MIGRATION REQUIRED | The migration seeds a starting price for existing published listings and tracks future changes; the detail page renders changes and degrades with a migration notice. |
| SEO | IMPLEMENTED | Canonical/Open Graph metadata, `robots.ts`, and a published-listing `sitemap.ts` are present. |
| Automated tests | PARTIAL | Nine Vitest tests cover filter parsing, saved-search naming/links, coordinate handling, and broker local-time parsing. No authenticated Supabase E2E or tenant/RLS isolation test was run. |
| Images/performance | IMPLEMENTED IN CODE; MIGRATION REQUIRED | Next image optimization is enabled for Supabase Storage; signed URLs are generated server-side; bounded query payloads and page sizes reduce transfer work. Measure field performance after deployment; local vitals are lab data only. |

## Supabase schema, access, and operational findings

The app-matched database contains the marketplace tables `profiles`, `listings`, `listing_images`, `private_listing_details`, `private_profile_details`, `favorites`, `inquiries`, and `listing_reports`. Existing RLS/ownership/admin policies are present. The app-matched schema includes `private_profile_details`; the separate `supabase-red-lamp` context does not have the same table set.

### High-priority risks before rollout

1. **Public exact coordinates remain exposed in the live database.** Application responses now round them, but direct public table access is not fixed until migration `supabase/migrations/20261111000300_core_mvp_hardening.sql` runs successfully.
2. **Draft listing images remain publicly fetchable until the bucket policy change is applied.** Signed URLs in the app are not a substitute for changing the public Storage bucket and policies.
3. **Leaked-password protection is disabled.** The Supabase security advisor reports this project setting. It was not changed here; enable it separately after approval.
4. **Migration ledger is inconsistent.** The live inventory contains repeated entries for `profile_privacy_and_inquiry_status`. Do not edit the Supabase ledger directly. Have the migration owner reconcile it and review the new migration on a non-production target first.
5. **RLS performance advisor findings remain to be re-measured.** It reported overlapping permissive policies and unused indexes. This branch consolidates related policy paths and adds targeted indexes, but the advisor was not rerun against a migrated test database. Do not drop existing indexes based only on an empty/low-volume dataset.
6. **Preview/Production Supabase refs are unverified.** Confirm only the non-secret project ref from each target's `NEXT_PUBLIC_SUPABASE_URL` before applying any schema change or enabling persistence-backed features there.

## Migration contents and rollout

Both additive migrations are intentionally not applied. P0 rounds public listing coordinates while retaining exact coordinates in private details; changes listing-image storage from public to private/signed access; tightens grants and consolidates RLS; and adds saved-search, notification, and price-history structures. P1 (`supabase/migrations/20261112000000_broker_os_foundation.sql`) adds organizations, roles/invitations, trial plans and usage, CRM, tasks, viewing appointments, transactions, attribution, and organization-scoped listing/image/private-detail policies. Review both migrations before running them, especially alongside the repeated live migration history.

1. Verify the Development, Preview, and Production project refs using non-secret URL metadata. Keep the app matched to `aeezwzkngpwuoccjfrnl`; do not substitute `supabase-red-lamp`.
2. Reconcile the migration-history duplication with the migration owner; do not edit Supabase's migration ledger directly.
3. Apply this migration to an isolated Supabase test project and run `MANUAL_TESTING_CHECKLIST.md` with controlled owner/admin accounts.
4. Only after review and test approval, schedule the migration for the intended deployment target. Until then, saved searches/notifications/price history and private-coordinate editing may show a migration-required state.
5. Enable leaked-password protection separately after explicit approval.

## Validation on this branch

- `pnpm install --frozen-lockfile`: PASS.
- `pnpm run typecheck`: PASS.
- `pnpm test`: PASS — 9 tests across 3 suites.
- `pnpm run build`: PASS after sourcing the existing local Development environment file for the build process; no environment values were printed or changed.
- Browser smoke: homepage, filtered search, public broker trial landing, and sign-up continuation to `/auth/sign-up?next=%2Fbroker%2Fonboarding` loaded. Save-search interaction correctly gated on sign-in without writing data. The empty search result is expected because the app-matched database has no published listings. Browser console/errors showed no application errors.
- Responsive screenshots reviewed at 375×812 and 966×636, including the broker landing page.
- Dev-preview lab vitals for `/imoti?city=София` at 966×636: TTFB 685.5 ms, FCP/LCP 728 ms (LCP element: heading), CLS 0.00, hydration 59.6 ms; INP was unavailable because no interaction was recorded. These are development-mode lab measurements, not production field data.
- Authenticated owner/admin paths, email delivery, storage policies, direct table access, and database triggers remain unverified until exercised against an isolated migrated test project.
