-- ROLLBACK for 20261112160000_listing_images_is_decorative.sql.
-- Apply BEFORE 20261112150000_org_rls_followups.rollback.sql.
-- Manual, reviewed use only (never part of the migration chain). Run with
-- `psql -v ON_ERROR_STOP=1 --single-transaction -f <this file>`.
--
-- Drops the accessible-alt triggers, the enforcement function, and the
-- is_decorative column. Does not touch listing_images.alt_text or earlier
-- migrations.

drop trigger if exists listing_images_enforce_accessible_alt on public.listing_images;
drop trigger if exists listings_enforce_accessible_alt on public.listings;
drop function if exists private.enforce_listing_image_accessible_alt();

alter table public.listing_images drop column if exists is_decorative;
