begin;

alter table public.private_listing_details
  add column if not exists exact_latitude double precision check (exact_latitude is null or exact_latitude between -90 and 90),
  add column if not exists exact_longitude double precision check (exact_longitude is null or exact_longitude between -180 and 180);

update public.private_listing_details as details
set exact_latitude = coalesce(details.exact_latitude, listings.latitude),
    exact_longitude = coalesce(details.exact_longitude, listings.longitude)
from public.listings
where listings.id = details.listing_id
  and (listings.latitude is not null or listings.longitude is not null);

insert into public.private_listing_details (listing_id, exact_address, exact_latitude, exact_longitude)
select listings.id, '', listings.latitude, listings.longitude
from public.listings
where listings.latitude is not null or listings.longitude is not null
on conflict (listing_id) do update
set exact_latitude = coalesce(public.private_listing_details.exact_latitude, excluded.exact_latitude),
    exact_longitude = coalesce(public.private_listing_details.exact_longitude, excluded.exact_longitude);

update public.listings
set latitude = case when latitude is null then null else pg_catalog.round(latitude::numeric, 3)::double precision end,
    longitude = case when longitude is null then null else pg_catalog.round(longitude::numeric, 3)::double precision end
where latitude is not null or longitude is not null;

create or replace function public.approximate_listing_coordinates()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.latitude is not null then
    new.latitude := pg_catalog.round(new.latitude::numeric, 3)::double precision;
  end if;
  if new.longitude is not null then
    new.longitude := pg_catalog.round(new.longitude::numeric, 3)::double precision;
  end if;
  return new;
end;
$$;

revoke all on function public.approximate_listing_coordinates() from public, anon, authenticated;
drop trigger if exists listings_approximate_coordinates on public.listings;
create trigger listings_approximate_coordinates
before insert or update of latitude, longitude on public.listings
for each row execute function public.approximate_listing_coordinates();

create table if not exists public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  filters jsonb not null check (jsonb_typeof(filters) = 'object' and pg_catalog.pg_column_size(filters) <= 4096),
  filter_hash text not null check (filter_hash ~ '^[a-f0-9]{64}$'),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, filter_hash)
);

create index if not exists saved_searches_enabled_user_idx
  on public.saved_searches (enabled, user_id, created_at desc);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete cascade,
  type text not null check (type in ('saved_search_match', 'price_drop', 'inquiry_received')),
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) <= 500),
  href text not null check (left(href, 1) = '/' and left(href, 2) <> '//'),
  dedupe_key text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

create index if not exists notifications_user_unread_created_idx
  on public.notifications (user_id, is_read, created_at desc);

create table if not exists public.listing_price_history (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  previous_price numeric(12, 2) check (previous_price is null or previous_price > 0),
  new_price numeric(12, 2) not null check (new_price > 0),
  changed_at timestamptz not null default now()
);

create index if not exists listing_price_history_listing_changed_idx
  on public.listing_price_history (listing_id, changed_at desc);

insert into public.listing_price_history (listing_id, previous_price, new_price, changed_at)
select listings.id, null, listings.price_eur, coalesce(listings.published_at, listings.updated_at, listings.created_at)
from public.listings
where listings.status = 'published'
  and not exists (
    select 1 from public.listing_price_history
    where listing_price_history.listing_id = listings.id
  );

alter table public.saved_searches enable row level security;
alter table public.notifications enable row level security;
alter table public.listing_price_history enable row level security;

revoke all on public.saved_searches, public.notifications, public.listing_price_history from public, anon, authenticated;
grant select, insert, update, delete on public.saved_searches to authenticated;
grant select, update (is_read) on public.notifications to authenticated;
grant select on public.listing_price_history to anon, authenticated;

drop policy if exists saved_searches_manage_own on public.saved_searches;
create policy saved_searches_manage_own
  on public.saved_searches for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists notifications_read_own on public.notifications;
create policy notifications_read_own
  on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists notifications_mark_read_own on public.notifications;
create policy notifications_mark_read_own
  on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists listing_price_history_read_public on public.listing_price_history;
create policy listing_price_history_read_public
  on public.listing_price_history for select to anon
  using (exists (
    select 1 from public.listings
    where listings.id = listing_price_history.listing_id and listings.status = 'published'
  ));

drop policy if exists listing_price_history_read_authenticated on public.listing_price_history;
create policy listing_price_history_read_authenticated
  on public.listing_price_history for select to authenticated
  using (exists (
    select 1 from public.listings
    where listings.id = listing_price_history.listing_id
      and (listings.status = 'published' or listings.owner_id = (select auth.uid()) or private.is_admin())
  ));

