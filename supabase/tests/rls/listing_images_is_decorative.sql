-- Accessible alt text for listing_images.is_decorative.
--
-- Run only against a disposable local database after:
--   1. supabase/tests/rls/local_harness.sql
--   2. every file in supabase/migrations/ in name order, including
--      20261112160000_listing_images_is_decorative.sql
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

create function pg_temp.expect_error(p_sql text, p_match text, p_message text)
returns void
language plpgsql
as $$
begin
  execute p_sql;
  select pg_temp.check(false, p_message);
exception
  when others then
    if sqlerrm not like '%' || p_match || '%' then
      raise;
    end if;
end;
$$;

grant execute on function pg_temp.login(uuid) to authenticated, service_role;
grant execute on function pg_temp.check(boolean, text) to authenticated, service_role;
grant execute on function pg_temp.expect_error(text, text, text) to authenticated, service_role;
grant select, insert, update, delete on public.listings, public.listing_images to service_role;

select pg_temp.check(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'listing_images'
      and column_name = 'is_decorative'
      and data_type = 'boolean'
      and is_nullable = 'NO'
      and column_default ilike '%false%'
  ),
  'is_decorative is not boolean not null default false'
);

select pg_temp.check(
  not exists (
    select 1
    from pg_constraint
    where conrelid in ('public.listing_images'::regclass, 'public.listings'::regclass)
      and not convalidated
      and (
        pg_get_constraintdef(oid) ilike '%is_decorative%'
        or pg_get_constraintdef(oid) ilike '%accessible_alt%'
        or conname ilike '%decorative%'
        or conname ilike '%accessible_alt%'
      )
  ),
  'decorative/accessible-alt constraint was created NOT VALID'
);

select pg_temp.check(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.listing_images'::regclass
      and tgname = 'listing_images_enforce_accessible_alt'
      and tgenabled = 'O'
  )
  and exists (
    select 1 from pg_trigger
    where tgrelid = 'public.listings'::regclass
      and tgname = 'listings_enforce_accessible_alt'
      and tgenabled = 'O'
  ),
  'accessible-alt triggers are missing'
);

select pg_temp.check(
  current_setting('standard_conforming_strings') = 'on',
  'standard_conforming_strings is not on'
);

select pg_temp.check(
  (select provolatile from pg_proc where oid = 'private.listing_alt_text_has_visible_content(text)'::regprocedure) = 'i'
  and (select provolatile from pg_proc where oid = 'private.listing_alt_invisible_chars()'::regprocedure) = 'i',
  'visible-content helpers are not IMMUTABLE'
);

select pg_temp.check(
  not (select prosecdef from pg_proc where oid = 'private.enforce_listing_image_accessible_alt()'::regprocedure)
  and (select prosecdef from pg_proc where oid = 'private.can_manage_listing(uuid)'::regprocedure)
  and (select prosecdef from pg_proc where oid = 'private.listing_status_for_alt_enforcement(uuid)'::regprocedure)
  and (select prosecdef from pg_proc where oid = 'private.listing_images_missing_accessible_alt(uuid)'::regprocedure),
  'trigger is not SECURITY INVOKER or access helpers are not SECURITY DEFINER'
);

do $visible$
declare
  -- Same code points as private.listing_alt_invisible_chars() and
  -- LISTING_ALT_INVISIBLE_CODEPOINTS. The helper uses translate(chr()),
  -- not [:space:], so the result does not depend on lc_ctype.
  codes int[] := array[
    9, 10, 11, 12, 13, 32,
    133, 160, 173,
    4447, 4448, 5760, 6158,
    8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199,
    8200, 8201, 8202, 8203, 8204, 8205, 8206, 8207,
    8232, 8233, 8239, 8287,
    8288, 8289, 8290, 8291, 8292,
    10240, 12288, 12644, 65279, 65440
  ];
  code int;
  all_invisible text := '';
