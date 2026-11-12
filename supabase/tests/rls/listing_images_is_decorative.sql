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

update public.listing_images
set alt_text = 'Дневна с тераса'
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

rollback;
