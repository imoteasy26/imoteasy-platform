-- ROLLBACK for 20261112130000_organization_rls_hardening.sql.
-- Manual, reviewed use only (never part of the migration chain). Run with
-- `psql -v ON_ERROR_STOP=1 --single-transaction -f <this file>`.
--
-- Does not drop public.organizations, public.organization_memberships, or any
-- other P1 table. Restores the P1 memberships SELECT policy.

drop trigger if exists organization_memberships_guard_last_owner on public.organization_memberships;
drop function if exists public.remove_organization_member(uuid, uuid);
drop function if exists public.leave_organization(uuid);
drop function if exists private.guard_last_org_owner();

alter table public.listing_images drop constraint if exists listing_images_alt_text_length;

drop policy if exists organization_memberships_read_member on public.organization_memberships;
create policy organization_memberships_read_member on public.organization_memberships
  for select to authenticated
  using (private.has_organization_role(organization_id, null));
