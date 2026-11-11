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

## Automated checks

- [ ] `pnpm run typecheck`
- [ ] `pnpm test`
- [ ] `pnpm run build`
- [ ] Browser smoke checks at desktop (966×636) and mobile (375×812), without creating or changing real user data.
