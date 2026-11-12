begin;

-- P1 broker OS foundation. Apply only after the reviewed P0 migration on an
-- isolated, correctly identified Supabase test project. This file is source-only
-- in this change; it is not applied to any database.

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  slug text not null unique,
  organization_type text not null default 'agency' check (organization_type in ('agency', 'brokerage')),
  status text not null default 'active' check (status in ('active', 'suspended', 'closed')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_memberships (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  role text not null check (role in ('owner', 'agency_admin', 'broker', 'assistant', 'marketing_manager', 'read_only')),
  status text not null default 'active' check (status in ('active', 'suspended', 'removed')),
  invited_by uuid references public.profiles(id) on delete set null,
  invited_at timestamptz,
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  invitee_email text not null check (char_length(invitee_email) between 3 and 254),
  invited_role text not null check (invited_role in ('agency_admin', 'broker', 'assistant', 'marketing_manager', 'read_only')),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  invited_by uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz not null,
  accepted_by uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);
create unique index organization_invitations_pending_email_idx
  on public.organization_invitations (organization_id, lower(invitee_email))
  where status = 'pending';

create table public.organization_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  subject_user_id uuid references public.profiles(id) on delete set null,
  event_data jsonb not null default '{}'::jsonb check (jsonb_typeof(event_data) = 'object'),
  created_at timestamptz not null default now()
);

create table public.broker_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  headline text check (headline is null or char_length(headline) <= 160),
  service_area text check (service_area is null or char_length(service_area) <= 200),
  verification_status text not null default 'unverified' check (verification_status in ('unverified', 'pending', 'verified', 'rejected')),
  onboarding_completed_at timestamptz,
  onboarding_terms_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((onboarding_completed_at is null) = (onboarding_terms_version is null))
);

create table public.broker_plan_catalog (
  plan_code text primary key check (plan_code ~ '^[a-z][a-z0-9_]{1,39}$'),
  display_name text not null check (char_length(display_name) between 2 and 80),
  tier text not null check (tier in ('starter', 'professional', 'enterprise')),
  trial_days integer not null default 30 check (trial_days = 30),
  entitlements jsonb not null default '{}'::jsonb check (jsonb_typeof(entitlements) = 'object'),
  usage_limits jsonb not null default '{}'::jsonb check (jsonb_typeof(usage_limits) = 'object'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.broker_plan_catalog (plan_code, display_name, tier, trial_days, entitlements, usage_limits)
values (
  'professional',
  'Professional',
  'professional',
  30,
  '{"broker_dashboard":true,"listing_management":true,"crm":true,"lead_management":true,"tasks":true,"viewings":true,"transaction_pipeline":true,"marketing_workspace":true,"performance_reporting":true}'::jsonb,
  '{}'::jsonb
)
on conflict (plan_code) do nothing;

create table public.broker_subscriptions (
  id uuid primary key default gen_random_uuid(),
  broker_user_id uuid not null references public.broker_profiles(user_id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  plan_code text not null references public.broker_plan_catalog(plan_code) on delete restrict,
  status text not null check (status in ('trialing', 'active', 'expired', 'cancelled', 'paused')),
  activated_at timestamptz not null,
  trial_started_at timestamptz not null,
  trial_ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, broker_user_id)
    references public.organization_memberships(organization_id, user_id) on delete restrict,
  unique (organization_id, broker_user_id),
  check (trial_ends_at > trial_started_at)
);
create unique index broker_subscriptions_one_trial_per_broker_idx
  on public.broker_subscriptions (broker_user_id) where trial_started_at is not null;
create index broker_subscriptions_org_status_idx
  on public.broker_subscriptions (organization_id, status, trial_ends_at);

create table public.broker_usage_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  broker_user_id uuid not null,
  resource_key text not null check (resource_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  units bigint not null check (units > 0),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 160),
  provider text,
  model text,
  cost_micro_usd bigint check (cost_micro_usd is null or cost_micro_usd >= 0),
  usage_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(usage_metadata) = 'object'),
  created_at timestamptz not null default now(),
  foreign key (organization_id, broker_user_id)
    references public.organization_memberships(organization_id, user_id) on delete restrict,
  unique (broker_user_id, idempotency_key)
);
create index broker_usage_events_period_idx
  on public.broker_usage_events (broker_user_id, resource_key, created_at desc);

alter table public.listings
  add column organization_id uuid references public.organizations(id) on delete restrict;
create unique index listings_org_id_pair_idx on public.listings (organization_id, id);
create index listings_organization_status_idx on public.listings (organization_id, status, updated_at desc)
  where organization_id is not null;

create table public.crm_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  display_name text not null check (char_length(btrim(display_name)) between 2 and 120),
  email text check (email is null or char_length(email) <= 254),
  email_normalized text generated always as (nullif(lower(btrim(email)), '')) stored,
  phone text check (phone is null or char_length(phone) <= 40),
  contact_roles text[] not null default array['buyer']::text[]
    check (cardinality(contact_roles) > 0 and contact_roles <@ array['buyer', 'seller', 'investor', 'tenant', 'other']::text[]),
  source text not null default 'manual' check (source in ('manual', 'marketplace_inquiry', 'referral', 'campaign', 'other')),
  assigned_to uuid,
  created_by uuid not null references public.profiles(id) on delete restrict,
  communication_opt_out boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, assigned_to)
    references public.organization_memberships(organization_id, user_id) on delete restrict
);
create unique index crm_contacts_org_email_idx
  on public.crm_contacts (organization_id, email_normalized)
  where email_normalized is not null;
create index crm_contacts_org_assignee_idx on public.crm_contacts (organization_id, assigned_to, updated_at desc);

create table public.crm_leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  contact_id uuid not null,
  listing_id uuid,
  source_inquiry_id uuid unique references public.inquiries(id) on delete set null,
  status text not null default 'new' check (status in ('new', 'contacted', 'qualified', 'viewing_scheduled', 'viewing_completed', 'offer_received', 'negotiation', 'under_contract', 'won', 'lost')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  source text not null default 'manual' check (source in ('marketplace_inquiry', 'broker_referral', 'campaign', 'website', 'other')),
  assigned_to uuid,
  next_follow_up_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, contact_id)
    references public.crm_contacts(organization_id, id) on delete restrict,
  foreign key (organization_id, listing_id)
    references public.listings(organization_id, id) on delete restrict,
  foreign key (organization_id, assigned_to)
    references public.organization_memberships(organization_id, user_id) on delete restrict
);
create index crm_leads_org_pipeline_idx on public.crm_leads (organization_id, status, updated_at desc);
create index crm_leads_assignee_follow_up_idx on public.crm_leads (organization_id, assigned_to, next_follow_up_at)
  where next_follow_up_at is not null;

create table public.crm_lead_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  lead_id uuid not null,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  event_data jsonb not null default '{}'::jsonb check (jsonb_typeof(event_data) = 'object'),
  created_at timestamptz not null default now(),
  foreign key (organization_id, lead_id)
    references public.crm_leads(organization_id, id) on delete cascade
);
create index crm_lead_events_timeline_idx on public.crm_lead_events (organization_id, lead_id, created_at desc);