begin
  perform pg_temp.check(
    length(private.listing_alt_invisible_chars()) = cardinality(codes),
    'invisible character list length does not match the documented set'
  );
  foreach code in array codes loop
    perform pg_temp.check(
      not private.listing_alt_text_has_visible_content(chr(code)),
      format('U+%s was treated as visible', upper(to_hex(code)))
    );
    all_invisible := all_invisible || chr(code);
  end loop;
  perform pg_temp.check(
    not private.listing_alt_text_has_visible_content(all_invisible),
    'concatenation of the invisible list was treated as visible'
  );
  perform pg_temp.check(
    not private.listing_alt_text_has_visible_content(chr(8199))
    and not private.listing_alt_text_has_visible_content(chr(8239))
    and not private.listing_alt_text_has_visible_content(chr(12288))
    and not private.listing_alt_text_has_visible_content(chr(8232)),
    'U+2007, U+202F, U+3000, or U+2028 was treated as visible'
  );
  perform pg_temp.check(
    private.listing_alt_text_has_visible_content('Кухня')
    and private.listing_alt_text_has_visible_content(chr(8199) || 'Кухня' || chr(8239))
    and private.listing_alt_text_has_visible_content(chr(12288) || 'Кухня' || chr(8232)),
    'visible text mixed with invisible characters was rejected'
  );
end;
$visible$;

