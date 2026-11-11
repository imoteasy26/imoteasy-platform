create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.account_type = 'admin'
  );
$$;
revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to authenticated;

create or replace function public.guard_listing_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.owner_id is distinct from (select auth.uid()) and not private.is_admin() then
      raise exception 'Listing owner must match the authenticated user';
    end if;
    if new.status not in ('draft', 'pending_review') and not private.is_admin() then
      raise exception 'Listings must be submitted for review';
    end if;
    if new.published_at is not null and not private.is_admin() then
      raise exception 'Only administrators may set publication time';
    end if;
    return new;
  end if;

  if new.owner_id is distinct from old.owner_id and not private.is_admin() then
    raise exception 'Listing ownership cannot be changed';
  end if;
  if new.published_at is distinct from old.published_at and not private.is_admin() then
    raise exception 'Only administrators may set publication time';
  end if;
  if new.status is distinct from old.status and not private.is_admin() then
    if old.owner_id is distinct from (select auth.uid()) then
      raise exception 'Only the owner or an administrator may change this listing';
    end if;
    if not (
      (old.status in ('draft', 'rejected') and new.status = 'pending_review') or
      (old.status = 'published' and new.status in ('archived', 'sold')) or
      (old.status = 'archived' and new.status = 'draft')
    ) then
      raise exception 'This listing status transition is not allowed';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.guard_profile_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.account_type is distinct from old.account_type and not private.is_admin() then
    raise exception 'Profile roles may only be changed by an administrator';
  end if;
  return new;
end;
$$;

drop policy profiles_read on public.profiles;
drop policy listings_read_admin on public.listings;
drop policy listings_manage_admin on public.listings;
drop policy listing_images_read_admin on public.listing_images;
drop policy listing_images_manage_admin on public.listing_images;
drop policy inquiries_read_participant on public.inquiries;
drop policy reports_read_reporter on public.listing_reports;
drop policy reports_manage_admin on public.listing_reports;
drop policy private_details_read_owner_admin on public.private_listing_details;
drop policy private_details_manage_admin on public.private_listing_details;

revoke all on function public.is_admin() from public, anon, authenticated;
drop function public.is_admin();
revoke all on function public.create_profile_for_user() from public, anon, authenticated;
revoke all on function public.guard_listing_changes() from public, anon, authenticated;
revoke all on function public.guard_profile_role() from public, anon, authenticated;
revoke all on function public.limit_user_submissions() from public, anon, authenticated;

create policy profiles_read_public on public.profiles for select to anon
  using (exists (select 1 from public.listings l where l.owner_id = profiles.id and l.status = 'published'));
create policy profiles_read_authenticated on public.profiles for select to authenticated
  using (
    id = (select auth.uid()) or private.is_admin() or
    exists (select 1 from public.listings l where l.owner_id = profiles.id and l.status = 'published')
  );

create policy listings_read_admin on public.listings for select to authenticated
  using (private.is_admin());
create policy listings_manage_admin on public.listings for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

create policy listing_images_read_admin on public.listing_images for select to authenticated
  using (private.is_admin());
create policy listing_images_manage_admin on public.listing_images for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

create policy inquiries_read_participant on public.inquiries for select to authenticated
  using (
    sender_id = (select auth.uid()) or private.is_admin() or
    exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = (select auth.uid()))
  );

create policy reports_read_reporter on public.listing_reports for select to authenticated
  using (reporter_id = (select auth.uid()) or private.is_admin());
create policy reports_manage_admin on public.listing_reports for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

create policy private_details_read_owner_admin on public.private_listing_details for select to authenticated
  using (
    private.is_admin() or exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = (select auth.uid()))
  );
create policy private_details_manage_admin on public.private_listing_details for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

create index favorites_listing_id_idx on public.favorites (listing_id);
create index reports_listing_id_idx on public.listing_reports (listing_id);
create index reports_reporter_created_idx on public.listing_reports (reporter_id, created_at desc);
