-- Add listing_images.is_decorative and enforce accessible alt text when the
-- parent listing is pending_review or published.
-- This file is source-only in this change; it is not applied to any remote,
-- staging, or production database. It does not edit earlier migration files.
--
-- Why a trigger, not a table CHECK:
--   A CHECK on listing_images can only see columns of that table. The rule
--   depends on listings.status, so a plain CHECK cannot express it. Status
--   does not live on listing_images. The trigger function reads the parent
--   row (FOR NO KEY UPDATE) on image writes, and re-checks every image when a
--   listing becomes pending_review or published.
--
-- Visible content is at least one character that is not POSIX space, NBSP
-- (U+00A0), zero-width space (U+200B), or BOM (U+FEFF). The check uses chr()
-- so it does not depend on Unicode escapes in string literals
-- (standard_conforming_strings is on in Postgres 17).
--
-- Production listing_images is empty, so there is no backfill and no need
-- for NOT VALID. The column default is false (unchecked in the UI).
--
-- Idempotent: a second apply replaces the functions and recreates the
-- triggers with the same bodies; ADD COLUMN IF NOT EXISTS is a no-op.

begin;

alter table public.listing_images
  add column if not exists is_decorative boolean not null default false;

comment on column public.listing_images.is_decorative is
  'When true, the image is decorative and may have empty alt_text. When false, pending_review and published listings require alt_text with at least one visible character.';

create or replace function private.listing_alt_text_has_visible_content(p_alt_text text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select p_alt_text ~ ('[^[:space:]' || chr(160) || chr(8203) || chr(65279) || ']')
$$;

revoke all on function private.listing_alt_text_has_visible_content(text) from public, anon, authenticated;

create or replace function private.enforce_listing_image_accessible_alt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  listing_status text;
  actor_id uuid := (select auth.uid());
  actor_role text := coalesce((select auth.role()), '');
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
        and not (image.is_decorative or private.listing_alt_text_has_visible_content(image.alt_text))
    ) then
      raise exception 'listing_image_alt_required'
        using errcode = '23514';
    end if;
    return new;
  end if;

  -- Do not lock or read listings.status until the caller is allowed to see it.
  -- auth.uid() is null, or auth.role() is service_role, for service-role and
  -- maintenance paths; those skip the ownership check.
  if actor_id is not null and actor_role is distinct from 'service_role' then
    if not private.is_admin() and not exists (
      select 1
      from public.listings as listing
      where listing.id = new.listing_id
        and listing.owner_id = actor_id
    ) then
      raise exception 'listing_image_access_denied'
        using errcode = '42501';
    end if;
  end if;

  select listing.status
  into listing_status
  from public.listings as listing
  where listing.id = new.listing_id
  for no key update;

  if listing_status in ('pending_review', 'published')
     and not (new.is_decorative or private.listing_alt_text_has_visible_content(new.alt_text)) then
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
