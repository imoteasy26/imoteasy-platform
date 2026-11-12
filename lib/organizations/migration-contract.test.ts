import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ORGANIZATION_INVITABLE_ROLES,
  ORGANIZATION_MEMBER_MANAGER_ROLES,
  ORGANIZATION_ROLES,
  ORGANIZATION_ROSTER_READER_ROLES,
  ORGANIZATION_SALES_ROLES,
  isOrganizationRole,
} from './contract'

const root = process.cwd()
const read = (relativePath: string) => readFileSync(join(root, relativePath), 'utf8')
const stripSqlComments = (sql: string) =>
  sql
    .split('\n')
    .map((line) => line.replace(/--[\s\S]*$/, ''))
    .join('\n')

const foundation = stripSqlComments(read('supabase/migrations/20261112000000_broker_os_foundation.sql'))
const hardening = stripSqlComments(read('supabase/migrations/20261112130000_organization_rls_hardening.sql'))
const invitationFix = stripSqlComments(
  read('supabase/migrations/20261112140000_fix_invitation_inviter_role_null.sql'),
)
const rollback = read('supabase/rollback/20261112130000_organization_rls_hardening.rollback.sql')
const invitationFixRollback = read(
  'supabase/rollback/20261112140000_fix_invitation_inviter_role_null.rollback.sql',
)
const followups = stripSqlComments(read('supabase/migrations/20261112150000_org_rls_followups.sql'))
const followupsRollback = read('supabase/rollback/20261112150000_org_rls_followups.rollback.sql')
const isolationTest = read('supabase/tests/rls/organizations_isolation.sql')
const concurrentLeave = read('supabase/tests/rls/organizations_concurrent_leave.sh')
const concurrentMutualRemove = read('supabase/tests/rls/organizations_concurrent_mutual_remove.sh')
const databaseTypes = read('lib/supabase/database.types.ts')

const roleListSql = ORGANIZATION_ROLES.map((role) => `'${role}'`).join(', ')

