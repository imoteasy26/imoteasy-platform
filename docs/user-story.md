# Imoteasy end-to-end user story

## Primary story

As a person looking for a home in Bulgaria, I can search current properties by location and practical criteria, compare their details and photos, and contact the owner without being shown private profile data or an exact address. As a seller, I can manage my own listing and respond to inquiries. As a moderator, I can review submissions and reports without giving ordinary users administrative access.

## Seeker journey

1. A visitor lands on the home page and starts a GET search by city or neighborhood, transaction type, and property type.
2. The visitor refines the published listing results with location, price, area, room, sort, pagination, and map/list controls. Invalid or out-of-range query values are ignored or bounded by the search parser.
3. A listing detail page presents its public description, attributes, photos, and approximate map location. The exact street address and seller phone are not public listing fields.
4. A visitor with an account can save or remove a favorite. A signed-out visitor is directed to sign in before the write.
5. A signed-in visitor can submit a validated inquiry to a published listing or submit a report. The server verifies the listing ID, slug, and published state before inserting.

## Seller journey

1. The seller creates an account with email and password, confirms the email through `/auth/callback`, and signs in.
2. The seller updates a display name and private phone number. The phone is stored separately from the public profile and protected by owner/admin RLS.
3. The seller fills the listing wizard, chooses an approximate location, selects up to eight JPG/PNG/WebP photos, and submits. The app saves a draft, uploads files under an owner/listing-specific Storage path, verifies image signatures and size on the server, writes image metadata, and requests moderator review.
4. In the dashboard, the seller can edit all listing fields, manage photos, open the public listing when published, and change supported listing statuses. A draft can be permanently deleted with confirmation; published listings are archived instead to preserve history.
5. The seller reviews inquiries received for their own listings, opens an email reply, and moves each inquiry through new, read, replied, and archived states.

## Moderator journey

1. A user whose profile has the admin role opens the protected moderation area; other users are redirected away.
2. The moderator reviews pending listings and the private address available to authorized admins, then approves or rejects a listing.
3. The moderator reviews new reports and marks each reviewed or actioned.

## Acceptance criteria

- Only published listings appear in public search and detail routes.
- Every listing mutation is scoped to the authenticated owner or authorized moderator and remains protected by Supabase RLS.
- Exact addresses and profile phone numbers are not included in public listing queries.
- Inquiry status is constrained to `new`, `read`, `replied`, or `archived`; owners can manage statuses only for their listings.
- Uploads are limited to eight images per listing, 8 MB per image, and JPG/PNG/WebP signatures.
- A draft cannot be submitted for review until it has at least one registered image.
