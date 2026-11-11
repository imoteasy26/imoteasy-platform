create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  phone text,
  avatar_path text,
  account_type text not null default 'individual' check (account_type in ('individual', 'broker', 'agency', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 10 and 120),
  slug text not null unique,
  description text not null check (char_length(description) between 30 and 10000),
  property_type text not null check (property_type in ('apartment', 'house', 'land', 'office', 'shop', 'warehouse', 'other')),
  transaction_type text not null check (transaction_type in ('sale', 'rent')),
  city text not null,
  neighborhood text,
  price_eur numeric(12,2) not null check (price_eur > 0),
  area_sqm numeric(9,2) not null check (area_sqm > 0),
  rooms smallint check (rooms is null or rooms between 0 and 30),
  bedrooms smallint check (bedrooms is null or bedrooms between 0 and 30),
  floor smallint,
  total_floors smallint check (total_floors is null or total_floors between 1 and 200),
  construction_type text,
  condition text,
  furnishing text,
  latitude double precision check (latitude is null or latitude between -90 and 90),
  longitude double precision check (longitude is null or longitude between -180 and 180),
  status text not null default 'draft' check (status in ('draft', 'pending_review', 'published', 'rejected', 'archived', 'sold')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

create table public.listing_images (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  storage_path text not null unique,
  alt_text text not null default '',
  position smallint not null default 0 check (position between 0 and 20),
  is_cover boolean not null default false,
  created_at timestamptz not null default now(),
  unique (listing_id, position)
);
create unique index listing_images_one_cover_per_listing on public.listing_images (listing_id) where is_cover;

create table public.favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

create table public.inquiries (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 100),
  email text not null check (char_length(email) <= 254),
  phone text check (phone is null or char_length(phone) <= 40),
  message text not null check (char_length(message) between 10 and 3000),
  created_at timestamptz not null default now()
);

create table public.listing_reports (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('incorrect', 'duplicate', 'fraud', 'inappropriate', 'other')),
  details text check (details is null or char_length(details) <= 2000),
  status text not null default 'new' check (status in ('new', 'reviewed', 'actioned')),
  created_at timestamptz not null default now()
);

create table public.private_listing_details (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  exact_address text not null check (char_length(exact_address) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index listings_public_search_idx on public.listings (status, city, property_type, transaction_type, price_eur, area_sqm, created_at desc);
create index listings_neighborhood_idx on public.listings (lower(city), lower(coalesce(neighborhood, '')));
create index listings_owner_status_idx on public.listings (owner_id, status, created_at desc);
create index listing_images_listing_position_idx on public.listing_images (listing_id, position);
create index inquiries_listing_created_idx on public.inquiries (listing_id, created_at desc);
create index inquiries_sender_created_idx on public.inquiries (sender_id, created_at desc);
create index reports_created_idx on public.listing_reports (status, created_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.account_type = 'admin');
$$;

create or replace function public.create_profile_for_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), ''))
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.create_profile_for_user();

create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger listings_set_updated_at before update on public.listings for each row execute function public.set_updated_at();
create trigger private_listing_details_set_updated_at before update on public.private_listing_details for each row execute function public.set_updated_at();

create or replace function public.guard_listing_changes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.owner_id is distinct from (select auth.uid()) and not public.is_admin() then raise exception 'Listing owner must match the authenticated user'; end if;
    if new.status not in ('draft', 'pending_review') and not public.is_admin() then raise exception 'Listings must be submitted for review'; end if;
    if new.published_at is not null and not public.is_admin() then raise exception 'Only administrators may set publication time'; end if;
    return new;
  end if;
  if new.owner_id is distinct from old.owner_id and not public.is_admin() then raise exception 'Listing ownership cannot be changed'; end if;
  if new.published_at is distinct from old.published_at and not public.is_admin() then raise exception 'Only administrators may set publication time'; end if;
  if new.status is distinct from old.status and not public.is_admin() then
    if old.owner_id is distinct from (select auth.uid()) then raise exception 'Only the owner or an administrator may change this listing'; end if;
    if not ((old.status in ('draft', 'rejected') and new.status = 'pending_review') or (old.status = 'published' and new.status in ('archived', 'sold')) or (old.status = 'archived' and new.status = 'draft')) then
      raise exception 'This listing status transition is not allowed';
    end if;
  end if;
  return new;
end;
$$;
create trigger listings_guard_changes before insert or update on public.listings for each row execute function public.guard_listing_changes();

create or replace function public.limit_user_submissions()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.sender_id is not null and (select count(*) from public.inquiries i where i.sender_id = new.sender_id and i.created_at > now() - interval '1 hour') >= 8 then
    raise exception 'Inquiry rate limit reached';
  end if;
  return new;
end;
$$;
create trigger inquiries_rate_limit before insert on public.inquiries for each row execute function public.limit_user_submissions();

create or replace function public.guard_profile_role()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.account_type is distinct from old.account_type and not public.is_admin() then raise exception 'Profile roles may only be changed by an administrator'; end if;
  return new;