insert into auth.users (id, email, aud, role, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  (
    '00000000-0000-4000-8000-0000000000b1',
    'owner-decorative@example.invalid',
    'authenticated',
    'authenticated',
    '',
    now(),
    '{}'::jsonb,
    jsonb_build_object('display_name', 'Owner')
  ),
  (
    '00000000-0000-4000-8000-0000000000b2',
    'admin-decorative@example.invalid',
    'authenticated',
    'authenticated',
    '',
    now(),
    '{}'::jsonb,
    jsonb_build_object('display_name', 'Admin')
  ),
  (
    '00000000-0000-4000-8000-0000000000b3',
    'outsider-decorative@example.invalid',
    'authenticated',
    'authenticated',
    '',
    now(),
    '{}'::jsonb,
    jsonb_build_object('display_name', 'Outsider')
  );

-- Bypass guard_profile_role only for this fixture.
set local session_replication_role = replica;
update public.profiles
set account_type = 'admin'
where id = '00000000-0000-4000-8000-0000000000b2';
set local session_replication_role = origin;

select pg_temp.login('00000000-0000-4000-8000-0000000000b1');

insert into public.listings (
  id, owner_id, title, slug, description, property_type, transaction_type,
  city, price_eur, area_sqm, status
) values (
  '00000000-0000-4000-8000-0000000000f1',
  '00000000-0000-4000-8000-0000000000b1',
  'Чернова обява за алтернативен текст',
  'draft-accessible-alt',
  'Описание на чернова обява, достатъчно дълго за проверката.',
  'apartment',
  'sale',
  'София',
  120000,
  70,
  'draft'
);

insert into public.listing_images (id, listing_id, storage_path, alt_text, position, is_cover, is_decorative)
values (
  '00000000-0000-4000-8000-000000000011',
  '00000000-0000-4000-8000-0000000000f1',
  '00000000-0000-4000-8000-0000000000b1/00000000-0000-4000-8000-0000000000f1/cover.jpg',
  '',
  0,
  true,
  false
);

select pg_temp.expect_error(
  $sql$
    update public.listings
    set status = 'pending_review'
    where id = '00000000-0000-4000-8000-0000000000f1'
  $sql$,
  'listing_image_alt_required',
  'draft with empty alt was allowed into pending_review'
);

update public.listing_images
set alt_text = '   '
where id = '00000000-0000-4000-8000-000000000011';

select pg_temp.expect_error(
  $sql$
    update public.listings
    set status = 'pending_review'
    where id = '00000000-0000-4000-8000-0000000000f1'
  $sql$,
  'listing_image_alt_required',
  'whitespace-only alt was treated as present'
);

select pg_temp.login('00000000-0000-4000-8000-0000000000b3');
select pg_temp.expect_error(
  $sql$
    update public.listing_images
    set alt_text = 'Чужд текст'
    where id = '00000000-0000-4000-8000-000000000011'
  $sql$,
  'listing_image_access_denied',
  'outsider could update another owner''s image and learn review state'
);

-- Forged JWT claim must not bypass the check. The session is still the
-- table owner here, so RLS does not apply and only the trigger decides.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b3', true),
       set_config('request.jwt.claim.role', 'service_role', true),
       set_config('request.jwt.claims',
         json_build_object('sub', '00000000-0000-4000-8000-0000000000b3', 'role', 'service_role')::text, true);
select pg_temp.check(current_user is distinct from 'service_role', 'current_user was already service_role');
select pg_temp.check(auth.role() = 'service_role', 'forged service_role claim was not applied');
select pg_temp.expect_error(
  $sql$
    update public.listing_images
    set alt_text = 'Подправен claim'
    where id = '00000000-0000-4000-8000-000000000011'
  $sql$,
  'listing_image_access_denied',
  'forged service_role JWT claim bypassed the ownership check'
);

-- The same forged claim as the authenticated role is also denied.
set local role authenticated;
select pg_temp.expect_error(
  $sql$
    insert into public.listing_images (listing_id, storage_path, alt_text, position, is_cover, is_decorative)
    values (
      '00000000-0000-4000-8000-0000000000f1',
      'forged/service-role.jpg',
      'Подправен claim',
      90,
      false,
      false
    )
  $sql$,
  'listing_image_access_denied',
  'authenticated role with a forged service_role claim inserted a foreign image'
);
update public.listing_images
set alt_text = 'Подправен claim'
where id = '00000000-0000-4000-8000-000000000011';
reset role;
select pg_temp.check(
  (select alt_text from public.listing_images where id = '00000000-0000-4000-8000-000000000011') is distinct from 'Подправен claim',
  'authenticated role with a forged service_role claim updated a foreign image'
);

-- A real SET ROLE service_role may update the row.
set local role service_role;
update public.listing_images
set alt_text = 'Служебен път'
where id = '00000000-0000-4000-8000-000000000011';
reset role;
select pg_temp.check(
  (select alt_text from public.listing_images where id = '00000000-0000-4000-8000-000000000011') = 'Служебен път',
  'SET ROLE service_role could not update listing images'
);
select pg_temp.login('00000000-0000-4000-8000-0000000000b1');

update public.listing_images
set alt_text = chr(9)
where id = '00000000-0000-4000-8000-000000000011';
select pg_temp.expect_error(
  $sql$
    update public.listings
    set status = 'pending_review'
    where id = '00000000-0000-4000-8000-0000000000f1'
  $sql$,
  'listing_image_alt_required',
  'TAB-only alt was treated as present'
);

update public.listing_images
set alt_text = chr(10)
where id = '00000000-0000-4000-8000-000000000011';
select pg_temp.expect_error(
  $sql$
    update public.listings
    set status = 'pending_review'
    where id = '00000000-0000-4000-8000-0000000000f1'
  $sql$,
  'listing_image_alt_required',
  'newline-only alt was treated as present'
);

update public.listing_images
set alt_text = chr(160)
where id = '00000000-0000-4000-8000-000000000011';
select pg_temp.expect_error(
  $sql$
    update public.listings
    set status = 'pending_review'
    where id = '00000000-0000-4000-8000-0000000000f1'
  $sql$,
  'listing_image_alt_required',
  'NBSP-only alt was treated as present'
);

update public.listing_images
set alt_text = chr(8203)
where id = '00000000-0000-4000-8000-000000000011';
select pg_temp.expect_error(
  $sql$
    update public.listings
    set status = 'pending_review'
    where id = '00000000-0000-4000-8000-0000000000f1'
  $sql$,
  'listing_image_alt_required',
  'ZWSP-only alt was treated as present'
);

update public.listing_images
set alt_text = chr(65279)
where id = '00000000-0000-4000-8000-000000000011';
select pg_temp.expect_error(
  $sql$
    update public.listings
    set status = 'pending_review'
    where id = '00000000-0000-4000-8000-0000000000f1'
  $sql$,
  'listing_image_alt_required',
  'BOM-only alt was treated as present'
);

update public.listing_images
set alt_text = chr(8203) || 'Дневна с тераса' || chr(160)
where id = '00000000-0000-4000-8000-000000000011';

update public.listings
set status = 'pending_review'
where id = '00000000-0000-4000-8000-0000000000f1';

select pg_temp.check(
  (select status from public.listings where id = '00000000-0000-4000-8000-0000000000f1') = 'pending_review',
  'listing with alt text did not reach pending_review'
);

select pg_temp.expect_error(
  $sql$
    update public.listing_images
    set alt_text = ''
    where id = '00000000-0000-4000-8000-000000000011'
  $sql$,
  'listing_image_alt_required',
  'cleared alt text on a pending_review image'
);

update public.listing_images
set is_decorative = true, alt_text = ''
where id = '00000000-0000-4000-8000-000000000011';

select pg_temp.check(
  (select is_decorative and alt_text = ''
     from public.listing_images
    where id = '00000000-0000-4000-8000-000000000011'),
  'decorative image could not have empty alt on pending_review'
);

update public.listing_images
set is_decorative = false, alt_text = 'Кухня с остров'
where id = '00000000-0000-4000-8000-000000000011';

select pg_temp.login('00000000-0000-4000-8000-0000000000b2');

update public.listings
set status = 'published', published_at = now()
where id = '00000000-0000-4000-8000-0000000000f1';

select pg_temp.check(
  (select status from public.listings where id = '00000000-0000-4000-8000-0000000000f1') = 'published',
  'listing with alt text did not reach published'
);

select pg_temp.expect_error(
  $sql$
    update public.listing_images
    set alt_text = '  '
    where id = '00000000-0000-4000-8000-000000000011'
  $sql$,
  'listing_image_alt_required',
  'whitespace-only alt was allowed on a published image'
);

insert into public.listing_images (id, listing_id, storage_path, alt_text, position, is_cover, is_decorative)
values (
  '00000000-0000-4000-8000-000000000012',
  '00000000-0000-4000-8000-0000000000f1',
  '00000000-0000-4000-8000-0000000000b1/00000000-0000-4000-8000-0000000000f1/plan.jpg',
  '',
  1,
  false,
  true
);

select pg_temp.check(
  (select count(*) from public.listing_images where listing_id = '00000000-0000-4000-8000-0000000000f1') = 2,
  'decorative image could not be inserted on a published listing'
);

select pg_temp.expect_error(
  $sql$
    insert into public.listing_images (listing_id, storage_path, alt_text, position, is_cover, is_decorative)
    values (
      '00000000-0000-4000-8000-0000000000f1',
      '00000000-0000-4000-8000-0000000000b1/00000000-0000-4000-8000-0000000000f1/empty.jpg',
      '',
      2,
      false,
      false
    )
  $sql$,
  'listing_image_alt_required',
  'non-decorative empty alt was inserted on a published listing'
);

update public.listings
set status = 'archived'
where id = '00000000-0000-4000-8000-0000000000f1';

update public.listing_images
set is_decorative = false, alt_text = ''
where id = '00000000-0000-4000-8000-000000000011';

select pg_temp.check(
  (select alt_text = '' from public.listing_images where id = '00000000-0000-4000-8000-000000000011'),
  'archived listing could not clear alt text'
);


-- Org listing access must match listing_images RLS: org owner, agency_admin,
-- and a broker with listing_management may write; a broker without that
-- entitlement, and an outsider, may not. These writes run as the
-- authenticated role so an INVOKER trigger cannot hide a permission error.
insert into auth.users (id, email, aud, role, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
select u.id::uuid, u.email, 'authenticated', 'authenticated', '', now(), '{}'::jsonb, jsonb_build_object('display_name', u.email)
from (values
  ('00000000-0000-4000-8000-0000000000c1', 'org-owner-decorative@example.invalid'),
  ('00000000-0000-4000-8000-0000000000c2', 'org-admin-decorative@example.invalid'),
  ('00000000-0000-4000-8000-0000000000c3', 'org-broker-decorative@example.invalid'),
  ('00000000-0000-4000-8000-0000000000c4', 'org-noent-owner-decorative@example.invalid'),
  ('00000000-0000-4000-8000-0000000000c5', 'org-noent-broker-decorative@example.invalid')
) as u(id, email);

create temp table ids (k text primary key, v uuid) on commit drop;
grant select, insert, update on ids to authenticated;

set local role authenticated;
select pg_temp.login('00000000-0000-4000-8000-0000000000c1');
insert into ids values (
  'org1',
  public.create_broker_workspace('Агенция Декоративна', 'София', 'broker-trial-v1', true)
);
select pg_temp.login('00000000-0000-4000-8000-0000000000c4');
insert into ids values (
  'org_no_entitlement',
  public.create_broker_workspace('Агенция Без Обяви', 'Пловдив', 'broker-trial-v1', true)
);
reset role;

insert into public.organization_memberships (organization_id, user_id, role, status)
values
  ((select v from ids where k = 'org1'), '00000000-0000-4000-8000-0000000000c2', 'agency_admin', 'active'),
  ((select v from ids where k = 'org1'), '00000000-0000-4000-8000-0000000000c3', 'broker', 'active'),
  ((select v from ids where k = 'org_no_entitlement'), '00000000-0000-4000-8000-0000000000c5', 'broker', 'active');

insert into public.broker_plan_catalog (plan_code, display_name, tier, trial_days, entitlements, usage_limits)
values (
  'starter_no_listings',
  'Starter without listings',
  'starter',
  30,
  '{"broker_dashboard":true,"listing_management":false,"crm":true}'::jsonb,
  '{}'::jsonb
)
on conflict (plan_code) do update
  set entitlements = excluded.entitlements, active = true;

update public.broker_subscriptions
set plan_code = 'starter_no_listings'
where organization_id = (select v from ids where k = 'org_no_entitlement');

set local session_replication_role = replica;
insert into public.listings (
  id, owner_id, organization_id, title, slug, description, property_type, transaction_type,
  city, price_eur, area_sqm, status
) values
  (
    '00000000-0000-4000-8000-0000000000f2',
    '00000000-0000-4000-8000-0000000000c1',
    (select v from ids where k = 'org1'),
    'Чернова обява на агенцията',
    'draft-org-accessible-alt',
    'Описание на чернова обява в агенцията, достатъчно дълго за проверката.',
    'apartment', 'sale', 'София', 150000, 80, 'draft'
  ),
  (
    '00000000-0000-4000-8000-0000000000f3',
    '00000000-0000-4000-8000-0000000000c4',
    (select v from ids where k = 'org_no_entitlement'),
    'Чернова обява без право за обяви',
    'draft-org-no-listing-entitlement',
    'Описание на чернова обява в агенция без listing_management.',
    'house', 'sale', 'Пловдив', 160000, 90, 'draft'
  );
set local session_replication_role = origin;

select pg_temp.login('00000000-0000-4000-8000-0000000000c1');
select pg_temp.check(
  private.can_manage_listing('00000000-0000-4000-8000-0000000000f2')
  and not private.can_manage_listing('00000000-0000-4000-8000-0000000000f3'),
  'org owner can_manage_listing is wrong'
);
select pg_temp.login('00000000-0000-4000-8000-0000000000c2');
select pg_temp.check(
  private.can_manage_listing('00000000-0000-4000-8000-0000000000f2'),
  'agency_admin was denied can_manage_listing on the org listing'
);
select pg_temp.login('00000000-0000-4000-8000-0000000000c3');
select pg_temp.check(
  private.can_manage_listing('00000000-0000-4000-8000-0000000000f2'),
  'broker with listing_management was denied can_manage_listing'
);
select pg_temp.login('00000000-0000-4000-8000-0000000000c5');
select pg_temp.check(
  not private.can_manage_listing('00000000-0000-4000-8000-0000000000f3'),
  'broker without listing_management was allowed can_manage_listing'
);
select pg_temp.login('00000000-0000-4000-8000-0000000000b3');
select pg_temp.check(
  not private.can_manage_listing('00000000-0000-4000-8000-0000000000f2'),
  'outsider was allowed can_manage_listing on the org listing'
);

set local role authenticated;

select pg_temp.login('00000000-0000-4000-8000-0000000000c3');
insert into public.listing_images (id, listing_id, storage_path, alt_text, position, is_cover, is_decorative)
values (
  '00000000-0000-4000-8000-000000000021',
  '00000000-0000-4000-8000-0000000000f2',
  'org/broker/cover.jpg',
  '',
  0,
  true,
  false
);
update public.listing_images
set alt_text = 'Кухня от брокера'
where id = '00000000-0000-4000-8000-000000000021';
select pg_temp.check(
  (select alt_text from public.listing_images where id = '00000000-0000-4000-8000-000000000021') = 'Кухня от брокера',
  'broker with entitlement could not insert and update an org listing image'
);

select pg_temp.login('00000000-0000-4000-8000-0000000000c2');
insert into public.listing_images (id, listing_id, storage_path, alt_text, position, is_cover, is_decorative)
values (
  '00000000-0000-4000-8000-000000000022',
  '00000000-0000-4000-8000-0000000000f2',
  'org/admin/plan.jpg',
  'План от администратора',
  1,
  false,
  false
);
update public.listing_images
set alt_text = 'План, обновен от администратора'
where id = '00000000-0000-4000-8000-000000000022';
select pg_temp.check(
  (select alt_text from public.listing_images where id = '00000000-0000-4000-8000-000000000022') = 'План, обновен от администратора',
  'agency_admin could not insert and update an org listing image'
);

select pg_temp.login('00000000-0000-4000-8000-0000000000c1');
insert into public.listing_images (id, listing_id, storage_path, alt_text, position, is_cover, is_decorative)
values (
  '00000000-0000-4000-8000-000000000023',
  '00000000-0000-4000-8000-0000000000f2',
  'org/owner/yard.jpg',
  'Двор от собственика',
  2,
  false,
  false
);
update public.listing_images
set alt_text = 'Двор, обновен от собственика'
where id = '00000000-0000-4000-8000-000000000023';
select pg_temp.check(
  (select alt_text from public.listing_images where id = '00000000-0000-4000-8000-000000000023') = 'Двор, обновен от собственика',
  'org owner could not insert and update an org listing image'
);

select pg_temp.login('00000000-0000-4000-8000-0000000000c5');
select pg_temp.expect_error(
  $sql$
    insert into public.listing_images (listing_id, storage_path, alt_text, position, is_cover, is_decorative)
    values (
      '00000000-0000-4000-8000-0000000000f3',
      'org/noent/cover.jpg',
      'Текст без право',
      0,
      true,
      false
    )
  $sql$,
  'listing_image_access_denied',
  'broker without listing_management inserted an org listing image'
);
update public.listing_images
set alt_text = 'Текст без право'
where listing_id = '00000000-0000-4000-8000-0000000000f3';

select pg_temp.login('00000000-0000-4000-8000-0000000000b3');
select pg_temp.expect_error(
  $sql$
    insert into public.listing_images (listing_id, storage_path, alt_text, position, is_cover, is_decorative)
    values (
      '00000000-0000-4000-8000-0000000000f2',
      'org/outsider/cover.jpg',
      'Чужд текст',
      3,
      false,
      false
    )
  $sql$,
  'listing_image_access_denied',
  'outsider inserted an image on the org listing'
);
update public.listing_images
set alt_text = 'Чужд текст'
where id = '00000000-0000-4000-8000-000000000021';
reset role;

select pg_temp.check(
  not exists (
    select 1 from public.listing_images
    where listing_id = '00000000-0000-4000-8000-0000000000f3'
  ),
  'broker without entitlement left a listing image row'
);
select pg_temp.check(
  (select alt_text from public.listing_images where id = '00000000-0000-4000-8000-000000000021') = 'Кухня от брокера',
  'denied roles changed an org listing image'
);

rollback;
