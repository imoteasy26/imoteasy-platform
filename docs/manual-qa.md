# Manual QA checklist

Use a confirmed test account and a second account for ownership/privacy checks. Supabase email confirmation is enabled by default; use a mailbox you control. Do not create test identities by inserting directly into `auth.users`.

## Public discovery

- [ ] Open the home page at desktop and mobile widths; confirm the search controls have labels and fit without horizontal overflow.
- [ ] Submit a city/neighborhood, transaction type, and property type; confirm the URL carries the filters and the results page preserves them.
- [ ] Try minimum/maximum price, area, rooms, sorting, and pagination; confirm result counts and links remain consistent.
- [ ] Toggle map/list view and confirm map markers correspond to the visible public results.
- [ ] Open a published listing; verify its photos, details, approximate location, and that the exact address and seller phone are absent.
- [ ] Open an unknown or non-published slug; confirm it does not reveal a draft or pending listing.

## Authentication and profile

- [ ] Submit sign-up with missing display name, invalid email, and a short password; confirm accessible inline validation.
- [ ] Sign up with a real test mailbox, follow the confirmation link, and confirm the callback establishes a session.
- [ ] Sign in with valid and invalid credentials; confirm the UI uses generic credential messaging and handles rate limits.
- [ ] Refresh a protected route and confirm the session persists; sign out and confirm protected routes return to sign-in.
- [ ] Update the profile name and phone. Confirm the account owner can read the phone and a different account cannot.

## Favorites, inquiries, and reports

- [ ] Save and remove a favorite while signed in; refresh and confirm the state persists.
- [ ] Try a favorite while signed out; confirm sign-in is required and the return destination is preserved.
- [ ] Submit a valid inquiry to a published listing; confirm it appears only in that listing owner's dashboard.
- [ ] Submit invalid or oversized inquiry fields; confirm validation blocks the write.
- [ ] Change inquiry status through new → read → replied → archived and back to new; verify each state persists.
- [ ] Open the email reply link and verify the recipient and encoded subject are correct.
- [ ] Submit a listing report and confirm it appears in the moderator queue, not a seller's inbox.

## Listing lifecycle and photos

- [ ] Try to submit a listing with invalid title, description, price, area, or no photos; confirm validation prevents submission.
- [ ] Select an unsupported file, an image over 8 MB, and more than the remaining image capacity; confirm each is rejected with a useful message.
- [ ] Upload valid JPG, PNG, and WebP images; confirm the first is the cover and the listing enters pending review.
- [ ] Approve and reject a listing as admin; confirm it is public only after approval and the owner sees the new state.
- [ ] Edit every listing field and the map location; confirm exact address remains private and changes persist.
- [ ] Add photos to an owned listing; delete a non-cover image and then the cover; confirm the next image becomes the cover.
- [ ] Delete a draft and accept the confirmation; confirm the draft and its stored photos disappear. Cancel once and confirm nothing is deleted.
- [ ] Archive a published listing; confirm it no longer appears in public search while inquiry/history records remain available.

## Authorization, accessibility, and responsive behavior

- [ ] As a non-admin, open `/admin`; confirm access is denied or redirected.
- [ ] Attempt to edit another user's listing or inquiry by changing an ID in a request; confirm RLS/server ownership checks reject it.
- [ ] Use keyboard-only navigation for search, auth, profile, listing edit, photo deletion, and moderation forms; confirm visible focus and useful labels.
- [ ] Check narrow mobile layout for clipped controls, overlapping action buttons, and off-screen content.
- [ ] Check browser console and network failures while exercising upload, server actions, and auth callback.
