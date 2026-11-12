# Imoteasy OS Implementation Roadmap

## Delivery discipline

Preserve the existing marketplace and customer data. Deliver additive migrations and domain slices. Never apply an unreviewed migration to Production, alter production environment variables, activate billing/payouts, or claim an RLS flow is verified without an isolated target and test identities.

## P0 — Production foundation

### Existing progress

- Existing marketplace implementation and account/admin paths remain in the merged branch.
- App-side hardening is present: bounded/explicit public queries, approximate public coordinates, signed image URL logic, auth recovery, saved-search/notification/price-history UI, SEO routes, and unit tests.
- Source migration `supabase/migrations/20261111000300_core_mvp_hardening.sql` contains coordinate privacy, private listing storage policies, RLS cleanup, and saved-search/notification/price-history tables.

### Remaining P0 gates

- **Not complete:** migration is not applied to an isolated test database. Public bucket and exact-coordinate database exposure remain a risk until policies/schema are verified.
- Identify Development, Preview, and Production Supabase refs using safe, non-secret metadata. Current audit identified Development as `aeezwzkngpwuoccjfrnl`; Preview/Production equivalence is unverified.
- Reconcile duplicate migration-history entries with the migration owner; do not directly alter Supabase's migration ledger.
- Verify storage/object and direct-table access, owner/admin flows, existing marketplace regressions, and moderation on a disposable migrated target.
- Leaked-password protection remains a separately approved Supabase setting.

### P0 exit criteria

Migration reviewed and tested off-production; exact-coordinate and draft-image access denied at the database/storage layer; published image access works through approved signed/public policy; migration history reconciled safely; marketplace, auth, owner, admin, and moderation flows pass; environment target refs are recorded without exposing secrets.

## P1 — Broker OS foundation

### Scope

- Organizations, active memberships, constrained roles, invitation workflow, and broker/agency profiles.
- Broker onboarding with explicit activation; 30-day no-card professional-tier trial begins only after completion.
- Configurable plan entitlements and per-broker usage ledger, without prices or automatic billing.
- CRM contacts and leads, inquiry-to-lead conversion by reference, owner assignment, status/priority, follow-up tasks, and append-only history.
- Appointment availability and viewing requests/confirmations/cancellations/rescheduling/outcomes.
- Basic transaction pipeline with shared listing/party references and timeline events.
- Privacy-conscious attribution events and measurable dashboard facts.

### P1 security requirements

- Every tenant table has RLS and organization membership/role validation.
- Bootstrap organization creation and initial owner membership are atomic and performed by a narrowly scoped `SECURITY DEFINER` function with `SET search_path = ''` and fully qualified names.
- Invitations are accepted only by the intended authenticated email and never allow self-assigned privileges.
- Inquiry conversion is idempotent and validates listing/organization ownership; the inquiry remains canonical.
- Task, appointment, and transaction foreign keys validate that all linked records share one organization.
- Service actions validate input and session on the server; RLS remains the final data boundary.
- No direct platform-admin or organization-admin role self-assignment.

### Current P1 status

The source implementation now includes the initial organization, trial/entitlement, invitation, CRM conversion, task, viewing, transaction-pipeline, attribution, broker-dashboard, team, and shared-listing flows. The additive migration is not applied to any database. This is a code milestone, **not P1 acceptance**: RLS, trial enforcement, invitation semantics, and workflow history still require the isolated-database checks in `MANUAL_TESTING_CHECKLIST.md`. Availability editing, automated reminders, richer contact management, and a complete transaction lifecycle remain partial.

### P1 acceptance gates

1. Existing marketplace and account type behavior remain operational.
2. User can create or join an agency workspace with proper initial owner and invitation semantics.
3. Organization rows are isolated under RLS, including direct-ID access.
4. Broker profile and verification state can be managed by authorized users.
5. Onboarding completion starts one 30-day professional trial; retry cannot create duplicate trials.
6. Trial entitlements are enforced from database configuration; no card, price, auto-renew, or charge exists.
7. Inquiry converts to one CRM lead referencing the original inquiry.
8. Authorized broker can assign/manage lead status and priority.
9. Lead/task/event history persists and cannot be forged by another tenant.
10. Viewing can be scheduled, changed, cancelled, and marked with an outcome.
11. Deal pipeline changes create timeline events; offer acceptance does not imply completion.
12. Attribution records declared source/campaign context without fingerprinting.
13. Every new table has tested RLS and scoped grants.
14. Automated tests cover tenant isolation and critical workflow invariants.
15. Existing data is unchanged; migrations are additive and reversible where feasible.
16. Production remains untouched until explicitly approved.

## P2 — AI Marketing OS

After P0/P1 gates: brand profiles, campaign objectives, agent/task orchestration, draft assets, version-bound human approval, authorized supported publishing, performance facts, usage and monthly reports. No unsupported group publishing or unapproved external actions.

## P3 — Investor Intelligence

After source/data licensing review: investor profiles/criteria, watchlists, opportunity alerts, price-drop signals, transparent versioned scoring, rental-yield calculator, and portfolio. Insufficient comparable data suppresses market-value claims.

## P4 — Seller Reward OS

After legal/accounting approvals: commission and reward agreements, verified completion, configurable calculation basis, immutable ledger, approval/dispute workflow, and payment status. Payout remains disabled until separately approved.

## P5 — Full Transaction OS

Integrate marketplace, CRM, appointments, offers/counteroffers, due diligence, contract milestones, completion verification, commission/reward ledgers, and attribution into one audited lifecycle. Secure document storage requires private buckets, signed access, retention, and authorization review.

## Current release blockers and validation target

The repository's current Supabase MCP schema lookup errored and its available MCP context is a separate project from the app-matched project described in `PROJECT_AUDIT.md`. No database migration was run. P0/P1 SQL and code can be reviewed in source, but database acceptance tests require an explicitly identified isolated Supabase target; production must not be used as that test target.
