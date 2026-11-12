# Imoteasy OS Domain Model

## Modeling principles

- Supabase Auth user IDs identify people; `profiles` remains the backwards-compatible public profile surface.
- Organization membership, not `profiles.account_type`, governs tenant access.
- Organization-owned rows include `organization_id` and are protected by RLS plus server-side membership checks.
- Current-state rows are paired with append-only events for auditable changes.
- Marketplace inquiries remain canonical source records; CRM leads reference them through a unique source key.
- No model assumes a subscription price, commission rate, seller reward basis, market value, or guaranteed yield.

## Existing marketplace entities

| Entity | Purpose | Current relationship |
|---|---|---|
| `profiles` | Auth-linked user profile and legacy `account_type` | One per `auth.users.id` |
| `listings` | Canonical property and asking-price record | Owned by a profile |
| `listing_images` | Listing image metadata | Belongs to a listing |
| `private_listing_details` | Private address and exact coordinates | One-to-one with a listing |
| `favorites` | User's saved properties | User/listing pair |
| `inquiries` | Original buyer-to-listing inquiry | References listing and sender |
| `listing_reports` | Moderation reports | References listing and reporter |
| `saved_searches`, `notifications`, `listing_price_history` | P0 persistence | User- or listing-scoped |

## P1 identity and organization model

### `organizations`

Agency or broker business workspace: `id`, `name`, normalized unique `slug`, `organization_type`, `verification_status`, `created_by`, timestamps, and lifecycle state. The creator is not automatically trusted as an administrator until the organization-creation transaction creates the initial owner membership.

### `organization_memberships`

Join table keyed by organization and user, with constrained roles (`owner`, `agency_admin`, `broker`, `assistant`, `marketing_manager`, `read_only`), membership state, `invited_by`, invite/accept timestamps, and audit timestamps. Membership insertion is owner/admin-controlled. The initial owner is created only through a transactional security-definer RPC with a fixed empty search path and fully qualified relations. No client can self-assign a role.

### `organization_invitations`

Organization, normalized email, role, high-entropy token hash (never the raw token), inviter, expiry, state, and accepted user/timestamp. Only authorized organization owners/admins can create/revoke invitations; acceptance checks authenticated email and token validity.

### `broker_profiles`

One broker profile per person, with organization association only through active membership, professional/verification fields, onboarding status, completion time, and approved profile metadata. Verification state is distinct from user claims and is moderator-controlled.

### `plan_catalog`, `broker_subscriptions`, `broker_usage_events`

- `plan_catalog` stores configurable tier code, display name, entitlement JSON, per-period usage limits, and active state. It does not store invented prices.
- `broker_subscriptions` records the broker/organization, plan, trial start/end, lifecycle state, and activation source. The professional trial is 30 days, starts only after onboarding completion, requires no payment method, and never auto-charges.
- `broker_usage_events` records broker, organization, resource, period, measured units, provider/model metadata where applicable, and idempotency key. Limits are evaluated from plan data. P1 may establish the ledger without running AI jobs.

## P1 CRM and activity model

### `crm_contacts`

Organization-scoped people records with contact roles, display name, normalized contact channels, owner/assignee, consent/communication preferences, source, and timestamps. Contact access is limited to active organization members with a permitted role.

### `crm_leads`

Organization-owned work item referencing a contact and optionally a listing. `source_inquiry_id` is nullable and unique, pointing at the original inquiry rather than copying its message or identity fields. Fields include lead owner, source, priority, pipeline status, next-follow-up time, creator, and timestamps. Valid statuses are `new`, `contacted`, `qualified`, `viewing_scheduled`, `viewing_completed`, `offer_received`, `negotiation`, `under_contract`, `won`, and `lost`.

A conversion RPC validates that the actor is an active organization member, the inquiry exists, the related listing is owned by or shared with that organization, and the inquiry has not already been converted. Contact creation/linking and lead insertion happen in one transaction. A unique source-inquiry constraint makes retries idempotent.

### `crm_lead_events`, `crm_tasks`

Lead events record status/assignment/priority changes with actor, old/new values, and timestamp. Tasks include organization, title/details, assignee, creator, due time, completion state, and optional links to lead, contact, listing, viewing, or transaction. RLS verifies every linked parent belongs to the same organization.

## P1 appointments and transaction pipeline

### `broker_availability`, `viewing_appointments`

Availability windows belong to a broker and organization. Appointments link listing, lead/contact, broker, organization, scheduled time, duration, booking state, cancellation/reschedule reason, and viewing outcome. Private notes are organization-only. Reminders are queued/audited; no reminder is sent until a supported channel is configured and consent rules permit it.

### `transactions`, `transaction_events`

A transaction links one listing, organization, broker, seller contact, buyer contact/lead, and lifecycle state. P1 pipeline states are `lead`, `qualified`, `viewing`, `offer`, `negotiation`, `due_diligence`, `contract_preparation`, `contract_signed`, `completed`, and `cancelled`. Status history is append-only. An accepted offer is not completion. Completion requires a separately recorded verification event. Offers, counteroffers, commissions, and reward agreements can be added without placing personal legal documents in public storage.

## P1 attribution model

### `attribution_touchpoints`

Append-only, privacy-conscious events linked to organization, broker, listing, and optionally inquiry/lead/viewing/transaction. Store only declared source and campaign context: channel, source, medium, campaign, content, term, referral identifier, UTM values, consent/context, and event time. Do not store fingerprint identifiers, full query strings, or unnecessary personal data. First-touch and last-touch are derived from ordered events, with model/version recorded in reports.

## Later-domain model contracts

- **AI marketing (P2):** brand profiles, campaigns, campaign objectives, agent runs/tasks, assets, approval requests, channel connections, publishing records, performance facts, and monthly reports. Every row is organization-scoped and every external action requires a human approval event.
- **Investor intelligence (P3):** investor profile, criteria, watchlists, opportunities, score versions, assumption sets, alerts, portfolio holdings, and opportunity history. Every score references source data and calculation date.
- **Seller rewards (P4):** commission agreements, seller reward agreements, verified transactions, immutable ledger entries, approval/dispute state, and payment status. Calculations are disabled until the agreement selects an approved model.

## Ownership and deletion

Foreign keys use explicit `on delete` behavior. Organization deletion is a reviewed lifecycle operation, not a client cascade. Membership revocation stops future access but does not erase audit history. User erasure and retention policies must be implemented per applicable legal obligations while preserving financial/audit integrity where required.
