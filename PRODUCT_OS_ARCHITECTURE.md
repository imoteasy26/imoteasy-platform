# Imoteasy OS Product Architecture

## Product direction

Imoteasy is evolving from a property-listing marketplace into a transaction-oriented operating system. The marketplace remains the public acquisition and discovery surface; broker, agency, investor, seller, and administrator workspaces are role-specific views over shared listing, identity, CRM, transaction, event, and attribution records.

The product is successful when participants can move from discovery to a verified transaction without losing the context, ownership, permissions, or audit history of the work.

## Product invariants

1. A listing has one canonical record and stable identity throughout its lifecycle.
2. An inquiry remains the original marketplace inquiry. CRM conversion creates a linked lead, not a second copy of the inquiry.
3. Organization ownership is explicit and tenant-scoped. Membership is the authority for organization access; a user-supplied organization ID is never authorization.
4. Every consequential status transition has an attributable event.
5. Broker trial, entitlements, AI usage, commission terms, and rewards are sourced from persisted configuration and agreements, not UI constants.
6. AI-generated content is a draft until a human approves it. No external publishing or financial payout is implicit.
7. Asking prices, verified transaction prices, estimates, and user assumptions are distinct data classes.
8. Personal, financial, and legal records are private by default; sensitive legal documents are not stored in public buckets.
9. Missing schema, market data, provider metrics, or consent produces a clear unavailable/insufficient-data state—not fabricated results.
10. Existing marketplace routes, accounts, and customer data remain compatible while new domains are introduced additively.

## Shared platform layers

### Identity and access

Supabase Auth supplies the person identity. Existing `profiles.account_type` remains compatible for marketplace and platform-admin behavior, but it is not the authority for organization membership. `organizations` and `organization_memberships` supply tenant and role context. Platform administrator authorization remains separate from organization roles.

### Domain services

- **Marketplace Core:** listings, search, images, favorites, inquiries, saved searches, notifications, moderation, and price history.
- **Identity and Organizations:** agencies, memberships, broker profiles, invitations, verification, and team permissions.
- **Broker OS:** dashboard, CRM, tasks, appointments, listings, marketing workspace, and performance.
- **Transaction OS:** linked parties and listings, offers, negotiation events, milestones, and completion verification.
- **Investor Intelligence:** investor criteria, watchlists, alerts, transparent opportunity calculations, and portfolio.
- **Commission and Seller Rewards:** signed agreements, versioned calculation basis, immutable ledger, approval, dispute, and payment state.
- **Attribution and Measurement:** privacy-conscious source and campaign events linked to listings, inquiries, leads, viewings, and verified deal outcomes.
- **Automation and AI:** scoped agent runs, drafts, approvals, authorized connectors, usage, and measured outcomes.

### Shared event and audit model

Domain tables hold current state; append-only event tables record who changed state, what changed, when, and the owning organization. Event records do not replace canonical rows. Internal notes, task updates, lead status changes, appointment outcomes, transaction milestones, approval decisions, and financial events must be attributable.

## Tenant model

- Each organization has explicit members with a bounded role set.
- Organization-owned records carry `organization_id`; authorization checks also verify an active membership and the required role.
- Records tied to a marketplace listing must validate that the listing belongs to, or is shared with, the same organization.
- Public listing visibility does not grant access to owner contact data, private coordinates, team notes, CRM records, or legal material.
- Row Level Security is the database boundary; server-side authorization is an additional boundary, not a substitute.
- Team invitations are created by an authorized owner/administrator and are accepted by the authenticated invitee. A member cannot grant themselves a privileged role.

## Broker activation and monetization

A broker's 30-day no-card trial is created only after required onboarding is completed. The assigned tier is the configurable professional tier. Trial dates and lifecycle state live in the database. Trial expiry does not charge or renew the account. Any paid conversion requires a future explicit billing flow and separately approved terms. Plan entitlements and usage caps are data, not hardcoded prices.

## Data and integration boundaries

- Existing Supabase marketplace data is preserved and extended with additive migrations.
- No production migration, environment-variable change, or payment activation is implicit in a code change.
- External social/email integrations are authorized business-account connections; unsupported publishing is a manual content-package workflow.
- AI usage, vendor metrics, attribution, and market evidence are stored with source and time context.
- No cross-broker reads, scraping, fingerprinting, unsolicited messages, or unaudited payouts.

## Existing capability inventory

### Present in the merged marketplace branch

- Next.js App Router and Supabase SSR authentication.
- Public listing search and detail pages, owner listing management, favorites, inquiries, reports, and admin moderation.
- Bounded search, approximate public coordinates, signed-image URL application logic, password recovery, saved-search and notification UI, price-history UI, SEO routes, and focused Vitest coverage.
- Versioned P0 migration `supabase/migrations/20261111000300_core_mvp_hardening.sql` prepared as source.

### Not yet operationally complete

- The P0 migration is not applied to an isolated database. The live app-matched project still requires verification of database/storage enforcement and migration history; application code alone does not make a public bucket private.
- Preview and Production Supabase project references have not been verified from non-secret metadata.
- Organization memberships, agency workspaces, broker trials, CRM leads, tasks, appointments, transaction pipeline, and attribution are not present in the current schema/code.
- P2 AI marketing, P3 investor intelligence, and P4 reward/payment execution are not implemented.

## Evolution rules

1. Keep migrations additive and version-controlled; do not edit Supabase's migration ledger by hand.
2. Use a disposable, correctly identified test target before applying DDL or claiming RLS acceptance.
3. Keep new routes gated until their required schema exists; display a migration-required state instead of silently writing to a partial schema.
4. Generate database types from the verified schema or keep authored migration contracts synchronized and test them.
5. Ship one domain milestone at a time and retain the existing marketplace regression suite.
