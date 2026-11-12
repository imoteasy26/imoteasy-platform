-- ROLLBACK for 20261112160000_listing_images_is_decorative.sql.
-- Apply BEFORE 20261112150000_org_rls_followups.rollback.sql.
-- Manual, reviewed use only (never part of the migration chain). Run with
-- `psql -v ON_ERROR_STOP=1 --single-transaction -f <this file>`.
--
-- Drops the accessible-alt triggers, the enforcement functions, and the
-- is_decorative column. Restores the listing_images write policies from
-- 20261112000000_broker_os_foundation.sql. Does not touch
-- listing_images.alt_text or earlier migrations.

drop trigger if exists listing_images_enforce_accessible_alt on public.listing_images;
drop trigger if exists listings_enforce_accessible_alt on public.listings;

drop policy if exists listing_images_insert_access on public.listing_images;
create policy listing_images_insert_access on public.listing_images for insert to authenticated
with check (exists (
  select 1 from public.listings as listing
  where listing.id = listing_images.listing_id
    and (private.is_admin()
      or (listing.owner_id = (select auth.uid()) and (listing.organization_id is null or private.has_broker_entitlement(listing.organization_id, 'listing_management')))
      or (private.has_organization_role(listing.organization_id, array['owner', 'agency_admin', 'broker']::text[])
        and private.has_broker_entitlement(listing.organization_id, 'listing_management')))
));

drop policy if exists listing_images_update_access on public.listing_images;
create policy listing_images_update_access on public.listing_images for update to authenticated
using (exists (
  select 1 from public.listings as listing
  where listing.id = listing_images.listing_id
    and (private.is_admin()
      or (listing.owner_id = (select auth.uid()) and (listing.organization_id is null or private.has_broker_entitlement(listing.organization_id, 'listing_management')))
      or (private.has_organization_role(listing.organization_id, array['owner', 'agency_admin', 'broker']::text[])
        and private.has_broker_entitlement(listing.organization_id, 'listing_management')))
))
with check (exists (
  select 1 from public.listings as listing
  where listing.id = listing_images.listing_id
    and (private.is_admin()
      or (listing.owner_id = (select auth.uid()) and (listing.organization_id is null or private.has_broker_entitlement(listing.organization_id, 'listing_management')))
      or (private.has_organization_role(listing.organization_id, array['owner', 'agency_admin', 'broker']::text[])
        and private.has_broker_entitlement(listing.organization_id, 'listing_management')))
));

drop policy if exists listing_images_delete_access on public.listing_images;
create policy listing_images_delete_access on public.listing_images for delete to authenticated
using (exists (
  select 1 from public.listings as listing
  where listing.id = listing_images.listing_id
    and (private.is_admin()
      or (listing.owner_id = (select auth.uid()) and (listing.organization_id is null or private.has_broker_entitlement(listing.organization_id, 'listing_management')))
      or (private.has_organization_role(listing.organization_id, array['owner', 'agency_admin', 'broker']::text[])
        and private.has_broker_entitlement(listing.organization_id, 'listing_management')))
));

drop function if exists private.enforce_listing_image_accessible_alt();
drop function if exists private.listing_images_missing_accessible_alt(uuid);
drop function if exists private.listing_status_for_alt_enforcement(uuid);
drop function if exists private.listing_alt_caller_is_privileged();
drop function if exists private.can_manage_listing(uuid);
drop function if exists private.listing_alt_text_has_visible_content(text);
drop function if exists private.listing_alt_invisible_chars();

revoke usage on schema private from service_role;

alter table public.listing_images drop column if exists is_decorative;