create table public.broker_availability (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  broker_user_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  recurrence_rule text check (recurrence_rule is null or char_length(recurrence_rule) <= 500),
  status text not null default 'available' check (status in ('available', 'blocked', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  foreign key (organization_id, broker_user_id)
    references public.organization_memberships(organization_id, user_id) on delete restrict,
  unique (organization_id, id)
);
create index broker_availability_window_idx on public.broker_availability (organization_id, broker_user_id, starts_at, ends_at);

create table public.viewing_appointments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  listing_id uuid not null,
  lead_id uuid,
  contact_id uuid,
  broker_user_id uuid not null,
  scheduled_at timestamptz not null,
  duration_minutes smallint not null default 30 check (duration_minutes between 10 and 240),
  status text not null default 'requested' check (status in ('requested', 'confirmed', 'cancelled', 'rescheduled', 'completed', 'no_show')),
  outcome text check (outcome is null or outcome in ('interested', 'not_interested', 'follow_up', 'offer_expected', 'other')),
  internal_notes text check (internal_notes is null or char_length(internal_notes) <= 3000),
  cancellation_reason text check (cancellation_reason is null or char_length(cancellation_reason) <= 500),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, listing_id)
    references public.listings(organization_id, id) on delete restrict,
  foreign key (organization_id, lead_id)
    references public.crm_leads(organization_id, id) on delete set null (lead_id),
  foreign key (organization_id, contact_id)
    references public.crm_contacts(organization_id, id) on delete set null (contact_id),
  foreign key (organization_id, broker_user_id)
    references public.organization_memberships(organization_id, user_id) on delete restrict
);
create index viewing_appointments_calendar_idx on public.viewing_appointments (organization_id, broker_user_id, scheduled_at);

create table public.viewing_appointment_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  appointment_id uuid not null,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  event_data jsonb not null default '{}'::jsonb check (jsonb_typeof(event_data) = 'object'),
  created_at timestamptz not null default now(),
  foreign key (organization_id, appointment_id)
    references public.viewing_appointments(organization_id, id) on delete cascade
);
create index viewing_appointment_events_timeline_idx
  on public.viewing_appointment_events (organization_id, appointment_id, created_at desc);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  listing_id uuid not null,
  lead_id uuid,
  seller_contact_id uuid,
  buyer_contact_id uuid,
  broker_user_id uuid not null,
  status text not null default 'lead' check (status in ('lead', 'qualified', 'viewing', 'offer', 'negotiation', 'due_diligence', 'contract_preparation', 'contract_signed', 'completed', 'cancelled')),
  asking_price_snapshot numeric(12,2) check (asking_price_snapshot is null or asking_price_snapshot > 0),
  verified_completion_at timestamptz,
  verified_completion_by uuid references public.profiles(id) on delete restrict,
  completion_verification_note text check (completion_verification_note is null or char_length(completion_verification_note) <= 1000),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, listing_id)
    references public.listings(organization_id, id) on delete restrict,
  foreign key (organization_id, lead_id)
    references public.crm_leads(organization_id, id) on delete set null (lead_id),
  foreign key (organization_id, seller_contact_id)
    references public.crm_contacts(organization_id, id) on delete set null (seller_contact_id),
  foreign key (organization_id, buyer_contact_id)
    references public.crm_contacts(organization_id, id) on delete set null (buyer_contact_id),
  foreign key (organization_id, broker_user_id)
    references public.organization_memberships(organization_id, user_id) on delete restrict,
  check (
    (status = 'completed' and verified_completion_at is not null and verified_completion_by is not null
      and char_length(btrim(coalesce(completion_verification_note, ''))) >= 10)
    or (status <> 'completed' and verified_completion_at is null and verified_completion_by is null)
  )
);
create index transactions_org_pipeline_idx on public.transactions (organization_id, status, updated_at desc);

create table public.transaction_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  transaction_id uuid not null,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  event_data jsonb not null default '{}'::jsonb check (jsonb_typeof(event_data) = 'object'),
  created_at timestamptz not null default now(),
  foreign key (organization_id, transaction_id)
    references public.transactions(organization_id, id) on delete cascade
);
create index transaction_events_timeline_idx on public.transaction_events (organization_id, transaction_id, created_at desc);

create table public.crm_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  lead_id uuid,
  contact_id uuid,
  listing_id uuid,
  appointment_id uuid,
  transaction_id uuid,
  title text not null check (char_length(btrim(title)) between 2 and 160),
  description text check (description is null or char_length(description) <= 2000),
  status text not null default 'open' check (status in ('open', 'in_progress', 'completed', 'cancelled')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  due_at timestamptz,
  assigned_to uuid,
  created_by uuid not null references public.profiles(id) on delete restrict,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, lead_id)
    references public.crm_leads(organization_id, id) on delete set null (lead_id),
  foreign key (organization_id, contact_id)
    references public.crm_contacts(organization_id, id) on delete set null (contact_id),
  foreign key (organization_id, listing_id)
    references public.listings(organization_id, id) on delete set null (listing_id),
  foreign key (organization_id, appointment_id)
    references public.viewing_appointments(organization_id, id) on delete set null (appointment_id),
  foreign key (organization_id, transaction_id)
    references public.transactions(organization_id, id) on delete set null (transaction_id),
  foreign key (organization_id, assigned_to)
    references public.organization_memberships(organization_id, user_id) on delete restrict
);
create index crm_tasks_org_due_idx on public.crm_tasks (organization_id, status, due_at);
create index crm_tasks_assignee_due_idx on public.crm_tasks (organization_id, assigned_to, due_at) where status in ('open', 'in_progress');

create table public.crm_task_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  task_id uuid not null,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  event_data jsonb not null default '{}'::jsonb check (jsonb_typeof(event_data) = 'object'),
  created_at timestamptz not null default now(),
  foreign key (organization_id, task_id)
    references public.crm_tasks(organization_id, id) on delete cascade
);
create index crm_task_events_timeline_idx on public.crm_task_events (organization_id, task_id, created_at desc);

create table public.attribution_touchpoints (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  listing_id uuid,
  inquiry_id uuid references public.inquiries(id) on delete set null,
  lead_id uuid,
  transaction_id uuid,
  event_kind text not null check (event_kind in ('broker_activation', 'inquiry', 'lead', 'viewing', 'offer', 'completed_deal')),
  channel text check (channel is null or char_length(channel) <= 60),
  source text check (source is null or char_length(source) <= 120),
  medium text check (medium is null or char_length(medium) <= 120),
  campaign text check (campaign is null or char_length(campaign) <= 160),
  content text check (content is null or char_length(content) <= 160),
  term text check (term is null or char_length(term) <= 160),
  referral_code text check (referral_code is null or char_length(referral_code) <= 100),
  referrer_host text check (referrer_host is null or char_length(referrer_host) <= 253),
  attribution_model text not null default 'inquiry_source_v1',
  consent_context text not null default 'service_attribution' check (consent_context in ('service_attribution', 'optional_marketing')),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (organization_id, listing_id)
    references public.listings(organization_id, id) on delete set null (listing_id),
  foreign key (organization_id, lead_id)
    references public.crm_leads(organization_id, id) on delete set null (lead_id),
  foreign key (organization_id, transaction_id)
    references public.transactions(organization_id, id) on delete set null (transaction_id)
);
create unique index attribution_inquiry_event_idx on public.attribution_touchpoints (inquiry_id) where inquiry_id is not null;
create index attribution_org_event_idx on public.attribution_touchpoints (organization_id, event_kind, occurred_at desc);

create or replace function private.has_organization_role(p_organization_id uuid, p_roles text[] default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships as membership
    where membership.organization_id = p_organization_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and (p_roles is null or membership.role = any (p_roles))
  );
$$;
revoke all on function private.has_organization_role(uuid, text[]) from public, anon;
grant execute on function private.has_organization_role(uuid, text[]) to authenticated;

create or replace function private.has_broker_entitlement(p_organization_id uuid, p_entitlement text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.broker_subscriptions as subscription
    join public.broker_plan_catalog as plan on plan.plan_code = subscription.plan_code and plan.active
    where subscription.organization_id = p_organization_id
      and private.has_organization_role(p_organization_id, null)
      and (
        subscription.status = 'active'
        or (subscription.status = 'trialing' and subscription.trial_ends_at > now())
      )
      and plan.entitlements -> p_entitlement = 'true'::jsonb
  );
$$;
revoke all on function private.has_broker_entitlement(uuid, text) from public, anon;
grant execute on function private.has_broker_entitlement(uuid, text) to authenticated;

