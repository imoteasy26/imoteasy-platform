-- Imoteasy organizations: tenant isolation, invitation rules, last-owner guard.
--
-- Run only against a disposable local database after:
--   1. supabase/tests/rls/local_harness.sql
--   2. every file in supabase/migrations/ in name order, including
--      20261112130000_organization_rls_hardening.sql
-- The transaction always rolls back its synthetic fixtures. A failed
-- assertion raises `RLS_TEST_FAILED: ...`.
--
-- See supabase/tests/rls/README.md. Do not run this against a remote or
-- production project.

begin;

create function pg_temp.login(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_user::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true),
         set_config('request.jwt.claims',
           json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

create function pg_temp.check(p_ok boolean, p_message text) returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then
    raise exception 'RLS_TEST_FAILED: %', p_message;
  end if;
end;
$$;

grant execute on function pg_temp.login(uuid) to authenticated;
grant execute on function pg_temp.check(boolean, text) to authenticated;

-- Users: org1 owner, agency_admin, broker, assistant, marketing, read_only;
-- org2 owner; an outsider who sends an inquiry.
insert into auth.users (id, email, aud, role, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
select u.id::uuid, u.email, 'authenticated', 'authenticated', '', now(), '{}'::jsonb, jsonb_build_object('display_name', u.email)
from (values
  ('00000000-0000-4000-8000-0000000000a1', 'org1-owner@example.invalid'),
  ('00000000-0000-4000-8000-0000000000a2', 'org1-admin@example.invalid'),
  ('00000000-0000-4000-8000-0000000000a3', 'org1-broker@example.invalid'),
  ('00000000-0000-4000-8000-0000000000a4', 'org1-assistant@example.invalid'),
  ('00000000-0000-4000-8000-0000000000a5', 'org1-marketing@example.invalid'),
  ('00000000-0000-4000-8000-0000000000a6', 'org1-readonly@example.invalid'),
  ('00000000-0000-4000-8000-0000000000c1', 'org2-owner@example.invalid'),
  ('00000000-0000-4000-8000-0000000000d1', 'buyer@example.invalid')
) as u(id, email);

create temp table ids (k text primary key, v uuid) on commit drop;
grant select, insert, update on ids to authenticated;

set local role authenticated;

select pg_temp.login('00000000-0000-4000-8000-0000000000a1');
insert into ids values (
  'org1',
  public.create_broker_workspace('Агенция Едно', 'София', 'broker-trial-v1', true)
);

select pg_temp.login('00000000-0000-4000-8000-0000000000c1');
insert into ids values (
  'org2',
  public.create_broker_workspace('Агенция Две', 'Пловдив', 'broker-trial-v1', true)
);

-- Bootstrap owner is the only active owner after workspace creation.
select pg_temp.login('00000000-0000-4000-8000-0000000000a1');
select pg_temp.check(
  (select count(*) from public.organization_memberships
    where organization_id = (select v from ids where k = 'org1')
      and role = 'owner' and status = 'active') = 1,
  'workspace did not create exactly one active owner'
);

-- Invitation cannot grant owner (the invited_role check rejects it).
do $$
begin
  begin
    perform public.create_organization_invitation(
      (select v from ids where k = 'org1'),
      'forged-owner@example.invalid',
      'owner',
      repeat('ab', 32)
    );
    perform pg_temp.check(false, 'invitation granted the owner role');
  exception
    when others then
      if sqlerrm not like '%invalid_invitation_role%' then
        raise;
      end if;
  end;
end;
$$;

reset role;

-- Seed the rest of the org1 roster as the table owner (writes go through RPCs
-- in production; the invitation path is asserted above).
insert into public.organization_memberships (organization_id, user_id, role, status)
select (select v from ids where k = 'org1'), m.u::uuid, m.r, 'active'
from (values
  ('00000000-0000-4000-8000-0000000000a2', 'agency_admin'),
  ('00000000-0000-4000-8000-0000000000a3', 'broker'),
  ('00000000-0000-4000-8000-0000000000a4', 'assistant'),
  ('00000000-0000-4000-8000-0000000000a5', 'marketing_manager'),
  ('00000000-0000-4000-8000-0000000000a6', 'read_only')
) as m(u, r);

-- Unpublished listings in each org, plus one published org1 listing for inquiries.
set session_replication_role = replica;
insert into public.listings (
  id, owner_id, organization_id, title, slug, description, property_type, transaction_type,
  city, price_eur, area_sqm, status
) values
  (
    '00000000-0000-4000-8000-0000000000e1',
    '00000000-0000-4000-8000-0000000000a1',
    (select v from ids where k = 'org1'),
    'Чернова обява в агенция едно',
    'draft-org1',
    'Описание на чернова обява в първата агенция.',
    'apartment', 'sale', 'София', 120000, 70, 'draft'
  ),
  (
    '00000000-0000-4000-8000-0000000000e2',
    '00000000-0000-4000-8000-0000000000c1',
    (select v from ids where k = 'org2'),
    'Чернова обява в агенция две',
    'draft-org2',
    'Описание на чернова обява във втората агенция.',
    'house', 'sale', 'Пловдив', 180000, 110, 'draft'
  ),
  (
    '00000000-0000-4000-8000-0000000000e3',
    '00000000-0000-4000-8000-0000000000a1',
    (select v from ids where k = 'org1'),
    'Публикувана обява в агенция едно',
    'published-org1',
    'Описание на публикувана обява в първата агенция.',
    'apartment', 'sale', 'София', 99000, 55, 'published'
  );

insert into public.inquiries (listing_id, sender_id, name, email, message)
values (
  '00000000-0000-4000-8000-0000000000e3',
  '00000000-0000-4000-8000-0000000000d1',
  'Иван Иванов',
  'buyer@example.invalid',
  'Имам въпрос относно тази обява.'
);

insert into public.crm_contacts (organization_id, display_name, email, created_by)
values (
  (select v from ids where k = 'org2'),
  'Контакт само за агенция две',
  'secret-contact@example.invalid',
  '00000000-0000-4000-8000-0000000000c1'
);
set session_replication_role = origin;

insert into ids
select 'inquiry1', id from public.inquiries
where listing_id = '00000000-0000-4000-8000-0000000000e3'
limit 1;
insert into ids
select 'contact2', id from public.crm_contacts
where email = 'secret-contact@example.invalid';

set local role authenticated;

-- Tenant A cannot read tenant B memberships, draft listings, or CRM contacts.
select pg_temp.login('00000000-0000-4000-8000-0000000000a1');
select pg_temp.check(
  (select count(*) from public.organization_memberships
    where organization_id = (select v from ids where k = 'org2')) = 0,
  'org1 owner sees org2 memberships'
);
select pg_temp.check(
  not exists (select 1 from public.listings where slug = 'draft-org2'),
  'org1 owner sees org2 draft listing'
);
select pg_temp.check(
  (select count(*) from public.crm_contacts) = 0,
  'org1 owner sees org2 CRM contacts'
);
select pg_temp.check(
  exists (select 1 from public.listings where slug = 'draft-org1'),
  'org1 owner cannot see own draft listing'
);

select pg_temp.login('00000000-0000-4000-8000-0000000000c1');
select pg_temp.check(
  (select count(*) from public.organization_memberships
    where organization_id = (select v from ids where k = 'org1')) = 0,
  'org2 owner sees org1 memberships'
);
select pg_temp.check(
  not exists (select 1 from public.listings where slug = 'draft-org1'),
  'org2 owner sees org1 draft listing'
);

-- read_only sees only their own membership row, not the roster.
select pg_temp.login('00000000-0000-4000-8000-0000000000a6');
select pg_temp.check(
  (select count(*) from public.organization_memberships) = 1,
  'read_only sees the org1 roster'
);
select pg_temp.check(
  (select user_id from public.organization_memberships) = '00000000-0000-4000-8000-0000000000a6',
  'read_only sees a different membership row'
);

-- Outsider sees no organizations or memberships and no draft listings.
select pg_temp.login('00000000-0000-4000-8000-0000000000d1');
select pg_temp.check((select count(*) from public.organizations) = 0, 'outsider sees an organization');
select pg_temp.check((select count(*) from public.organization_memberships) = 0, 'outsider sees memberships');
select pg_temp.check(
  not exists (select 1 from public.listings where slug like 'draft-%'),
  'outsider sees a draft listing'
);

-- read_only cannot convert inquiries or mutate leads.
select pg_temp.login('00000000-0000-4000-8000-0000000000a6');
do $$
begin
  begin
    perform public.convert_inquiry_to_crm_lead(
      (select v from ids where k = 'org1'),
      (select v from ids where k = 'inquiry1'),
      '00000000-0000-4000-8000-0000000000a6'
    );
    perform pg_temp.check(false, 'read_only converted an inquiry');
  exception
    when others then
      if sqlerrm not like '%organization_access_denied%' then
        raise;
      end if;
  end;
end;
$$;

-- A broker can convert the same inquiry, then read_only still cannot mutate it.
select pg_temp.login('00000000-0000-4000-8000-0000000000a3');
insert into ids values (
  'lead1',
  public.convert_inquiry_to_crm_lead(
    (select v from ids where k = 'org1'),
    (select v from ids where k = 'inquiry1'),
    '00000000-0000-4000-8000-0000000000a3'
  )
);

select pg_temp.login('00000000-0000-4000-8000-0000000000a6');
-- P1 already lets read_only SELECT crm_leads; the hardening forbids writes.
select pg_temp.check((select count(*) from public.crm_leads) = 1, 'read_only cannot see the converted lead');
do $$
begin
  begin
    perform public.set_crm_lead_state(
      (select v from ids where k = 'lead1'),
      'contacted',
      'normal',
      '00000000-0000-4000-8000-0000000000a3',
      null
    );
    perform pg_temp.check(false, 'read_only mutated a lead');
  exception
    when others then
      if sqlerrm not like '%organization_access_denied%' and sqlerrm not like '%lead_not_found%' then
        raise;
      end if;
  end;
end;
$$;

-- agency_admin cannot remove an owner.
select pg_temp.login('00000000-0000-4000-8000-0000000000a2');
do $$
begin
  begin
    perform public.remove_organization_member(
      (select v from ids where k = 'org1'),
      '00000000-0000-4000-8000-0000000000a1'
    );
    perform pg_temp.check(false, 'agency_admin removed an owner');
  exception
    when others then
      if sqlerrm not like '%owner_required_to_remove_owner%' then
        raise;
      end if;
  end;
end;
$$;

-- A non-owner can leave. The last owner cannot.
select pg_temp.login('00000000-0000-4000-8000-0000000000a5');
select public.leave_organization((select v from ids where k = 'org1'));
select pg_temp.check(
  (select status from public.organization_memberships
    where user_id = '00000000-0000-4000-8000-0000000000a5'
      and organization_id = (select v from ids where k = 'org1')) is null
  or not exists (
    select 1 from public.organization_memberships
    where user_id = '00000000-0000-4000-8000-0000000000a5' and status = 'active'
  ),
  'marketing_manager could not leave'
);

-- After leaving, the event is visible to remaining staff (reset role to read it
-- if the departed member can no longer see events).
reset role;
select pg_temp.check(
  exists (
    select 1 from public.organization_events
    where organization_id = (select v from ids where k = 'org1')
      and event_type = 'member_left'
      and subject_user_id = '00000000-0000-4000-8000-0000000000a5'
  ),
  'leave did not write organization_events'
);

set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000a1');
do $$
begin
  begin
    perform public.leave_organization((select v from ids where k = 'org1'));
    perform pg_temp.check(false, 'last owner left the organization');
  exception
    when check_violation then null;
    when others then
      if sqlerrm not like '%last_owner_required%' then
        raise;
      end if;
  end;
end;
$$;

select pg_temp.check(
  (select count(*) from public.organization_memberships
    where organization_id = (select v from ids where k = 'org1')
      and role = 'owner' and status = 'active') = 1,
  'last owner membership was changed'
);

reset role;

\echo 'organizations_isolation: all assertions passed'
rollback;
