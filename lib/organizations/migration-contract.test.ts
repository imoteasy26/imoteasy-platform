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
const rollback = read('supabase/rollback/20261112130000_organization_rls_hardening.rollback.sql')
const isolationTest = read('supabase/tests/rls/organizations_isolation.sql')
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
    expect(isolationTest).toContain('last owner left the organization')
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
  })

  it('ships a SQL isolation test that rolls back its fixtures', () => {
    expect(isolationTest.trimEnd().endsWith('rollback;')).toBe(true)
    expect(isolationTest).toContain('invitation granted the owner role')
    expect(isolationTest).toContain('org1 owner sees org2')
    expect(isolationTest).toContain('read_only converted an inquiry')
    expect(isolationTest).toContain('read_only mutated a lead')
  })
})
