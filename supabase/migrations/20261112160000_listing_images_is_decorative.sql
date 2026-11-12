-- Add listing_images.is_decorative and enforce accessible alt text when the
-- parent listing is pending_review or published.
-- This file is source-only in this change; it is not applied to any remote,
-- staging, or production database. It does not edit earlier migration files.
--
-- Why a trigger, not a table CHECK:
--   A CHECK on listing_images can only see columns of that table. The rule
--   depends on listings.status, so a plain CHECK cannot express it. Status
--   does not live on listing_images. The trigger function reads the parent
--   row (FOR SHARE) on image writes, and re-checks every image when a
--   listing becomes pending_review or published.
--
-- Production listing_images is empty, so there is no backfill and no need
-- for NOT VALID. The column default is false (unchecked in the UI).
--
-- Idempotent: a second apply replaces the function and recreates the
-- triggers with the same bodies; ADD COLUMN IF NOT EXISTS is a no-op.

begin;

alter table public.listing_images
  add column if not exists is_decorative boolean not null default false;

comment on column public.listing_images.is_decorative is
  'When true, the image is decorative and may have empty alt_text. When false, pending_review and published listings require non-empty trimmed alt_text.';

create or replace function private.enforce_listing_image_accessible_alt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  listing_status text;
begin
  if tg_table_name = 'listings' then
    if tg_op = 'UPDATE' and new.status is not distinct from old.status then
      return new;
    end if;
    if new.status not in ('pending_review', 'published') then
      return new;
    end if;
    if exists (
      select 1
      from public.listing_images as image
      where image.listing_id = new.id
        and not (image.is_decorative or length(btrim(image.alt_text)) > 0)
    ) then
      raise exception 'listing_image_alt_required'
        using errcode = '23514';
    end if;
    return new;
  end if;

  select listing.status
  into listing_status
  from public.listings as listing
  where listing.id = new.listing_id
  for share;

  if listing_status in ('pending_review', 'published')
     and not (new.is_decorative or length(btrim(new.alt_text)) > 0) then
    raise exception 'listing_image_alt_required'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_listing_image_accessible_alt() from public, anon, authenticated;

drop trigger if exists listing_images_enforce_accessible_alt on public.listing_images;
create trigger listing_images_enforce_accessible_alt
  before insert or update of alt_text, is_decorative, listing_id on public.listing_images
  for each row
  execute function private.enforce_listing_image_accessible_alt();

drop trigger if exists listings_enforce_accessible_alt on public.listings;
create trigger listings_enforce_accessible_alt
  before insert or update of status on public.listings
  for each row
  execute function private.enforce_listing_image_accessible_alt();

commit;
