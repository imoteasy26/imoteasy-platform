# Security and application audit

**Review date:** 2026-11-11
**Scope:** Next.js routes and server actions, Supabase schema/RLS, file uploads, security headers, and the app's current manual QA coverage. This is a code/configuration review, not a penetration test.

## Verified controls

- Supabase Auth uses the public publishable key with the server/browser SSR clients; production auth cookies are marked `Secure`.
- Listing writes, status changes, inquiry updates, profile edits, and photo management use the authenticated session and owner-scoped queries. Database RLS remains the final authorization boundary; no service-role key is used by app code.
- Inquiry inserts validate the submitted listing ID, slug, and published state. The database constrains inquiry statuses to `new`, `read`, `replied`, and `archived`.
- Profile phone numbers are stored in `private_profile_details` under owner/admin RLS. The app no longer reads or writes `profiles.phone`. The live migration check found **0** phone rows in `profiles` and **0** phone rows in `private_profile_details` at review time, so there was no historical phone data to move.
- Exact listing addresses remain in `private_listing_details`; public listing pages display only city/neighborhood and approximate coordinates.
- Image uploads use owner/listing-specific paths, an eight-image limit, an 8 MB limit, allowed extensions, and server-side signature checks. Delete actions verify ownership and remove the Storage object and metadata.
- Permanent deletion is limited to drafts and requires confirmation. Published listings use archive/status changes to preserve inquiry and moderation history.
- `next.config.mjs` sets `X-Content-Type-Options`, `Referrer-Policy`, HSTS, `X-Frame-Options`, and a restrictive `Permissions-Policy`. CSP is currently **report-only** to avoid breaking the v0 preview.
- The Supabase security and health advisor scans returned no findings. The database performance scan reports unused-index INFO notices and a multiple-permissive-policy warning; these are review items, not evidence of an authorization bypass.

## Remaining risks and follow-up

1. CSP is report-only, so it does not block script injection. Review deployed reports, add a nonce strategy compatible with Next.js hydration and the approved Supabase/OpenStreetMap origins, then move to enforcing CSP.
2. Auth form calls are made by the browser directly to Supabase Auth. The UI normalizes credential errors and Supabase provides rate limits, but raw provider responses remain visible to a browser client. If stronger account-enumeration resistance is required, route auth operations through a server boundary with shared rate limiting.
3. The manual cross-account/RLS flows require confirmed test users. They were not exercised with real credentials in this review; follow [manual-qa.md](./manual-qa.md) before production launch.
4. The performance advisor's unused-index notices should be revisited after representative production traffic. Do not drop indexes solely because a fresh/low-traffic project has not used them.

## Checks run

- `pnpm run typecheck` (`tsc --noEmit`) passed after the final source changes.
- `git diff --check` passed after the final source and documentation changes.
- Supabase migration and read-only schema/RLS checks completed; the migration copied no phone values because no non-null profile phones existed.
- Browser QA at the desktop viewport verified the home page and a search submission with filters. The browser session timed out when navigating to the follow-up auth check, so authenticated CRUD still requires the manual checklist and a confirmed test account.
