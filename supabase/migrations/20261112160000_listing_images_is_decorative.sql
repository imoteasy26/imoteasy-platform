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
-- Visible content is at least one character outside a fixed, locale-independent
-- list of invisible and space characters (ASCII TAB, LF, VT, FF, CR, SPACE,
-- plus U+0085, U+00A0, U+00AD, U+115F, U+1160, U+1680, U+180E, U+2000-U+200F,
-- U+2028, U+2029, U+202F, U+205F, U+2060-U+2064, U+2800, U+3000, U+3164,
-- U+FEFF, and U+FFA0). The check uses translate(chr()) so it does not depend
-- on [:space:], on a regex locale, or on Unicode escapes in string literals
-- (standard_conforming_strings is on in Postgres 17). Because the result
-- depends only on the input and that fixed list, the helper is genuinely
-- IMMUTABLE.
--
-- The trigger itself is SECURITY INVOKER. Privileged reads (ownership that
-- mirrors listing_images RLS, and the parent status lock) live in SECURITY
-- DEFINER helpers. Inside those helpers current_user is the function owner,
-- so the privileged-role check reads current_setting('role', true) instead.
-- That GUC is the caller's SET ROLE (under PostgREST, authenticated or
-- service_role, while session_user is authenticator). It cannot be spoofed
-- with set_config('role', ...) because PostgreSQL checks role membership,
-- the same as SET ROLE. Do not use auth.role() or a JWT claim. The caller
-- is privileged only when the GUC is service_role, or when it is none and
-- session_user is postgres or supabase_admin. Every other caller must pass
-- can_manage_listing, and the helpers raise 42501 before taking any lock.
--
-- Production listing_images is empty, so there is no backfill and no need
-- for NOT VALID. The column default is false (unchecked in the UI).
--
-- Idempotent: a second apply replaces the functions and recreates the
-- triggers and listing_images write policies with the same bodies;
-- ADD COLUMN IF NOT EXISTS is a no-op.

begin;

alter table public.listing_images
  add column if not exists is_decorative boolean not null default false;

comment on column public.listing_images.is_decorative is
  'When true, the image is decorative and may have empty alt_text. When false, pending_review and published listings require alt_text with at least one visible character.';

-- Fixed invisible/space list, identical to LISTING_ALT_INVISIBLE_CODEPOINTS
-- in lib/listing-alt-text.ts. Built from chr() so the body stays IMMUTABLE.
create or replace function private.listing_alt_invisible_chars()
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select
    chr(9) || chr(10) || chr(11) || chr(12) || chr(13) || chr(32)
    || chr(133) || chr(160) || chr(173)
    || chr(4447) || chr(4448) || chr(5760) || chr(6158)
    || chr(8192) || chr(8193) || chr(8194) || chr(8195)
    || chr(8196) || chr(8197) || chr(8198) || chr(8199)
    || chr(8200) || chr(8201) || chr(8202) || chr(8203)
    || chr(8204) || chr(8205) || chr(8206) || chr(8207)
    || chr(8232) || chr(8233) || chr(8239) || chr(8287)
    || chr(8288) || chr(8289) || chr(8290) || chr(8291) || chr(8292)
    || chr(10240) || chr(12288) || chr(12644) || chr(65279) || chr(65440)
$$;