create or replace function private.saved_search_matches(p_filters jsonb, p_listing public.listings)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  filter_value text;
begin
  if pg_catalog.jsonb_typeof(p_filters) is distinct from 'object' then
    return false;
  end if;

  filter_value := nullif(pg_catalog.btrim(p_filters ->> 'city'), '');
  if filter_value is not null and pg_catalog.strpos(pg_catalog.lower(p_listing.city), pg_catalog.lower(filter_value)) = 0 then
    return false;
  end if;

  filter_value := nullif(pg_catalog.btrim(p_filters ->> 'neighborhood'), '');
  if filter_value is not null and pg_catalog.strpos(pg_catalog.lower(coalesce(p_listing.neighborhood, '')), pg_catalog.lower(filter_value)) = 0 then
    return false;
  end if;

  filter_value := p_filters ->> 'propertyType';
  if filter_value is not null and filter_value <> p_listing.property_type then
    return false;
  end if;

  filter_value := p_filters ->> 'transactionType';
  if filter_value is not null and filter_value <> p_listing.transaction_type then
    return false;
  end if;

  filter_value := nullif(p_filters ->> 'minPrice', '');
  if filter_value is not null then
    if filter_value !~ '^[0-9]{1,10}(\.[0-9]{1,2})?$' then
      return false;
    end if;
    if p_listing.price_eur < filter_value::numeric then
      return false;
    end if;
  end if;

  filter_value := nullif(p_filters ->> 'maxPrice', '');
  if filter_value is not null then
    if filter_value !~ '^[0-9]{1,10}(\.[0-9]{1,2})?$' then
      return false;
    end if;
    if p_listing.price_eur > filter_value::numeric then
      return false;
    end if;
  end if;

  filter_value := nullif(p_filters ->> 'minArea', '');
  if filter_value is not null then
    if filter_value !~ '^[0-9]{1,7}(\.[0-9]{1,2})?$' then
      return false;
    end if;
    if p_listing.area_sqm < filter_value::numeric then
      return false;
    end if;
  end if;

  filter_value := nullif(p_filters ->> 'maxArea', '');
  if filter_value is not null then
    if filter_value !~ '^[0-9]{1,7}(\.[0-9]{1,2})?$' then
      return false;
    end if;
    if p_listing.area_sqm > filter_value::numeric then
      return false;
    end if;
  end if;

  filter_value := nullif(p_filters ->> 'rooms', '');
  if filter_value is not null then
    if filter_value !~ '^[0-9]{1,2}$' then
      return false;
    end if;
    if p_listing.rooms is distinct from filter_value::smallint then
      return false;
    end if;
  end if;

  filter_value := nullif(p_filters ->> 'bedrooms', '');
  if filter_value is not null then
    if filter_value !~ '^[0-9]{1,2}$' then
      return false;
    end if;
    if p_listing.bedrooms is distinct from filter_value::smallint then
      return false;
    end if;
  end if;

  filter_value := nullif(p_filters ->> 'floor', '');
  if filter_value is not null then
    if filter_value !~ '^-?[0-9]{1,3}$' then
      return false;
    end if;
    if p_listing.floor is distinct from filter_value::smallint then
      return false;
    end if;
  end if;

  filter_value := nullif(pg_catalog.btrim(p_filters ->> 'condition'), '');
  if filter_value is not null and pg_catalog.strpos(pg_catalog.lower(coalesce(p_listing.condition, '')), pg_catalog.lower(filter_value)) = 0 then
    return false;
  end if;

  filter_value := nullif(pg_catalog.btrim(p_filters ->> 'furnishing'), '');
  if filter_value is not null and pg_catalog.strpos(pg_catalog.lower(coalesce(p_listing.furnishing, '')), pg_catalog.lower(filter_value)) = 0 then
    return false;
  end if;

  filter_value := nullif(pg_catalog.btrim(p_filters ->> 'constructionType'), '');
  if filter_value is not null and pg_catalog.strpos(pg_catalog.lower(coalesce(p_listing.construction_type, '')), pg_catalog.lower(filter_value)) = 0 then
    return false;
  end if;

  return true;
end;
$$;

revoke all on function private.saved_search_matches(jsonb, public.listings) from public, anon, authenticated;

create or replace function public.notify_saved_search_matches()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_search record;
begin
  if new.status <> 'published' then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if old.status = 'published' then
      return new;
    end if;
  end if;

  for saved_search in
    select id, user_id, name, filters
    from public.saved_searches
    where enabled and user_id <> new.owner_id
  loop
    if private.saved_search_matches(saved_search.filters, new) then
      insert into public.notifications (user_id, listing_id, type, title, body, href, dedupe_key)
      values (
        saved_search.user_id,
        new.id,
        'saved_search_match',
        'Нова обява по запазено търсене',
        pg_catalog.left(new.title || ' · ' || new.city || ' · ' || saved_search.name, 500),
        '/imoti/' || new.slug,
        'saved-search:' || saved_search.id::text || ':' || new.id::text
      )
      on conflict (user_id, dedupe_key) do nothing;
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function public.notify_saved_search_matches() from public, anon, authenticated;
drop trigger if exists listings_notify_saved_search_matches on public.listings;
create trigger listings_notify_saved_search_matches
after insert or update on public.listings
for each row execute function public.notify_saved_search_matches();