end;
$$;
create trigger profiles_guard_role before update on public.profiles for each row execute function public.guard_profile_role();

alter table public.profiles enable row level security;
alter table public.listings enable row level security;
alter table public.listing_images enable row level security;
alter table public.favorites enable row level security;
alter table public.inquiries enable row level security;
alter table public.listing_reports enable row level security;
alter table public.private_listing_details enable row level security;

create policy profiles_read on public.profiles for select to anon, authenticated using (
  id = (select auth.uid()) or public.is_admin() or exists (select 1 from public.listings l where l.owner_id = profiles.id and l.status = 'published')
);
create policy profiles_update_own on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy listings_read_public on public.listings for select to anon, authenticated using (status = 'published');
create policy listings_read_owner on public.listings for select to authenticated using (owner_id = (select auth.uid()));
create policy listings_read_admin on public.listings for select to authenticated using (public.is_admin());
create policy listings_insert_owner on public.listings for insert to authenticated with check (owner_id = (select auth.uid()) and status in ('draft', 'pending_review') and published_at is null);
create policy listings_update_owner on public.listings for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy listings_manage_admin on public.listings for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy listing_images_read_public on public.listing_images for select to anon, authenticated using (exists (select 1 from public.listings l where l.id = listing_id and l.status = 'published'));
create policy listing_images_read_owner on public.listing_images for select to authenticated using (exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = (select auth.uid())));
create policy listing_images_read_admin on public.listing_images for select to authenticated using (public.is_admin());
create policy listing_images_insert_owner on public.listing_images for insert to authenticated with check (exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = (select auth.uid())));
create policy listing_images_update_owner on public.listing_images for update to authenticated using (exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = (select auth.uid()))) with check (exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = (select auth.uid())));
create policy listing_images_delete_owner on public.listing_images for delete to authenticated using (exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = (select auth.uid())));
create policy listing_images_manage_admin on public.listing_images for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy favorites_read_own on public.favorites for select to authenticated using (user_id = (select auth.uid()));
create policy favorites_insert_own on public.favorites for insert to authenticated with check (user_id = (select auth.uid()) and exists (select 1 from public.listings l where l.id = listing_id and l.status = 'published'));
create policy favorites_delete_own on public.favorites for delete to authenticated using (user_id = (select auth.uid()));

create policy inquiries_read_participant on public.inquiries for select to authenticated using (
  sender_id = (select auth.uid()) or public.is_admin() or exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = (select auth.uid()))
);
create policy inquiries_insert_sender on public.inquiries for insert to authenticated with check (
  sender_id = (select auth.uid()) and exists (select 1 from public.listings l where l.id = listing_id and l.status = 'published' and l.owner_id <> (select auth.uid()))
);
create policy inquiries_delete_sender on public.inquiries for delete to authenticated using (sender_id = (select auth.uid()));

create policy reports_read_reporter on public.listing_reports for select to authenticated using (reporter_id = (select auth.uid()) or public.is_admin());
create policy reports_insert_reporter on public.listing_reports for insert to authenticated with check (
  reporter_id = (select auth.uid()) and exists (select 1 from public.listings l where l.id = listing_id and l.status = 'published')
);
create policy reports_manage_admin on public.listing_reports for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy private_details_read_owner_admin on public.private_listing_details for select to authenticated using (
  public.is_admin() or exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = (select auth.uid()))
);
create policy private_details_insert_owner on public.private_listing_details for insert to authenticated with check (exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = (select auth.uid())));
create policy private_details_update_owner on public.private_listing_details for update to authenticated using (exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = (select auth.uid()))) with check (exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = (select auth.uid())));
create policy private_details_manage_admin on public.private_listing_details for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on public.profiles from anon, authenticated;
grant select (id, display_name, avatar_path, account_type, created_at) on public.profiles to anon, authenticated;
grant update (display_name, phone, avatar_path) on public.profiles to authenticated;
grant select on public.listings, public.listing_images to anon, authenticated;
grant insert, update, delete on public.listings, public.listing_images to authenticated;
grant select, insert, delete on public.favorites, public.inquiries to authenticated;
grant select, insert, update on public.listing_reports, public.private_listing_details to authenticated;
grant execute on function public.is_admin() to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('imoteasy-listings', 'imoteasy-listings', true, 8388608, array['image/jpeg', 'image/png', 'image/webp']::text[])
on conflict (id) do nothing;
create policy imoteasy_images_public_read on storage.objects for select to anon, authenticated using (bucket_id = 'imoteasy-listings');
create policy imoteasy_images_owner_insert on storage.objects for insert to authenticated with check (bucket_id = 'imoteasy-listings' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy imoteasy_images_owner_update on storage.objects for update to authenticated using (bucket_id = 'imoteasy-listings' and (storage.foldername(name))[1] = (select auth.uid())::text) with check (bucket_id = 'imoteasy-listings' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy imoteasy_images_owner_delete on storage.objects for delete to authenticated using (bucket_id = 'imoteasy-listings' and (storage.foldername(name))[1] = (select auth.uid())::text);