create or replace function private.listing_alt_text_has_visible_content(p_alt_text text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select length(translate(coalesce(p_alt_text, ''), private.listing_alt_invisible_chars(), '')) > 0
$$;

revoke all on function private.listing_alt_invisible_chars() from public, anon;
revoke all on function private.listing_alt_text_has_visible_content(text) from public, anon;
grant execute on function private.listing_alt_invisible_chars() to authenticated, service_role;
grant execute on function private.listing_alt_text_has_visible_content(text) to authenticated, service_role;

-- Exact mirror of listing_images insert/update/delete RLS in
-- 20261112000000_broker_os_foundation.sql (private.is_admin, personal or
-- org owner with listing_management, or owner/agency_admin/broker with
-- that entitlement). Used by the invoker trigger and the rewritten policies.
create or replace function private.can_manage_listing(p_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.listings as listing
    where listing.id = p_listing_id
      and (
        private.is_admin()
        or (
          listing.owner_id = (select auth.uid())
          and (
            listing.organization_id is null
            or private.has_broker_entitlement(listing.organization_id, 'listing_management')
          )
        )
        or (
          private.has_organization_role(listing.organization_id, array['owner', 'agency_admin', 'broker']::text[])
          and private.has_broker_entitlement(listing.organization_id, 'listing_management')
        )
      )
  );
$$;

revoke all on function private.can_manage_listing(uuid) from public, anon;
grant execute on function private.can_manage_listing(uuid) to authenticated, service_role;

-- Caller's SET ROLE, not current_user (which is the DEFINER owner) and not
-- a JWT claim. set_config('role', ...) and SET ROLE both check membership.
create or replace function private.listing_alt_caller_is_privileged()
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    current_setting('role', true) = 'service_role'
    or (
      current_setting('role', true) = 'none'
      and session_user in ('postgres', 'supabase_admin')
    )
$$;

revoke all on function private.listing_alt_caller_is_privileged() from public, anon;
grant execute on function private.listing_alt_caller_is_privileged() to authenticated, service_role;

-- Privileged parent-row lock and status read, so the invoker trigger does
-- not depend on the caller's UPDATE rights on listings. The access check
-- runs before FOR NO KEY UPDATE so a denied caller never holds the lock.
create or replace function private.listing_status_for_alt_enforcement(p_listing_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  listing_status text;
begin
  if not private.listing_alt_caller_is_privileged()
     and not private.can_manage_listing(p_listing_id) then
    raise exception 'listing_image_access_denied'
      using errcode = '42501';
  end if;

  select listing.status
  into listing_status
  from public.listings as listing
  where listing.id = p_listing_id
  for no key update;
  return listing_status;
end;
$$;

revoke all on function private.listing_status_for_alt_enforcement(uuid) from public, anon;
grant execute on function private.listing_status_for_alt_enforcement(uuid) to authenticated, service_role;

-- Privileged scan of images belonging to a listing whose status is changing.
create or replace function private.listing_images_missing_accessible_alt(p_listing_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.listing_alt_caller_is_privileged()
     and not private.can_manage_listing(p_listing_id) then
    raise exception 'listing_image_access_denied'
      using errcode = '42501';
  end if;

  return exists (
    select 1
    from public.listing_images as image
    where image.listing_id = p_listing_id
      and not (image.is_decorative or private.listing_alt_text_has_visible_content(image.alt_text))
  );
end;
$$;

revoke all on function private.listing_images_missing_accessible_alt(uuid) from public, anon;
grant execute on function private.listing_images_missing_accessible_alt(uuid) to authenticated, service_role;

grant usage on schema private to service_role;

create or replace function private.enforce_listing_image_accessible_alt()
returns trigger
language plpgsql
security invoker
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
    if private.listing_images_missing_accessible_alt(new.id) then
      raise exception 'listing_image_alt_required'
        using errcode = '23514';
    end if;
    return new;
  end if;

  -- Same privileged-role rule as the DEFINER helpers: the role GUC, not
  -- auth.role() or a JWT claim. current_user also works here because this
  -- trigger is SECURITY INVOKER, but the shared helper keeps both paths
  -- consistent, including postgres/supabase_admin with role=none.
  if not private.listing_alt_caller_is_privileged() then
    if not private.can_manage_listing(new.listing_id) then
      raise exception 'listing_image_access_denied'
        using errcode = '42501';
    end if;
  end if;

  listing_status := private.listing_status_for_alt_enforcement(new.listing_id);

  if listing_status in ('pending_review', 'published')
     and not (new.is_decorative or private.listing_alt_text_has_visible_content(new.alt_text)) then
    raise exception 'listing_image_alt_required'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_listing_image_accessible_alt() from public, anon, authenticated, service_role;

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

-- Same predicate as before, expressed through the shared helper so the
-- trigger and the policies cannot drift. Who is allowed does not change.
drop policy if exists listing_images_insert_access on public.listing_images;
create policy listing_images_insert_access on public.listing_images for insert to authenticated
with check (private.can_manage_listing(listing_id));

drop policy if exists listing_images_update_access on public.listing_images;
create policy listing_images_update_access on public.listing_images for update to authenticated
using (private.can_manage_listing(listing_id))
with check (private.can_manage_listing(listing_id));

drop policy if exists listing_images_delete_access on public.listing_images;
create policy listing_images_delete_access on public.listing_images for delete to authenticated
using (private.can_manage_listing(listing_id));

commit;