create or replace function public.track_listing_price_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'published' then
      insert into public.listing_price_history (listing_id, previous_price, new_price)
      values (new.id, null, new.price_eur);
    end if;
    return new;
  end if;

  if new.status = 'published' and (old.status <> 'published' or new.price_eur is distinct from old.price_eur) then
    insert into public.listing_price_history (listing_id, previous_price, new_price)
    values (new.id, case when old.status = 'published' then old.price_eur else null end, new.price_eur);
  end if;

  if old.status = 'published' and new.status = 'published' and new.price_eur < old.price_eur then
    insert into public.notifications (user_id, listing_id, type, title, body, href, dedupe_key)
    select favorites.user_id,
           new.id,
           'price_drop',
           'Цената на запазен имот е намалена',
           pg_catalog.left(new.title || ' · ' || old.price_eur::text || ' € → ' || new.price_eur::text || ' €', 500),
           '/imoti/' || new.slug,
           'price-drop:' || new.id::text || ':' || pg_catalog.to_char(now() at time zone 'utc', 'YYYY-MM-DD')
    from public.favorites
    where favorites.listing_id = new.id and favorites.user_id <> new.owner_id
    on conflict (user_id, dedupe_key) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.track_listing_price_changes() from public, anon, authenticated;
drop trigger if exists listings_track_price_changes on public.listings;
create trigger listings_track_price_changes
after insert or update on public.listings
for each row execute function public.track_listing_price_changes();

create or replace function public.notify_listing_owner_of_inquiry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  listing_owner uuid;
  listing_slug text;
begin
  select owner_id, slug into listing_owner, listing_slug
  from public.listings where id = new.listing_id;

  if listing_owner is not null and listing_owner <> new.sender_id then
    insert into public.notifications (user_id, listing_id, type, title, body, href, dedupe_key)
    values (
      listing_owner,
      new.listing_id,
      'inquiry_received',
      'Ново запитване за твоя обява',
      pg_catalog.left(new.name || ' изпрати запитване за обява.', 500),
      '/dashboard#inquiries',
      'inquiry:' || new.id::text
    )
    on conflict (user_id, dedupe_key) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.notify_listing_owner_of_inquiry() from public, anon, authenticated;
drop trigger if exists inquiries_notify_listing_owner on public.inquiries;
create trigger inquiries_notify_listing_owner
after insert on public.inquiries
for each row execute function public.notify_listing_owner_of_inquiry();

drop trigger if exists saved_searches_set_updated_at on public.saved_searches;
create trigger saved_searches_set_updated_at
before update on public.saved_searches
for each row execute function public.set_updated_at();

update storage.buckets
set public = false,
    file_size_limit = 8388608,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']::text[]
where id = 'imoteasy-listings';

drop policy if exists imoteasy_images_public_read on storage.objects;
drop policy if exists imoteasy_images_owner_insert on storage.objects;
drop policy if exists imoteasy_images_owner_update on storage.objects;
drop policy if exists imoteasy_images_owner_delete on storage.objects;

drop policy if exists imoteasy_images_read_published on storage.objects;
drop policy if exists imoteasy_images_read_authenticated on storage.objects;
create policy imoteasy_images_read_published
  on storage.objects for select to anon
  using (
    bucket_id = 'imoteasy-listings'
    and exists (
      select 1
      from public.listing_images
      join public.listings on listings.id = listing_images.listing_id
      where listing_images.storage_path = storage.objects.name
        and listings.status = 'published'
    )
  );

create policy imoteasy_images_read_authenticated
  on storage.objects for select to authenticated
  using (
    bucket_id = 'imoteasy-listings'
    and (
      (select auth.uid())::text = (storage.foldername(name))[1]
      or exists (
        select 1
        from public.listing_images
        join public.listings on listings.id = listing_images.listing_id
        where listing_images.storage_path = storage.objects.name
          and listings.status = 'published'
      )
      or (select private.is_admin())
    )
  );