create or replace function public.activate_broker_trial(
  p_organization_id uuid,
  p_service_area text,
  p_terms_version text,
  p_terms_accepted boolean
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  trial_days integer;
  activated_at timestamptz := now();
  trial_ends_at timestamptz;
  terms_version text := btrim(coalesce(p_terms_version, ''));
  clean_service_area text := nullif(btrim(coalesce(p_service_area, '')), '');
begin
  if actor_id is null then raise exception 'authentication_required'; end if;
  if char_length(terms_version) < 1 or char_length(terms_version) > 80 or not coalesce(p_terms_accepted, false) then
    raise exception 'terms_acceptance_required';
  end if;
  if clean_service_area is not null and char_length(clean_service_area) > 200 then raise exception 'invalid_service_area'; end if;
  if not private.has_organization_role(p_organization_id, array['owner', 'agency_admin', 'broker']::text[]) then
    raise exception 'broker_membership_required';
  end if;
  if exists (select 1 from public.broker_subscriptions where broker_user_id = actor_id and trial_started_at is not null) then
    raise exception 'broker_trial_already_activated';
  end if;

  select plan.trial_days into trial_days
  from public.broker_plan_catalog as plan
  where plan.plan_code = 'professional' and plan.tier = 'professional' and plan.active;
  if trial_days is null then raise exception 'professional_plan_unavailable'; end if;
  trial_ends_at := activated_at + make_interval(days => trial_days);

  insert into public.broker_profiles (user_id, service_area, onboarding_completed_at, onboarding_terms_version)
  values (actor_id, clean_service_area, activated_at, terms_version)
  on conflict (user_id) do update
    set service_area = excluded.service_area,
        onboarding_completed_at = excluded.onboarding_completed_at,
        onboarding_terms_version = excluded.onboarding_terms_version,
        updated_at = activated_at;

  insert into public.broker_subscriptions (
    broker_user_id, organization_id, plan_code, status, activated_at, trial_started_at, trial_ends_at
  ) values (
    actor_id, p_organization_id, 'professional', 'trialing', activated_at, activated_at, trial_ends_at
  );

  insert into public.organization_events (organization_id, actor_id, event_type, subject_user_id, event_data)
  values (p_organization_id, actor_id, 'broker_trial_activated', actor_id,
    jsonb_build_object('plan_code', 'professional', 'trial_days', trial_days, 'terms_version', terms_version));
  return trial_ends_at;
end;
$$;
revoke all on function public.activate_broker_trial(uuid, text, text, boolean) from public, anon;
grant execute on function public.activate_broker_trial(uuid, text, text, boolean) to authenticated;

create or replace function public.create_broker_workspace(p_name text, p_service_area text, p_terms_version text, p_terms_accepted boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  created_organization_id uuid;
  clean_name text := btrim(coalesce(p_name, ''));
  terms_version text := btrim(coalesce(p_terms_version, ''));
  activated_at timestamptz := now();
begin
  if actor_id is null then raise exception 'authentication_required'; end if;
  if char_length(clean_name) < 2 or char_length(clean_name) > 120 then raise exception 'invalid_organization_name'; end if;
  if char_length(terms_version) < 1 or char_length(terms_version) > 80 or not coalesce(p_terms_accepted, false) then raise exception 'terms_acceptance_required'; end if;
  if exists (select 1 from public.broker_subscriptions where broker_user_id = actor_id and trial_started_at is not null) then
    raise exception 'broker_trial_already_activated';
  end if;

  insert into public.organizations (name, slug, created_by)
  values (clean_name, 'org-' || replace(gen_random_uuid()::text, '-', ''), actor_id)
  returning id into created_organization_id;

  insert into public.organization_memberships (organization_id, user_id, role, status, joined_at)
  values (created_organization_id, actor_id, 'owner', 'active', activated_at);

  perform public.activate_broker_trial(created_organization_id, p_service_area, terms_version, p_terms_accepted);
  insert into public.organization_events (organization_id, actor_id, event_type, subject_user_id, event_data)
  values (created_organization_id, actor_id, 'workspace_created', actor_id, '{"role":"owner"}'::jsonb);
  return created_organization_id;
end;
$$;
revoke all on function public.create_broker_workspace(text, text, text, boolean) from public, anon;
grant execute on function public.create_broker_workspace(text, text, text, boolean) to authenticated;

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
  if p_role not in ('agency_admin', 'broker', 'assistant', 'marketing_manager', 'read_only') then
    raise exception 'invalid_invitation_role';
  end if;
  if p_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid_invitation_token'; end if;

  select role into inviter_role
  from public.organization_memberships
  where organization_id = p_organization_id and user_id = actor_id and status = 'active';
  if inviter_role not in ('owner', 'agency_admin') then raise exception 'organization_admin_required'; end if;
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

create or replace function public.accept_organization_invitation(p_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_email text;
  invitation public.organization_invitations%rowtype;
begin
  if actor_id is null then raise exception 'authentication_required'; end if;
  if p_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid_invitation'; end if;
  select lower(email) into actor_email from auth.users
  where id = actor_id and email_confirmed_at is not null;
  if actor_email is null then raise exception 'confirmed_email_required'; end if;

  select * into invitation
  from public.organization_invitations
  where token_hash = p_token_hash and status = 'pending' and expires_at > now()
  for update;
  if invitation.id is null or invitation.invitee_email <> actor_email then raise exception 'invalid_invitation'; end if;
  if exists (
    select 1 from public.organization_memberships
    where organization_id = invitation.organization_id and user_id = actor_id and status = 'active'
  ) then raise exception 'already_a_member'; end if;

  insert into public.organization_memberships (
    organization_id, user_id, role, status, invited_by, invited_at, joined_at
  ) values (
    invitation.organization_id, actor_id, invitation.invited_role, 'active',
    invitation.invited_by, invitation.created_at, now()
  )
  on conflict (organization_id, user_id) do update
    set role = excluded.role, status = 'active', invited_by = excluded.invited_by,
        invited_at = excluded.invited_at, joined_at = now(), updated_at = now();

  update public.organization_invitations
  set status = 'accepted', accepted_by = actor_id, accepted_at = now()
  where id = invitation.id;

  insert into public.organization_events (organization_id, actor_id, event_type, subject_user_id, event_data)
  values (invitation.organization_id, actor_id, 'invitation_accepted', actor_id, jsonb_build_object('role', invitation.invited_role));
  return invitation.organization_id;
end;
$$;
revoke all on function public.accept_organization_invitation(text) from public, anon;
grant execute on function public.accept_organization_invitation(text) to authenticated;

create or replace function public.convert_inquiry_to_crm_lead(
  p_organization_id uuid,
  p_inquiry_id uuid,
  p_assigned_to uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  inquiry_row public.inquiries%rowtype;
  listing_row public.listings%rowtype;
  lead_id uuid;
  contact_id uuid;
  target_assignee uuid;
  contact_role text;
begin
  if actor_id is null then raise exception 'authentication_required'; end if;
  if not private.has_organization_role(p_organization_id, array['owner', 'agency_admin', 'broker', 'assistant']::text[]) then
    raise exception 'organization_access_denied';
  end if;
  if not private.has_broker_entitlement(p_organization_id, 'crm') then raise exception 'plan_entitlement_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_inquiry_id::text, 0));

  select * into inquiry_row from public.inquiries where id = p_inquiry_id;
  if inquiry_row.id is null then raise exception 'inquiry_not_found'; end if;
  select * into listing_row from public.listings where id = inquiry_row.listing_id;
  if listing_row.id is null or listing_row.organization_id is distinct from p_organization_id then
    raise exception 'inquiry_listing_not_in_organization';
  end if;

  select id into lead_id from public.crm_leads where source_inquiry_id = p_inquiry_id;
  if lead_id is not null then return lead_id; end if;

  target_assignee := coalesce(p_assigned_to, actor_id);
  if not exists (
    select 1 from public.organization_memberships
    where organization_id = p_organization_id and user_id = target_assignee and status = 'active'
  ) then raise exception 'invalid_lead_assignee'; end if;

  contact_role := case when listing_row.transaction_type = 'rent' then 'tenant' else 'buyer' end;
  select id into contact_id
  from public.crm_contacts
  where organization_id = p_organization_id
    and email_normalized = nullif(lower(btrim(inquiry_row.email)), '');

  if contact_id is null then
    insert into public.crm_contacts (
      organization_id, display_name, email, phone, contact_roles, source, assigned_to, created_by
    ) values (
      p_organization_id, inquiry_row.name, nullif(lower(btrim(inquiry_row.email)), ''), inquiry_row.phone,
      array[contact_role]::text[], 'marketplace_inquiry', target_assignee, actor_id
    ) returning id into contact_id;
  end if;

  insert into public.crm_leads (
    organization_id, contact_id, listing_id, source_inquiry_id, status, priority,
    source, assigned_to, created_by
  ) values (
    p_organization_id, contact_id, inquiry_row.listing_id, inquiry_row.id, 'new', 'normal',
    'marketplace_inquiry', target_assignee, actor_id
  ) returning id into lead_id;
  return lead_id;
end;
$$;
revoke all on function public.convert_inquiry_to_crm_lead(uuid, uuid, uuid) from public, anon;
grant execute on function public.convert_inquiry_to_crm_lead(uuid, uuid, uuid) to authenticated;

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
  if lead_row.assigned_to <> actor_id and not private.has_organization_role(lead_row.organization_id, array['owner', 'agency_admin']::text[]) then
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

create or replace function public.transition_broker_transaction(
  p_transaction_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  transaction_row public.transactions%rowtype;
begin
  if actor_id is null then raise exception 'authentication_required'; end if;
  if p_status not in ('lead', 'qualified', 'viewing', 'offer', 'negotiation', 'due_diligence', 'contract_preparation', 'contract_signed', 'cancelled') then
    raise exception 'invalid_transaction_status';
  end if;
  select * into transaction_row from public.transactions where id = p_transaction_id;
  if transaction_row.id is null then raise exception 'transaction_not_found'; end if;
  if not private.has_organization_role(transaction_row.organization_id, array['owner', 'agency_admin', 'broker']::text[]) then
    raise exception 'organization_access_denied';
  end if;
  if not private.has_broker_entitlement(transaction_row.organization_id, 'transaction_pipeline') then raise exception 'plan_entitlement_required'; end if;
  if transaction_row.broker_user_id <> actor_id and not private.has_organization_role(transaction_row.organization_id, array['owner', 'agency_admin']::text[]) then
    raise exception 'transaction_assignment_required';
  end if;

  update public.transactions
  set status = p_status, updated_at = now()
  where id = p_transaction_id;
end;
$$;
revoke all on function public.transition_broker_transaction(uuid, text) from public, anon;
grant execute on function public.transition_broker_transaction(uuid, text) to authenticated;

create or replace function public.verify_broker_transaction_completion(p_transaction_id uuid, p_verification_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  if actor_id is null or not private.is_admin() then raise exception 'platform_admin_required'; end if;
  if char_length(btrim(coalesce(p_verification_note, ''))) < 10 or char_length(p_verification_note) > 1000 then
    raise exception 'completion_verification_required';
  end if;

  update public.transactions
  set status = 'completed', verified_completion_at = now(), verified_completion_by = actor_id,
      completion_verification_note = btrim(p_verification_note), updated_at = now()
  where id = p_transaction_id and status = 'contract_signed';
  if not found then raise exception 'signed_transaction_not_found'; end if;
end;
$$;
revoke all on function public.verify_broker_transaction_completion(uuid, text) from public, anon;
grant execute on function public.verify_broker_transaction_completion(uuid, text) to authenticated;

create or replace function private.guard_transaction_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  transition_allowed boolean := false;
begin
  if tg_op = 'INSERT' then
    if (new.status = 'completed' or new.verified_completion_at is not null
        or new.verified_completion_by is not null or new.completion_verification_note is not null)
       and not private.is_admin() then
      raise exception 'platform_admin_completion_verification_required';
    end if;
    return new;
  end if;

  if (new.status = 'completed' or old.status = 'completed'
      or new.verified_completion_at is distinct from old.verified_completion_at
      or new.verified_completion_by is distinct from old.verified_completion_by
      or new.completion_verification_note is distinct from old.completion_verification_note)
     and not private.is_admin() then
    raise exception 'platform_admin_completion_verification_required';
  end if;

  if new.status is distinct from old.status then
    transition_allowed := case old.status
      when 'lead' then new.status in ('qualified', 'cancelled')
      when 'qualified' then new.status in ('viewing', 'offer', 'cancelled')
      when 'viewing' then new.status in ('offer', 'negotiation', 'cancelled')
      when 'offer' then new.status in ('negotiation', 'contract_preparation', 'cancelled')
      when 'negotiation' then new.status in ('offer', 'due_diligence', 'contract_preparation', 'cancelled')
      when 'due_diligence' then new.status in ('negotiation', 'contract_preparation', 'cancelled')
      when 'contract_preparation' then new.status in ('contract_signed', 'due_diligence', 'cancelled')
      when 'contract_signed' then new.status in ('completed', 'cancelled')
      else false
    end;
    if not transition_allowed then raise exception 'invalid_transaction_transition'; end if;
  end if;

  if new.broker_user_id is distinct from old.broker_user_id
     and not private.has_organization_role(old.organization_id, array['owner', 'agency_admin']::text[]) then
    raise exception 'transaction_reassignment_requires_admin';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_transaction_completion() from public, anon, authenticated;
create trigger transactions_guard_completion before insert or update on public.transactions
for each row execute function private.guard_transaction_completion();

create or replace function public.capture_inquiry_attribution(
  p_inquiry_id uuid,
  p_channel text,
  p_source text,
  p_medium text,
  p_campaign text,
  p_content text,
  p_term text,
  p_referral_code text,
  p_referrer_host text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  inquiry_row public.inquiries%rowtype;
  listing_row public.listings%rowtype;
begin
  if actor_id is null then raise exception 'authentication_required'; end if;
  select * into inquiry_row from public.inquiries where id = p_inquiry_id and sender_id = actor_id;
  if inquiry_row.id is null then raise exception 'inquiry_not_found'; end if;
  select * into listing_row from public.listings where id = inquiry_row.listing_id;
  if listing_row.organization_id is null then return false; end if;

  insert into public.attribution_touchpoints (
    organization_id, listing_id, inquiry_id, event_kind, channel, source, medium,
    campaign, content, term, referral_code, referrer_host
  ) values (
    listing_row.organization_id, listing_row.id, inquiry_row.id, 'inquiry',
    nullif(left(coalesce(p_channel, ''), 60), ''), nullif(left(coalesce(p_source, ''), 120), ''),
    nullif(left(coalesce(p_medium, ''), 120), ''), nullif(left(coalesce(p_campaign, ''), 160), ''),
    nullif(left(coalesce(p_content, ''), 160), ''), nullif(left(coalesce(p_term, ''), 160), ''),
    nullif(left(coalesce(p_referral_code, ''), 100), ''), nullif(left(coalesce(p_referrer_host, ''), 253), '')
  ) on conflict (inquiry_id) where inquiry_id is not null do nothing;
  return true;
end;
$$;
revoke all on function public.capture_inquiry_attribution(uuid, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.capture_inquiry_attribution(uuid, text, text, text, text, text, text, text, text) to authenticated;

create or replace function public.record_broker_usage(
  p_organization_id uuid,
  p_broker_user_id uuid,
  p_resource_key text,
  p_units bigint,
  p_idempotency_key text,
  p_provider text default null,
  p_model text default null,
  p_cost_micro_usd bigint default null,
  p_usage_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  subscription_row public.broker_subscriptions%rowtype;
  configured_limit_text text;
  configured_limit bigint;
  current_period_usage bigint;
  usage_event_id uuid;
begin
  if p_broker_user_id is null or p_organization_id is null then raise exception 'broker_and_organization_required'; end if;
  if p_units is null or p_units <= 0 then raise exception 'invalid_usage_units'; end if;
  if p_resource_key !~ '^[a-z][a-z0-9_]{1,63}$' then raise exception 'invalid_usage_resource'; end if;
  if p_idempotency_key !~ '^[A-Za-z0-9._:-]{8,160}$' then raise exception 'invalid_idempotency_key'; end if;
  if jsonb_typeof(coalesce(p_usage_metadata, '{}'::jsonb)) <> 'object' then raise exception 'invalid_usage_metadata'; end if;
  if not exists (
    select 1 from public.organization_memberships
    where organization_id = p_organization_id and user_id = p_broker_user_id and status = 'active'
  ) then raise exception 'active_broker_membership_required'; end if;

  select * into subscription_row from public.broker_subscriptions
  where broker_user_id = p_broker_user_id and organization_id = p_organization_id
    and (status = 'active' or (status = 'trialing' and trial_ends_at > now()));
  if subscription_row.broker_user_id is null then raise exception 'active_broker_plan_required'; end if;

  select usage_limits ->> p_resource_key into configured_limit_text
  from public.broker_plan_catalog where plan_code = subscription_row.plan_code and active;
  if configured_limit_text is null or configured_limit_text !~ '^[0-9]{1,18}$' then
    raise exception 'usage_limit_not_configured';
  end if;
  configured_limit := configured_limit_text::bigint;

  perform pg_advisory_xact_lock(hashtextextended(p_broker_user_id::text || ':' || p_resource_key, 0));
  select id into usage_event_id from public.broker_usage_events
  where broker_user_id = p_broker_user_id and idempotency_key = p_idempotency_key;
  if usage_event_id is not null then return usage_event_id; end if;

  select coalesce(sum(units), 0)::bigint into current_period_usage
  from public.broker_usage_events
  where broker_user_id = p_broker_user_id and resource_key = p_resource_key
    and created_at >= date_trunc('month', now());
  if current_period_usage + p_units > configured_limit then raise exception 'usage_limit_exceeded'; end if;

  insert into public.broker_usage_events (
    organization_id, broker_user_id, resource_key, units, idempotency_key,
    provider, model, cost_micro_usd, usage_metadata
  ) values (
    p_organization_id, p_broker_user_id, p_resource_key, p_units, p_idempotency_key,
    nullif(left(coalesce(p_provider, ''), 80), ''), nullif(left(coalesce(p_model, ''), 120), ''),
    p_cost_micro_usd, coalesce(p_usage_metadata, '{}'::jsonb)
  ) returning id into usage_event_id;
  return usage_event_id;
end;
$$;
revoke all on function public.record_broker_usage(uuid, uuid, text, bigint, text, text, text, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.record_broker_usage(uuid, uuid, text, bigint, text, text, text, bigint, jsonb) to service_role;

create or replace function private.guard_listing_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.organization_id is not null and not private.has_organization_role(new.organization_id, array['owner', 'agency_admin', 'broker']::text[]) then
    raise exception 'organization_access_denied';
  end if;
  if tg_op = 'UPDATE' and old.organization_id is distinct from new.organization_id then
    if old.organization_id is not null and not private.has_organization_role(old.organization_id, array['owner', 'agency_admin']::text[]) then
      raise exception 'organization_transfer_denied';
    end if;
    if new.organization_id is not null and not private.has_organization_role(new.organization_id, array['owner', 'agency_admin']::text[]) then
      raise exception 'organization_transfer_denied';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_listing_organization() from public, anon, authenticated;
drop trigger if exists listings_guard_organization on public.listings;
create trigger listings_guard_organization before insert or update of organization_id on public.listings
for each row execute function private.guard_listing_organization();

create or replace function private.log_crm_lead_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.crm_lead_events (organization_id, lead_id, actor_id, event_type, event_data)
    values (new.organization_id, new.id, auth.uid(), 'created', jsonb_build_object('status', new.status, 'source', new.source));
    return new;
  end if;
  if old.status is distinct from new.status or old.priority is distinct from new.priority
     or old.assigned_to is distinct from new.assigned_to
     or old.next_follow_up_at is distinct from new.next_follow_up_at then
    insert into public.crm_lead_events (organization_id, lead_id, actor_id, event_type, event_data)
    values (
      new.organization_id, new.id, auth.uid(), 'updated',
      jsonb_build_object(
        'old_status', old.status, 'new_status', new.status,
        'old_priority', old.priority, 'new_priority', new.priority,
        'old_assigned_to', old.assigned_to, 'new_assigned_to', new.assigned_to,
        'old_follow_up_at', old.next_follow_up_at, 'new_follow_up_at', new.next_follow_up_at
      )
    );
  end if;
  return new;
end;
$$;
revoke all on function private.log_crm_lead_event() from public, anon, authenticated;
create trigger crm_leads_audit_event after insert or update on public.crm_leads
for each row execute function private.log_crm_lead_event();

create or replace function private.log_viewing_appointment_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.viewing_appointment_events (organization_id, appointment_id, actor_id, event_type, event_data)
    values (new.organization_id, new.id, auth.uid(), 'created', jsonb_build_object('scheduled_at', new.scheduled_at, 'status', new.status));
    return new;
  end if;
  if old.status is distinct from new.status or old.scheduled_at is distinct from new.scheduled_at
     or old.outcome is distinct from new.outcome or old.cancellation_reason is distinct from new.cancellation_reason then
    insert into public.viewing_appointment_events (organization_id, appointment_id, actor_id, event_type, event_data)
    values (
      new.organization_id, new.id, auth.uid(), 'updated',
      jsonb_build_object('old_status', old.status, 'new_status', new.status,
        'old_scheduled_at', old.scheduled_at, 'new_scheduled_at', new.scheduled_at,
        'outcome', new.outcome, 'cancellation_reason', new.cancellation_reason)
    );
  end if;
  return new;
end;
$$;
revoke all on function private.log_viewing_appointment_event() from public, anon, authenticated;
create trigger viewing_appointments_audit_event after insert or update on public.viewing_appointments
for each row execute function private.log_viewing_appointment_event();

create or replace function private.log_crm_task_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.crm_task_events (organization_id, task_id, actor_id, event_type, event_data)
    values (new.organization_id, new.id, auth.uid(), 'created', jsonb_build_object('status', new.status, 'assigned_to', new.assigned_to, 'due_at', new.due_at));
    return new;
  end if;
  if old.status is distinct from new.status or old.assigned_to is distinct from new.assigned_to
     or old.due_at is distinct from new.due_at then
    insert into public.crm_task_events (organization_id, task_id, actor_id, event_type, event_data)
    values (new.organization_id, new.id, auth.uid(), 'updated', jsonb_build_object(
      'old_status', old.status, 'new_status', new.status,
      'old_assigned_to', old.assigned_to, 'new_assigned_to', new.assigned_to,
      'old_due_at', old.due_at, 'new_due_at', new.due_at
    ));
  end if;
  return new;
end;
$$;
revoke all on function private.log_crm_task_event() from public, anon, authenticated;
create trigger crm_tasks_audit_event after insert or update on public.crm_tasks
for each row execute function private.log_crm_task_event();

create or replace function private.log_transaction_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.transaction_events (organization_id, transaction_id, actor_id, event_type, event_data)
    values (new.organization_id, new.id, auth.uid(), 'created', jsonb_build_object('status', new.status));
    return new;
  end if;
  if old.status is distinct from new.status then
    insert into public.transaction_events (organization_id, transaction_id, actor_id, event_type, event_data)
    values (new.organization_id, new.id, auth.uid(), 'status_changed', jsonb_build_object('old_status', old.status, 'new_status', new.status));
  end if;
  return new;
end;
$$;
revoke all on function private.log_transaction_event() from public, anon, authenticated;
create trigger transactions_audit_event after insert or update on public.transactions
for each row execute function private.log_transaction_event();

create or replace function private.validate_org_record_links()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_organization_role(new.organization_id, array['owner', 'agency_admin', 'broker', 'assistant']::text[]) then
    raise exception 'organization_access_denied';
  end if;
  if tg_table_name = 'viewing_appointments' and not exists (
    select 1 from public.listings l where l.id = new.listing_id and l.organization_id = new.organization_id
  ) then raise exception 'listing_not_in_organization'; end if;
  if tg_table_name = 'transactions' and not exists (
    select 1 from public.listings l where l.id = new.listing_id and l.organization_id = new.organization_id
  ) then raise exception 'listing_not_in_organization'; end if;
  return new;
end;
$$;
revoke all on function private.validate_org_record_links() from public, anon, authenticated;
create trigger viewing_appointments_validate_org before insert or update on public.viewing_appointments
for each row execute function private.validate_org_record_links();
create trigger transactions_validate_org before insert or update on public.transactions
for each row execute function private.validate_org_record_links();

create or replace function private.validate_crm_task_links()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_organization_role(new.organization_id, array['owner', 'agency_admin', 'broker', 'assistant']::text[]) then
    raise exception 'organization_access_denied';
  end if;
  if new.lead_id is not null and not exists (
    select 1 from public.crm_leads l where l.id = new.lead_id and l.organization_id = new.organization_id
  ) then raise exception 'lead_not_in_organization'; end if;
  if new.contact_id is not null and not exists (
    select 1 from public.crm_contacts c where c.id = new.contact_id and c.organization_id = new.organization_id
  ) then raise exception 'contact_not_in_organization'; end if;
  if new.listing_id is not null and not exists (
    select 1 from public.listings l where l.id = new.listing_id and l.organization_id = new.organization_id
  ) then raise exception 'listing_not_in_organization'; end if;
  if new.appointment_id is not null and not exists (
    select 1 from public.viewing_appointments a where a.id = new.appointment_id and a.organization_id = new.organization_id
  ) then raise exception 'appointment_not_in_organization'; end if;
  if new.transaction_id is not null and not exists (
    select 1 from public.transactions t where t.id = new.transaction_id and t.organization_id = new.organization_id
  ) then raise exception 'transaction_not_in_organization'; end if;
  return new;
end;
$$;
revoke all on function private.validate_crm_task_links() from public, anon, authenticated;
create trigger crm_tasks_validate_org before insert or update on public.crm_tasks
for each row execute function private.validate_crm_task_links();

create or replace function private.guard_tenant_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.organization_id is distinct from old.organization_id
     or new.created_by is distinct from old.created_by then
    raise exception 'tenant_identity_is_immutable';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_tenant_identity() from public, anon, authenticated;
create trigger crm_contacts_guard_tenant_identity before update on public.crm_contacts
for each row execute function private.guard_tenant_identity();
create trigger crm_leads_guard_tenant_identity before update on public.crm_leads
for each row execute function private.guard_tenant_identity();
create trigger crm_tasks_guard_tenant_identity before update on public.crm_tasks
for each row execute function private.guard_tenant_identity();
create trigger viewing_appointments_guard_tenant_identity before update on public.viewing_appointments
for each row execute function private.guard_tenant_identity();
create trigger transactions_guard_tenant_identity before update on public.transactions
for each row execute function private.guard_tenant_identity();

create trigger organizations_set_updated_at before update on public.organizations
for each row execute function public.set_updated_at();
create trigger organization_memberships_set_updated_at before update on public.organization_memberships
for each row execute function public.set_updated_at();
create trigger broker_profiles_set_updated_at before update on public.broker_profiles
for each row execute function public.set_updated_at();
create trigger broker_plan_catalog_set_updated_at before update on public.broker_plan_catalog
for each row execute function public.set_updated_at();
create trigger broker_subscriptions_set_updated_at before update on public.broker_subscriptions
for each row execute function public.set_updated_at();
create trigger crm_contacts_set_updated_at before update on public.crm_contacts
for each row execute function public.set_updated_at();
create trigger crm_leads_set_updated_at before update on public.crm_leads
for each row execute function public.set_updated_at();
create trigger broker_availability_set_updated_at before update on public.broker_availability
for each row execute function public.set_updated_at();
create trigger viewing_appointments_set_updated_at before update on public.viewing_appointments
for each row execute function public.set_updated_at();
create trigger transactions_set_updated_at before update on public.transactions
for each row execute function public.set_updated_at();
create trigger crm_tasks_set_updated_at before update on public.crm_tasks
for each row execute function public.set_updated_at();

alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.organization_invitations enable row level security;
alter table public.organization_events enable row level security;
alter table public.broker_profiles enable row level security;
alter table public.broker_plan_catalog enable row level security;
alter table public.broker_subscriptions enable row level security;
alter table public.broker_usage_events enable row level security;
alter table public.crm_contacts enable row level security;
alter table public.crm_leads enable row level security;
alter table public.crm_lead_events enable row level security;
alter table public.broker_availability enable row level security;
alter table public.viewing_appointments enable row level security;
alter table public.viewing_appointment_events enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_events enable row level security;
alter table public.crm_tasks enable row level security;
alter table public.crm_task_events enable row level security;
alter table public.attribution_touchpoints enable row level security;

revoke all on public.organizations, public.organization_memberships, public.organization_invitations,
  public.organization_events, public.broker_profiles, public.broker_plan_catalog,
  public.broker_subscriptions, public.broker_usage_events, public.crm_contacts, public.crm_leads,
  public.crm_lead_events, public.broker_availability, public.viewing_appointments,
  public.viewing_appointment_events, public.transactions, public.transaction_events,
  public.crm_tasks, public.crm_task_events, public.attribution_touchpoints
from public, anon, authenticated;

grant select on public.organizations to authenticated;
grant update (name, slug) on public.organizations to authenticated;
grant select on public.organization_memberships, public.organization_invitations, public.organization_events to authenticated;
grant select on public.broker_profiles, public.broker_plan_catalog, public.broker_subscriptions, public.broker_usage_events to authenticated;
grant update (display_name, tier, entitlements, usage_limits, active) on public.broker_plan_catalog to authenticated;
grant select on public.crm_contacts, public.crm_leads, public.crm_lead_events to authenticated;
grant insert, update on public.crm_contacts to authenticated;
grant select, insert, update on public.broker_availability, public.viewing_appointments, public.transactions, public.crm_tasks to authenticated;
grant select on public.viewing_appointment_events, public.transaction_events, public.crm_task_events, public.attribution_touchpoints to authenticated;

create policy profiles_read_organization_members on public.profiles for select to authenticated
using (
  exists (
    select 1 from public.organization_memberships as target_membership
    where target_membership.user_id = profiles.id
      and private.has_organization_role(target_membership.organization_id, null)
  )
);

create policy organizations_read_member on public.organizations for select to authenticated
using (private.has_organization_role(id, null));
create policy organizations_update_admin on public.organizations for update to authenticated
using (private.has_organization_role(id, array['owner', 'agency_admin']::text[]))
with check (private.has_organization_role(id, array['owner', 'agency_admin']::text[]));

create policy organization_memberships_read_member on public.organization_memberships for select to authenticated
using (private.has_organization_role(organization_id, null));

create policy organization_invitations_read_admin on public.organization_invitations for select to authenticated
using (private.has_organization_role(organization_id, array['owner', 'agency_admin']::text[]));

create policy organization_events_read_member on public.organization_events for select to authenticated
using (private.has_organization_role(organization_id, null));

create policy broker_profiles_read_self_or_team_admin on public.broker_profiles for select to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.organization_memberships as target_membership
    where target_membership.user_id = broker_profiles.user_id
      and private.has_organization_role(target_membership.organization_id, array['owner', 'agency_admin']::text[])
  )
);
create policy broker_profiles_update_self on public.broker_profiles for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()) and verification_status = 'unverified');

create policy broker_plan_catalog_read_active on public.broker_plan_catalog for select to authenticated
using (active);
create policy broker_plan_catalog_update_admin on public.broker_plan_catalog for update to authenticated
using (private.is_admin()) with check (private.is_admin());

create policy broker_subscriptions_read_self_or_admin on public.broker_subscriptions for select to authenticated
using (broker_user_id = (select auth.uid()) or private.has_organization_role(organization_id, null));

create policy broker_usage_events_read_self_or_admin on public.broker_usage_events for select to authenticated
using (broker_user_id = (select auth.uid()) or private.has_organization_role(organization_id, array['owner', 'agency_admin']::text[]));

create policy crm_contacts_read_sales_roles on public.crm_contacts for select to authenticated
using (private.has_organization_role(organization_id, array['owner', 'agency_admin', 'broker', 'assistant']::text[]));
create policy crm_contacts_insert_sales_roles on public.crm_contacts for insert to authenticated
with check (
  created_by = (select auth.uid())
  and private.has_organization_role(organization_id, array['owner', 'agency_admin', 'broker', 'assistant']::text[])
  and private.has_broker_entitlement(organization_id, 'crm')
);
create policy crm_contacts_update_sales_roles on public.crm_contacts for update to authenticated
using (private.has_organization_role(organization_id, array['owner', 'agency_admin', 'broker', 'assistant']::text[]) and private.has_broker_entitlement(organization_id, 'crm'))
with check (private.has_organization_role(organization_id, array['owner', 'agency_admin', 'broker', 'assistant']::text[]) and private.has_broker_entitlement(organization_id, 'crm'));

create policy crm_leads_read_sales_roles on public.crm_leads for select to authenticated
using (private.has_organization_role(organization_id, array['owner', 'agency_admin', 'broker', 'assistant', 'read_only']::text[]));
create policy crm_lead_events_read_member on public.crm_lead_events for select to authenticated
using (private.has_organization_role(organization_id, null));

create policy broker_availability_read_member on public.broker_availability for select to authenticated
using (private.has_organization_role(organization_id, null));
create policy broker_availability_insert_broker on public.broker_availability for insert to authenticated
with check (broker_user_id = (select auth.uid()) and private.has_organization_role(organization_id, array['owner', 'agency_admin', 'broker']::text[]) and private.has_broker_entitlement(organization_id, 'viewings'));
create policy broker_availability_update_broker on public.broker_availability for update to authenticated
using (broker_user_id = (select auth.uid()) or private.has_organization_role(organization_id, array['owner', 'agency_admin']::text[]))
with check (private.has_organization_role(organization_id, array['owner', 'agency_admin', 'broker']::text[]) and private.has_broker_entitlement(organization_id, 'viewings'));

create policy viewing_appointments_read_member on public.viewing_appointments for select to authenticated
using (private.has_organization_role(organization_id, null));
create policy viewing_appointments_insert_sales_roles on public.viewing_appointments for insert to authenticated
with check (created_by = (select auth.uid()) and private.has_organization_role(organization_id, array['owner', 'agency_admin', 'broker', 'assistant']::text[]) and private.has_broker_entitlement(organization_id, 'viewings'));
create policy viewing_appointments_update_sales_roles on public.viewing_appointments for update to authenticated
using (private.has_organization_role(organization_id, array['owner', 'agency_admin', 'broker', 'assistant']::text[]) and private.has_broker_entitlement(organization_id, 'viewings'))
with check (private.has_organization_role(organization_id, array['owner', 'agency_admin', 'broker', 'assistant']::text[]) and private.has_broker_entitlement(organization_id, 'viewings'));
create policy viewing_appointment_events_read_member on public.viewing_appointment_events for select to authenticated
using (private.has_organization_role(organization_id, null));

create policy transactions_read_member on public.transactions for select to authenticated
using (private.has_organization_role(organization_id, null));
create policy transactions_insert_broker on public.transactions for insert to authenticated
with check (
  created_by = (select auth.uid()) and broker_user_id = (select auth.uid())
  and private.has_organization_role(organization_id, array['owner', 'agency_admin', 'broker']::text[])
  and private.has_broker_entitlement(organization_id, 'transaction_pipeline')
);
create policy transactions_update_assigned_broker on public.transactions for update to authenticated
using ((broker_user_id = (select auth.uid()) or private.has_organization_role(organization_id, array['owner', 'agency_admin']::text[])) and private.has_broker_entitlement(organization_id, 'transaction_pipeline'))
with check (private.has_organization_role(organization_id, array['owner', 'agency_admin', 'broker']::text[]) and private.has_broker_entitlement(organization_id, 'transaction_pipeline'));
create policy transaction_events_read_member on public.transaction_events for select to authenticated
using (private.has_organization_role(organization_id, null));

create policy crm_tasks_read_member on public.crm_tasks for select to authenticated
using (private.has_organization_role(organization_id, null));
create policy crm_tasks_insert_sales_roles on public.crm_tasks for insert to authenticated
with check (
  created_by = (select auth.uid())
  and private.has_organization_role(organization_id, array['owner', 'agency_admin', 'broker', 'assistant']::text[])
  and private.has_broker_entitlement(organization_id, 'tasks')
);
create policy crm_tasks_update_assignee_or_admin on public.crm_tasks for update to authenticated
using ((assigned_to = (select auth.uid()) or created_by = (select auth.uid()) or private.has_organization_role(organization_id, array['owner', 'agency_admin']::text[])) and private.has_broker_entitlement(organization_id, 'tasks'))
with check (private.has_organization_role(organization_id, array['owner', 'agency_admin', 'broker', 'assistant']::text[]) and private.has_broker_entitlement(organization_id, 'tasks'));
create policy crm_task_events_read_member on public.crm_task_events for select to authenticated
using (private.has_organization_role(organization_id, null));

create policy attribution_touchpoints_read_member on public.attribution_touchpoints for select to authenticated
using (private.has_organization_role(organization_id, array['owner', 'agency_admin', 'broker', 'marketing_manager', 'read_only']::text[]));

-- Extend listing and inquiry visibility only to active members of the owning organization.
drop policy if exists listings_read_authenticated on public.listings;
create policy listings_read_authenticated on public.listings for select to authenticated
using (
  status = 'published' or owner_id = (select auth.uid()) or private.is_admin()
  or private.has_organization_role(organization_id, null)
);
drop policy if exists listings_insert_access on public.listings;
create policy listings_insert_access on public.listings for insert to authenticated
with check (
  ((owner_id = (select auth.uid())) and status in ('draft', 'pending_review') and published_at is null
    and (organization_id is null or (private.has_organization_role(organization_id, array['owner', 'agency_admin', 'broker']::text[]) and private.has_broker_entitlement(organization_id, 'listing_management'))))
  or private.is_admin()
);
drop policy if exists listings_update_access on public.listings;
create policy listings_update_access on public.listings for update to authenticated
using (
  (owner_id = (select auth.uid()) and (organization_id is null or private.has_broker_entitlement(organization_id, 'listing_management')))
  or private.is_admin()
  or (private.has_organization_role(organization_id, array['owner', 'agency_admin', 'broker']::text[]) and private.has_broker_entitlement(organization_id, 'listing_management'))
)
with check (
  (owner_id = (select auth.uid()) and (organization_id is null or private.has_broker_entitlement(organization_id, 'listing_management')))
  or private.is_admin()
  or (private.has_organization_role(organization_id, array['owner', 'agency_admin', 'broker']::text[]) and private.has_broker_entitlement(organization_id, 'listing_management'))
);
drop policy if exists listings_delete_access on public.listings;
create policy listings_delete_access on public.listings for delete to authenticated
using (
  private.is_admin()
  or (owner_id = (select auth.uid()) and status = 'draft' and (organization_id is null or private.has_broker_entitlement(organization_id, 'listing_management')))
  or (status = 'draft' and private.has_organization_role(organization_id, array['owner', 'agency_admin']::text[]) and private.has_broker_entitlement(organization_id, 'listing_management'))
);

drop policy if exists inquiries_read_participant on public.inquiries;
create policy inquiries_read_participant on public.inquiries for select to authenticated
using (
  sender_id = (select auth.uid()) or private.is_admin()
  or exists (
    select 1 from public.listings as listing
    where listing.id = inquiries.listing_id
      and (listing.owner_id = (select auth.uid())
        or private.has_organization_role(listing.organization_id, array['owner', 'agency_admin', 'broker', 'assistant']::text[]))
  )
);

drop policy if exists listing_images_read_authenticated on public.listing_images;
create policy listing_images_read_authenticated on public.listing_images for select to authenticated
using (exists (
  select 1 from public.listings as listing
  where listing.id = listing_images.listing_id
    and (listing.status = 'published' or listing.owner_id = (select auth.uid()) or private.is_admin()
      or private.has_organization_role(listing.organization_id, null))
));
drop policy if exists listing_images_insert_access on public.listing_images;
create policy listing_images_insert_access on public.listing_images for insert to authenticated
with check (exists (
  select 1 from public.listings as listing
  where listing.id = listing_images.listing_id
    and (private.is_admin()
      or (listing.owner_id = (select auth.uid()) and (listing.organization_id is null or private.has_broker_entitlement(listing.organization_id, 'listing_management')))
      or (private.has_organization_role(listing.organization_id, array['owner', 'agency_admin', 'broker']::text[])
        and private.has_broker_entitlement(listing.organization_id, 'listing_management')))
));
drop policy if exists listing_images_update_access on public.listing_images;
create policy listing_images_update_access on public.listing_images for update to authenticated
using (exists (
  select 1 from public.listings as listing
  where listing.id = listing_images.listing_id
    and (private.is_admin()
      or (listing.owner_id = (select auth.uid()) and (listing.organization_id is null or private.has_broker_entitlement(listing.organization_id, 'listing_management')))
      or (private.has_organization_role(listing.organization_id, array['owner', 'agency_admin', 'broker']::text[])
        and private.has_broker_entitlement(listing.organization_id, 'listing_management')))
))
with check (exists (
  select 1 from public.listings as listing
  where listing.id = listing_images.listing_id
    and (private.is_admin()
      or (listing.owner_id = (select auth.uid()) and (listing.organization_id is null or private.has_broker_entitlement(listing.organization_id, 'listing_management')))
      or (private.has_organization_role(listing.organization_id, array['owner', 'agency_admin', 'broker']::text[])
        and private.has_broker_entitlement(listing.organization_id, 'listing_management')))
));
drop policy if exists listing_images_delete_access on public.listing_images;
create policy listing_images_delete_access on public.listing_images for delete to authenticated
using (exists (
  select 1 from public.listings as listing
  where listing.id = listing_images.listing_id
    and (private.is_admin()
      or (listing.owner_id = (select auth.uid()) and (listing.organization_id is null or private.has_broker_entitlement(listing.organization_id, 'listing_management')))
      or (private.has_organization_role(listing.organization_id, array['owner', 'agency_admin', 'broker']::text[])
        and private.has_broker_entitlement(listing.organization_id, 'listing_management')))
));

drop policy if exists private_details_read_owner_admin on public.private_listing_details;
drop policy if exists private_details_read_broker_team on public.private_listing_details;
create policy private_details_read_broker_team on public.private_listing_details for select to authenticated
using (private.is_admin() or exists (
  select 1 from public.listings as listing
  where listing.id = private_listing_details.listing_id
    and (listing.owner_id = (select auth.uid())
      or private.has_organization_role(listing.organization_id, array['owner', 'agency_admin', 'broker', 'assistant']::text[]))
));
drop policy if exists private_details_insert_access on public.private_listing_details;
create policy private_details_insert_access on public.private_listing_details for insert to authenticated
with check (private.is_admin() or exists (
  select 1 from public.listings as listing
  where listing.id = private_listing_details.listing_id
    and ((listing.owner_id = (select auth.uid()) and (listing.organization_id is null or private.has_broker_entitlement(listing.organization_id, 'listing_management')))
      or (private.has_organization_role(listing.organization_id, array['owner', 'agency_admin', 'broker']::text[])
        and private.has_broker_entitlement(listing.organization_id, 'listing_management')))
));
drop policy if exists private_details_update_access on public.private_listing_details;
create policy private_details_update_access on public.private_listing_details for update to authenticated
using (private.is_admin() or exists (
  select 1 from public.listings as listing
  where listing.id = private_listing_details.listing_id
    and ((listing.owner_id = (select auth.uid()) and (listing.organization_id is null or private.has_broker_entitlement(listing.organization_id, 'listing_management')))
      or (private.has_organization_role(listing.organization_id, array['owner', 'agency_admin', 'broker']::text[])
        and private.has_broker_entitlement(listing.organization_id, 'listing_management')))
))
with check (private.is_admin() or exists (
  select 1 from public.listings as listing
  where listing.id = private_listing_details.listing_id
    and ((listing.owner_id = (select auth.uid()) and (listing.organization_id is null or private.has_broker_entitlement(listing.organization_id, 'listing_management')))
      or (private.has_organization_role(listing.organization_id, array['owner', 'agency_admin', 'broker']::text[])
        and private.has_broker_entitlement(listing.organization_id, 'listing_management')))
));

drop policy if exists imoteasy_images_read_authenticated on storage.objects;
create policy imoteasy_images_read_authenticated on storage.objects for select to authenticated
using (bucket_id = 'imoteasy-listings' and (
  (select auth.uid())::text = (storage.foldername(name))[1]
  or private.is_admin()
  or exists (
    select 1 from public.listing_images as image
    join public.listings as listing on listing.id = image.listing_id
    where image.storage_path = storage.objects.name
      and (listing.status = 'published' or listing.owner_id = (select auth.uid()) or private.has_organization_role(listing.organization_id, null))
  )
));
drop policy if exists imoteasy_images_owner_update on storage.objects;
create policy imoteasy_images_owner_update on storage.objects for update to authenticated
using (bucket_id = 'imoteasy-listings' and (
  (storage.foldername(name))[1] = (select auth.uid())::text
  or private.is_admin()
  or exists (
    select 1 from public.listing_images as image
    join public.listings as listing on listing.id = image.listing_id
    where image.storage_path = storage.objects.name
      and private.has_organization_role(listing.organization_id, array['owner', 'agency_admin', 'broker']::text[])
      and private.has_broker_entitlement(listing.organization_id, 'listing_management')
  )
))
with check (bucket_id = 'imoteasy-listings' and (
  (storage.foldername(name))[1] = (select auth.uid())::text
  or private.is_admin()
  or exists (
    select 1 from public.listing_images as image
    join public.listings as listing on listing.id = image.listing_id
    where image.storage_path = storage.objects.name
      and private.has_organization_role(listing.organization_id, array['owner', 'agency_admin', 'broker']::text[])
      and private.has_broker_entitlement(listing.organization_id, 'listing_management')
  )
));
drop policy if exists imoteasy_images_owner_delete on storage.objects;
create policy imoteasy_images_owner_delete on storage.objects for delete to authenticated
using (bucket_id = 'imoteasy-listings' and (
  (storage.foldername(name))[1] = (select auth.uid())::text
  or private.is_admin()
  or exists (
    select 1 from public.listing_images as image
    join public.listings as listing on listing.id = image.listing_id
    where image.storage_path = storage.objects.name
      and private.has_organization_role(listing.organization_id, array['owner', 'agency_admin', 'broker']::text[])
      and private.has_broker_entitlement(listing.organization_id, 'listing_management')
  )
));

grant select on public.listings to authenticated;
grant insert, update, delete on public.listings to authenticated;
grant select on public.inquiries to authenticated;

commit;
