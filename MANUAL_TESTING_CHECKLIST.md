# Manual QA Checklist

Run this against an isolated Supabase test project after reviewing and applying `supabase/migrations/20261111000300_core_mvp_hardening.sql`. Do not use production accounts or apply this migration to the current app-matched project as part of this code change. Create test users through the app's sign-up flow and confirm their email; never insert directly into `auth.users`.

## Anonymous marketplace

- [ ] Browse `/imoti`; verify counts, stable sorting, page 1/2 boundaries, filters (including floor `-1`), and empty/error states.
- [ ] Toggle the map; verify markers show neighborhood-level coordinates, not the exact owner-selected point.
- [ ] Open a published listing; verify signed photo URLs load, public profile name is shown without phone/address, and price history is readable.
- [ ] Verify unpublished listing images cannot be fetched anonymously, and exact coordinates/address/private profile fields are not readable through public table access.
- [ ] Confirm `/robots.txt` excludes account, admin, auth, dashboard, and publish routes; `/sitemap.xml` contains only public routes and published listings.

## Account and owner flows

- [ ] Register with an invalid/empty display name; verify validation. Register with a real test mailbox and confirm the email.
- [ ] Request a password reset; verify the generic response, callback to `/auth/update-password`, password validation, and successful sign-in with the new password.
- [ ] Create a draft with an exact location; verify the public listing row is rounded and private details retain exact coordinates.
- [ ] Upload JPG, PNG, and WebP files within 8 MB; verify invalid signatures, unsupported types, oversized files, duplicate paths, and more than eight images are rejected.
- [ ] Submit the draft for review, approve it as admin, and verify it appears publicly; confirm owner edits and image removals remain scoped to the owner.
- [ ] Save a filtered search, disable/re-enable it, delete it, and verify only its owner can read or change it.
- [ ] Publish a matching listing and verify an in-app alert appears once; favorite a published listing, lower its price, and verify a price-drop alert and history row.
- [ ] Send an inquiry; verify the listing owner receives an in-app notification and can change inquiry status.

## Admin and authorization

- [ ] Verify non-admin users cannot reach admin pages or mutate moderation state.
- [ ] Verify admin approval/rejection and report updates continue to work after the RLS policy consolidation.
- [ ] Verify anonymous users cannot create/update/delete listings, reports, saved searches, notifications, price history, or private details.
- [ ] Verify database triggers reject direct attempts to store precise public coordinates and only allow published-photo reads or owner/admin access.

## Broker OS foundation (P1)

Run only against an isolated Supabase test project after reviewing and applying both source migrations. Use separate, confirmed-email test users for each organization and role; do not use production data.

- [ ] Create a broker workspace; verify the owner membership and a 30-day Professional trial start only after terms acceptance, with no payment method, price, auto-renewal, or charge.
- [ ] Retry activation and create a second workspace with the same broker; verify the database rejects a second trial.
- [ ] Verify plan entitlements and trial expiry gate listing management, CRM, tasks, viewings, and transaction updates server-side.
- [ ] Invite a confirmed-email user with each permitted role; verify wrong-email, expired, reused, and malformed tokens are rejected and no invite can grant owner/platform-admin role.
- [ ] As a second organization, attempt direct-ID reads and writes against the first organization’s memberships, leads, tasks, appointments, deals, usage, attribution, listing details, and images; verify RLS denies access.
- [ ] Convert one marketplace inquiry to a CRM lead twice; verify one lead/contact reference, preserved original inquiry, correct organization, and an audit event.
- [ ] Assign a lead to an active organization member; verify unauthorized assignments and non-member updates are denied and history is appended.
- [ ] Create/update/complete tasks; verify assigned-user/admin controls and task history.
- [ ] Schedule, confirm, reschedule, cancel, and complete a viewing; verify invalid cross-organization listing/lead references fail and outcome history is retained.
- [ ] Move a transaction through the supported stages; verify timeline events and that only an authorized platform admin can mark a signed deal completed.
- [ ] Submit attribution UTM/referrer values; verify the record is scoped to the listing organization and no fingerprint or unnecessary personal data is collected.
- [ ] Create a shared agency listing, edit it from an authorized team member, and verify read-only, removed, or expired members cannot edit or read private listing details.

## Automated checks

- [ ] `pnpm run typecheck`
- [ ] `pnpm test`
- [ ] `pnpm run build`
- [ ] Browser smoke checks at desktop (966×636) and mobile (375×812), without creating or changing real user data.