create policy imoteasy_images_owner_insert
  on storage.objects for insert to authenticated
  with check (bucket_id = 'imoteasy-listings' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy imoteasy_images_owner_update
  on storage.objects for update to authenticated
  using (bucket_id = 'imoteasy-listings' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'imoteasy-listings' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy imoteasy_images_owner_delete
  on storage.objects for delete to authenticated
  using (bucket_id = 'imoteasy-listings' and (storage.foldername(name))[1] = (select auth.uid())::text);

revoke truncate, references, trigger on all tables in schema public from public, anon, authenticated;

-- Separate anonymous access from authenticated owner/admin access to avoid overlapping permissive reads.
drop policy if exists listings_read_public on public.listings;
drop policy if exists listings_read_owner on public.listings;
drop policy if exists listings_read_admin on public.listings;
drop policy if exists listings_read_authenticated on public.listings;
create policy listings_read_public on public.listings for select to anon using (status = 'published');
create policy listings_read_authenticated on public.listings for select to authenticated
  using (status = 'published' or owner_id = (select auth.uid()) or private.is_admin());

drop policy if exists listings_insert_owner on public.listings;
drop policy if exists listings_insert_access on public.listings;
create policy listings_insert_access on public.listings for insert to authenticated
  with check (
    (owner_id = (select auth.uid()) and status in ('draft', 'pending_review') and published_at is null)
    or private.is_admin()
  );

drop policy if exists listings_update_owner on public.listings;
drop policy if exists listings_update_access on public.listings;
create policy listings_update_access on public.listings for update to authenticated
  using (owner_id = (select auth.uid()) or private.is_admin())
  with check (owner_id = (select auth.uid()) or private.is_admin());

drop policy if exists listings_manage_admin on public.listings;
drop policy if exists listings_delete_access on public.listings;
create policy listings_delete_access on public.listings for delete to authenticated
  using (private.is_admin() or (owner_id = (select auth.uid()) and status = 'draft'));

drop policy if exists listing_images_read_public on public.listing_images;
drop policy if exists listing_images_read_owner on public.listing_images;
drop policy if exists listing_images_read_admin on public.listing_images;
drop policy if exists listing_images_read_authenticated on public.listing_images;
create policy listing_images_read_public on public.listing_images for select to anon
  using (exists (select 1 from public.listings where listings.id = listing_id and listings.status = 'published'));
create policy listing_images_read_authenticated on public.listing_images for select to authenticated
  using (
    exists (select 1 from public.listings where listings.id = listing_id and listings.status = 'published')
    or exists (select 1 from public.listings where listings.id = listing_id and listings.owner_id = (select auth.uid()))
    or private.is_admin()
  );

drop policy if exists listing_images_insert_owner on public.listing_images;
drop policy if exists listing_images_insert_admin on public.listing_images;
drop policy if exists listing_images_insert_access on public.listing_images;
create policy listing_images_insert_access on public.listing_images for insert to authenticated
  with check (
    exists (select 1 from public.listings where listings.id = listing_id and listings.owner_id = (select auth.uid()))
    or private.is_admin()
  );

drop policy if exists listing_images_update_owner on public.listing_images;
drop policy if exists listing_images_update_admin on public.listing_images;
drop policy if exists listing_images_update_access on public.listing_images;
create policy listing_images_update_access on public.listing_images for update to authenticated
  using (
    exists (select 1 from public.listings where listings.id = listing_id and listings.owner_id = (select auth.uid()))
    or private.is_admin()
  )
  with check (
    exists (select 1 from public.listings where listings.id = listing_id and listings.owner_id = (select auth.uid()))
    or private.is_admin()
  );

drop policy if exists listing_images_delete_owner on public.listing_images;
drop policy if exists listing_images_delete_admin on public.listing_images;
drop policy if exists listing_images_delete_access on public.listing_images;
create policy listing_images_delete_access on public.listing_images for delete to authenticated
  using (
    exists (select 1 from public.listings where listings.id = listing_id and listings.owner_id = (select auth.uid()))
    or private.is_admin()
  );

drop policy if exists reports_manage_admin on public.listing_reports;
drop policy if exists reports_update_admin on public.listing_reports;
create policy reports_update_admin on public.listing_reports for update to authenticated
  using (private.is_admin()) with check (private.is_admin());

drop policy if exists private_details_manage_admin on public.private_listing_details;
drop policy if exists private_details_insert_owner on public.private_listing_details;
drop policy if exists private_details_insert_access on public.private_listing_details;
create policy private_details_insert_access on public.private_listing_details for insert to authenticated
  with check (
    private.is_admin()
    or exists (select 1 from public.listings where listings.id = listing_id and listings.owner_id = (select auth.uid()))
  );

drop policy if exists private_details_update_owner on public.private_listing_details;
drop policy if exists private_details_update_access on public.private_listing_details;
create policy private_details_update_access on public.private_listing_details for update to authenticated
  using (
    private.is_admin()
    or exists (select 1 from public.listings where listings.id = listing_id and listings.owner_id = (select auth.uid()))
  )
  with check (
    private.is_admin()
    or exists (select 1 from public.listings where listings.id = listing_id and listings.owner_id = (select auth.uid()))
  );

commit;
