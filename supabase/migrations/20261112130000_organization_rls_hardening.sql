-- Additive Imoteasy org/RLS hardening. Does not recreate organizations or
-- change existing role names. This file is source-only in this change; it is
-- not applied to any remote, staging, or production database.
--
-- Adds:
--   * last-active-owner guard on organization_memberships
--   * leave_organization / remove_organization_member RPCs (write organization_events)
--   * tighter memberships SELECT so read_only sees only their own row
--   * listing_images.alt_text length CHECK (<= 200)
--
-- Idempotent: a second apply is a no-op. Does not rewrite P1 history.

begin;

-- ---------------------------------------------------------------------------
-- last-active-owner guard
-- ---------------------------------------------------------------------------
-- An organization must keep at least one *active* owner. The organization row
-- is locked first so two concurrent leaves cannot both see a remaining owner
-- and both succeed. Membership primary-key columns are immutable.
--
-- User deletion is *not* handled here: organization_memberships.user_id and
-- organizations.created_by are ON DELETE RESTRICT, so deleting a profile or
-- auth user is already rejected by the FKs. A follow-up deletion function is
-- required (transfer the last owner or close the org, then anonymize created_by).

create or replace function private.guard_last_org_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1
  from public.organizations as organization
  where organization.id = old.organization_id
  for update;

  if tg_op = 'UPDATE'
     and (new.organization_id is distinct from old.organization_id
          or new.user_id is distinct from old.user_id) then
    raise exception 'organization_memberships keys are immutable' using errcode = '42501';
  end if;

  if old.role = 'owner'
     and old.status = 'active'
     and (tg_op = 'DELETE'
          or new.role is distinct from 'owner'
          or new.status is distinct from 'active')
     and exists (select 1 from public.organizations as organization where organization.id = old.organization_id)
     and exists (select 1 from public.profiles as profile where profile.id = old.user_id)
     and not exists (
       select 1
       from public.organization_memberships as membership
       where membership.organization_id = old.organization_id
         and membership.role = 'owner'
         and membership.status = 'active'
         and membership.user_id <> old.user_id
     )
  then
    raise exception 'last_owner_required' using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.guard_last_org_owner() from public, anon, authenticated;

drop trigger if exists organization_memberships_guard_last_owner on public.organization_memberships;
create trigger organization_memberships_guard_last_owner
  before update or delete on public.organization_memberships
  for each row execute function private.guard_last_org_owner();

-- ---------------------------------------------------------------------------
-- leave / remove RPCs
-- Roster writes stay off the grants (authenticated has SELECT only). These
-- SECURITY DEFINER helpers are the only supported way to leave or remove.
-- ---------------------------------------------------------------------------

create or replace function public.leave_organization(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  membership public.organization_memberships%rowtype;
begin
  if actor_id is null then
    raise exception 'authentication_required';
  end if;

  select * into membership
  from public.organization_memberships
  where organization_id = p_organization_id
    and user_id = actor_id
    and status = 'active'
  for update;
  if membership.user_id is null then
    raise exception 'organization_membership_required';
  end if;

  update public.organization_memberships
  set status = 'removed', updated_at = now()
  where organization_id = p_organization_id
    and user_id = actor_id
    and status = 'active';

  insert into public.organization_events (organization_id, actor_id, event_type, subject_user_id, event_data)
  values (
    p_organization_id,
    actor_id,
    'member_left',
    actor_id,
    jsonb_build_object('role', membership.role)
  );
end;
$$;

revoke all on function public.leave_organization(uuid) from public, anon;
grant execute on function public.leave_organization(uuid) to authenticated;

create or replace function public.remove_organization_member(p_organization_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_role text;
  membership public.organization_memberships%rowtype;
begin
  if actor_id is null then
    raise exception 'authentication_required';
  end if;
  if p_user_id is null then
    raise exception 'member_not_found';
  end if;
  if p_user_id = actor_id then
    raise exception 'cannot_remove_self';
  end if;

  select role into actor_role
  from public.organization_memberships
  where organization_id = p_organization_id
    and user_id = actor_id
    and status = 'active';
  if actor_role is null or actor_role not in ('owner', 'agency_admin') then
    raise exception 'organization_admin_required';
  end if;

  select * into membership
  from public.organization_memberships
  where organization_id = p_organization_id
    and user_id = p_user_id
    and status = 'active'
  for update;
  if membership.user_id is null then
    raise exception 'member_not_found';
  end if;
  if actor_role = 'agency_admin' and membership.role = 'owner' then
    raise exception 'owner_required_to_remove_owner';
  end if;

  update public.organization_memberships
  set status = 'removed', updated_at = now()
  where organization_id = p_organization_id
    and user_id = p_user_id
    and status = 'active';

  insert into public.organization_events (organization_id, actor_id, event_type, subject_user_id, event_data)
  values (
    p_organization_id,
    actor_id,
    'member_removed',
    p_user_id,
    jsonb_build_object('role', membership.role, 'removed_by_role', actor_role)
  );
end;
$$;

revoke all on function public.remove_organization_member(uuid, uuid) from public, anon;
grant execute on function public.remove_organization_member(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Least privilege: read_only members see only their own membership row.
-- Other active roles still see the full roster of the same organization.
-- ---------------------------------------------------------------------------
drop policy if exists organization_memberships_read_member on public.organization_memberships;
create policy organization_memberships_read_member on public.organization_memberships
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.has_organization_role(
      organization_id,
      array['owner', 'agency_admin', 'broker', 'assistant', 'marketing_manager']::text[]
    )
  );

-- ---------------------------------------------------------------------------
-- alt_text length. The column already exists (default ''). Do not add it again.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'listing_images_alt_text_length'
      and conrelid = 'public.listing_images'::regclass
  ) then
    -- Pre-apply in the target environment:
    --   select count(*) from public.listing_images where char_length(alt_text) > 200;
    -- Added NOT VALID so existing long values cannot block apply. Validate later:
    --   alter table public.listing_images validate constraint listing_images_alt_text_length;
    alter table public.listing_images
      add constraint listing_images_alt_text_length
      check (char_length(alt_text) <= 200) not valid;
  end if;
end;
$$;

commit;
