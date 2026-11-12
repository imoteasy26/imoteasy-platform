-- Fix a P1 bug in public.create_organization_invitation: a missing membership
-- leaves inviter_role NULL, and `NULL NOT IN (...)` is not TRUE in SQL, so the
-- function did not raise and an outsider could create (and then accept) an
-- agency_admin invitation for a foreign organization.
--
-- This file is source-only in this change; it is not applied to any remote,
-- staging, or production database. It does not edit the original P1 migration.
-- Idempotent: a second apply replaces the function with the same body.

begin;

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
  where organization_id = p_organization_id and user_id = actor_id and status = 'active';
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
