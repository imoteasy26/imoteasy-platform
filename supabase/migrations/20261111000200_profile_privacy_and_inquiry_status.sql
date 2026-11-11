begin;

create table public.private_profile_details (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  phone text check (phone is null or char_length(phone) <= 40)
);

alter table public.private_profile_details enable row level security;
revoke all on table public.private_profile_details from public, anon, authenticated;
grant select, insert, update on table public.private_profile_details to authenticated;

create policy private_profile_details_select_owner_admin
  on public.private_profile_details for select to authenticated
  using (user_id = (select auth.uid()) or private.is_admin());

create policy private_profile_details_insert_owner_admin
  on public.private_profile_details for insert to authenticated
  with check (user_id = (select auth.uid()) or private.is_admin());

create policy private_profile_details_update_owner_admin
  on public.private_profile_details for update to authenticated
  using (user_id = (select auth.uid()) or private.is_admin())
  with check (user_id = (select auth.uid()) or private.is_admin());

insert into public.private_profile_details (user_id, phone)
select id, phone
from public.profiles
where phone is not null
on conflict (user_id) do update set phone = excluded.phone;

update public.profiles set phone = null where phone is not null;
revoke update (phone) on table public.profiles from authenticated;

alter table public.inquiries
  add column status text not null default 'new';
alter table public.inquiries
  add constraint inquiries_status_check
  check (status in ('new', 'read', 'replied', 'archived'));

revoke all on table public.inquiries from public, anon, authenticated;
revoke insert (id, listing_id, sender_id, name, email, phone, message, status, created_at)
  on table public.inquiries from public, anon, authenticated;
revoke update (id, listing_id, sender_id, name, email, phone, message, status, created_at)
  on table public.inquiries from public, anon, authenticated;
grant select on table public.inquiries to authenticated;
grant insert (listing_id, sender_id, name, email, phone, message)
  on table public.inquiries to authenticated;
grant update (status) on table public.inquiries to authenticated;

drop policy if exists inquiries_delete_sender on public.inquiries;
drop policy if exists inquiries_update_listing_owner_status on public.inquiries;
create policy inquiries_update_listing_owner_status
  on public.inquiries for update to authenticated
  using (
    private.is_admin() or exists (
      select 1 from public.listings l
      where l.id = inquiries.listing_id and l.owner_id = (select auth.uid())
    )
  )
  with check (
    private.is_admin() or exists (
      select 1 from public.listings l
      where l.id = inquiries.listing_id and l.owner_id = (select auth.uid())
    )
  );

commit;