describe('organizations migration contract', () => {
  it('keeps the TypeScript roles identical to the P1 CHECK constraint', () => {
    const check = foundation.match(/role in \(([^)]*)\)/)
    expect(check).not.toBeNull()
    const sqlRoles = check![1].split(',').map((role) => role.trim().replace(/'/g, ''))
    expect(sqlRoles).toEqual([...ORGANIZATION_ROLES])
    expect(databaseTypes).toContain(`type OrganizationRole = '${ORGANIZATION_ROLES.join("' | '")}'`)
    expect(isOrganizationRole('read_only')).toBe(true)
    expect(isOrganizationRole('admin')).toBe(false)
    expect(isOrganizationRole('worker')).toBe(false)
  })

  it('does not recreate organizations or rename roles in the hardening migration', () => {
    expect(hardening).not.toMatch(/create table public\.organizations\b/i)
    expect(hardening).not.toMatch(/create table public\.organization_memberships\b/i)
    expect(foundation + '\n' + hardening).toContain(roleListSql)
    expect(foundation).toContain(`invited_role in (${ORGANIZATION_INVITABLE_ROLES.map((role) => `'${role}'`).join(', ')})`)
    expect(hardening).not.toMatch(/role in \(/)
  })

  it('enforces the last-active-owner invariant in the database', () => {
    expect(hardening).toContain('private.guard_last_org_owner')
    expect(hardening).toContain('organization_memberships_guard_last_owner')
    expect(hardening).toContain("raise exception 'last_owner_required'")
    expect(hardening).toMatch(/from public\.organizations[\s\S]*for update/i)
    expect(isolationTest).toContain('last owner left the organization')
    expect(concurrentLeave).toContain('leave_organization')
    expect(concurrentLeave).toContain('last_owner_required')
  })

  it('exposes leave and remove RPCs and records organization events', () => {
    expect(hardening).toContain('public.leave_organization(p_organization_id uuid)')
    expect(hardening).toContain('public.remove_organization_member(p_organization_id uuid, p_user_id uuid)')
    expect(hardening).toContain("'member_left'")
    expect(hardening).toContain("'member_removed'")
    expect(hardening).toContain("'owner_required_to_remove_owner'")
    expect(databaseTypes).toContain('leave_organization')
    expect(databaseTypes).toContain('remove_organization_member')
  })

  it('keeps roster managers, sales roles, and roster readers aligned with SQL', () => {
    expect([...ORGANIZATION_MEMBER_MANAGER_ROLES]).toEqual(['owner', 'agency_admin'])
    expect(foundation).toContain(
      `array[${ORGANIZATION_SALES_ROLES.map((role) => `'${role}'`).join(', ')}]`,
    )
    expect(hardening).toContain(
      `array[${ORGANIZATION_ROSTER_READER_ROLES.map((role) => `'${role}'`).join(', ')}]`,
    )
  })

  it('does not grant anon and does not use using(true)', () => {
    expect(hardening).not.toMatch(/grant[^;]*\bto\s+anon\b/i)
    expect(hardening).not.toMatch(/using\s*\(\s*true\s*\)/i)
    expect(invitationFix).not.toMatch(/grant[^;]*\bto\s+anon\b/i)
  })

  it('rejects a missing membership role instead of treating NULL NOT IN as false', () => {
    expect(hardening).toContain(
      "if actor_role is null or actor_role not in ('owner', 'agency_admin')",
    )
    expect(invitationFix).toContain(
      "if inviter_role is null or inviter_role not in ('owner', 'agency_admin')",
    )
    expect(invitationFix).toContain("if p_role is null or p_role not in")
    expect(foundation).toContain("if inviter_role not in ('owner', 'agency_admin')")
    expect(invitationFix).not.toMatch(/^\s*if inviter_role not in /m)
    expect(hardening).not.toMatch(/^\s*if actor_role not in /m)
  })

  it('adds the alt_text length check as NOT VALID', () => {
    expect(hardening).toMatch(/check \(char_length\(alt_text\) <= 200\) not valid/i)
  })
})

describe('rollback and behavioral tests', () => {
  it('rolls back only the hardening additions and keeps P1 tables', () => {
    expect(rollback).toContain('drop function if exists public.leave_organization')
    expect(rollback).toContain('drop function if exists public.remove_organization_member')
    expect(rollback).toContain('drop function if exists private.guard_last_org_owner')
    expect(rollback).toContain('listing_images_alt_text_length')
    expect(rollback).not.toMatch(/drop table if exists public\.organizations/i)
    expect(rollback).not.toMatch(/drop table if exists public\.organization_memberships/i)
    expect(invitationFixRollback).not.toMatch(/create or replace function/i)
    expect(invitationFixRollback).not.toMatch(/^\s*if inviter_role not in /m)
    expect(invitationFixRollback.toLowerCase()).toContain('no-op')
    expect(invitationFixRollback).toMatch(/NULL-safe/i)
  })

  it('ships a SQL isolation test that rolls back its fixtures', () => {
    expect(isolationTest.trimEnd().endsWith('rollback;')).toBe(true)
    expect(isolationTest).toContain('invitation granted the owner role')
    expect(isolationTest).toContain('org1 owner sees org2')
    expect(isolationTest).toContain('read_only converted an inquiry')
    expect(isolationTest).toContain('read_only mutated a lead')
    expect(isolationTest).toContain('outsider removed a member')
    expect(isolationTest).toContain('member of another org removed a member')
    expect(isolationTest).toContain('broker removed a member')
    expect(isolationTest).toContain('read_only removed a member')
    expect(isolationTest).toContain('owner could not remove another owner')
    expect(isolationTest).toContain('outsider demoted an owner via UPDATE')
    expect(isolationTest).toContain('last owner was demoted via UPDATE')
    expect(isolationTest).toContain('outsider created an agency_admin invitation for a foreign org')
    expect(isolationTest).toContain('outsider accepted a missing agency_admin invitation')
    expect(isolationTest).toContain('assistant took an unassigned lead')
    expect(isolationTest).toContain('broker took an unassigned lead')
    expect(isolationTest).toContain('owner could not assign an unassigned lead')
    expect(isolationTest).toContain('assistant could not update an assigned lead')
    expect(isolationTest).toContain('null lead status was accepted')
    expect(isolationTest).toContain('null lead priority was accepted')
  })
})

describe('org RLS follow-up migration', () => {
  it('fixes unassigned-lead assignment with is distinct from and does not edit P1', () => {
    expect(followups).toContain('lead_row.assigned_to is distinct from actor_id')
    expect(followups).not.toContain('lead_row.assigned_to <> actor_id')
    expect(foundation).toContain('lead_row.assigned_to <> actor_id')
    expect(followupsRollback.toLowerCase()).toContain('no-op')
    expect(followupsRollback).toContain('assigned_to <> actor_id')
    expect(followupsRollback).not.toContain('create or replace function public.set_crm_lead_state')
  })

  it('locks the acting member with FOR SHARE and drops the dead profile-exists branch', () => {
    expect(followups).toMatch(/user_id = actor_id\s+and status = 'active'\s+for share/i)
    expect(followups).not.toMatch(/exists \(select 1 from public\.profiles as profile where profile\.id = old\.user_id\)/)
    expect(hardening).toContain('exists (select 1 from public.profiles as profile where profile.id = old.user_id)')
    expect(followups).toContain("if inviter_role is null or inviter_role not in ('owner', 'agency_admin')")
  })

  it('locks the organization before memberships and rejects null lead status or priority', () => {
    expect(followups).toContain('public.leave_organization(p_organization_id uuid)')
    expect(followups).toMatch(/perform 1\s+from public\.organizations\s+where id = p_organization_id\s+for update/)
    expect(followups).toContain('if p_status is null or p_status not in')
    expect(followups).toContain('if p_priority is null or p_priority not in')
    expect(concurrentMutualRemove).toContain('remove_organization_member')
    expect(concurrentMutualRemove).toContain('40P01')
  })
})
