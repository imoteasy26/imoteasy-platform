-- Follow-ups to the org/RLS hardening review (PR #8).
-- This file is source-only in this change; it is not applied to any remote,
-- staging, or production database. It does not edit earlier migration files.
--
-- 1. MEDIUM: set_crm_lead_state used `assigned_to <> actor_id`, which is
--    UNKNOWN when assigned_to is NULL, so an assistant or broker in the same
--    organization could claim an unassigned lead. Compare with
--    `is distinct from` instead.
-- 2. LOW: lock the acting member row with FOR SHARE in
--    remove_organization_member and create_organization_invitation so the
--    actor's role cannot change mid-statement. leave_organization already
--    uses FOR UPDATE on that row.
-- 3. LOW: drop the dead `exists (select 1 from public.profiles ...)` branch
--    in private.guard_last_org_owner. organization_memberships.user_id is
--    ON DELETE RESTRICT, so the profile cannot disappear while the row
--    exists; the check never changed the outcome.
--
-- Idempotent: a second apply replaces the functions with the same bodies.

begin;

create or replace function public.set_crm_lead_state(
  p_lead_id uuid,
  p_status text,
  p_priority text,
  p_assigned_to uuid,
  p_next_follow_up_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  lead_row public.crm_leads%rowtype;
begin
  if actor_id is null then raise exception 'authentication_required'; end if;
  if p_status not in ('new', 'contacted', 'qualified', 'viewing_scheduled', 'viewing_completed', 'offer_received', 'negotiation', 'under_contract', 'won', 'lost') then
    raise exception 'invalid_lead_status';
  end if;
  if p_priority not in ('low', 'normal', 'high', 'urgent') then raise exception 'invalid_lead_priority'; end if;

  select * into lead_row from public.crm_leads where id = p_lead_id;
  if lead_row.id is null then raise exception 'lead_not_found'; end if;
  if not private.has_organization_role(lead_row.organization_id, array['owner', 'agency_admin', 'broker', 'assistant']::text[]) then
    raise exception 'organization_access_denied';
  end if;
  if not private.has_broker_entitlement(lead_row.organization_id, 'crm') then raise exception 'plan_entitlement_required'; end if;
  if lead_row.assigned_to is distinct from actor_id and not private.has_organization_role(lead_row.organization_id, array['owner', 'agency_admin']::text[]) then
    raise exception 'lead_assignment_required';
  end if;
  if p_assigned_to is not null and not exists (
    select 1 from public.organization_memberships
    where organization_id = lead_row.organization_id and user_id = p_assigned_to and status = 'active'
  ) then raise exception 'invalid_lead_assignee'; end if;

  update public.crm_leads
  set status = p_status, priority = p_priority, assigned_to = p_assigned_to,
      next_follow_up_at = p_next_follow_up_at, updated_at = now()
  where id = p_lead_id;
end;
$$;

revoke all on function public.set_crm_lead_state(uuid, text, text, uuid, timestamptz) from public, anon;
grant execute on function public.set_crm_lead_state(uuid, text, text, uuid, timestamptz) to authenticated;

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
    and status = 'active'
  for share;
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

create or replace function public.create_organization_invitation(
  p_organization_id uuid,
  p_email text,
  p_role text,
  p_token_hash text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  inviter_role text;
  invitation_id uuid;
  invited_email text := lower(btrim(coalesce(p_email, '')));
begin
  if actor_id is null then raise exception 'authentication_required'; end if;
  if invited_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or char_length(invited_email) > 254 then
    raise exception 'invalid_invitation_email';
  end if;
  if p_role is null or p_role not in ('agency_admin', 'broker', 'assistant', 'marketing_manager', 'read_only') then
    raise exception 'invalid_invitation_role';
  end if;
  if p_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid_invitation_token'; end if;

  select role into inviter_role
  from public.organization_memberships
  where organization_id = p_organization_id and user_id = actor_id and status = 'active'
  for share;
  if inviter_role is null or inviter_role not in ('owner', 'agency_admin') then
    raise exception 'organization_admin_required';
  end if;
  if inviter_role = 'agency_admin' and p_role = 'agency_admin' then raise exception 'owner_required_for_admin_invite'; end if;

  insert into public.organization_invitations (
    organization_id, invitee_email, invited_role, token_hash, invited_by, expires_at
  ) values (
    p_organization_id, invited_email, p_role, p_token_hash, actor_id, now() + interval '7 days'
  )
  on conflict (organization_id, lower(invitee_email)) where status = 'pending'
  do update set invited_role = excluded.invited_role,
                token_hash = excluded.token_hash,
                invited_by = excluded.invited_by,
                expires_at = excluded.expires_at,
                created_at = now()
  returning id into invitation_id;

  insert into public.organization_events (organization_id, actor_id, event_type, event_data)
  values (p_organization_id, actor_id, 'invitation_created', jsonb_build_object('role', p_role));
  return invitation_id;
end;
$$;

revoke all on function public.create_organization_invitation(uuid, text, text, text) from public, anon;
grant execute on function public.create_organization_invitation(uuid, text, text, text) to authenticated;

commit;
