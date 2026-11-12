/**
 * Membership roles, mirrored from the CHECK constraint in
 * supabase/migrations/20261112000000_broker_os_foundation.sql.
 * The migration contract test keeps this list identical to the SQL.
 */
export const ORGANIZATION_ROLES = [
  'owner',
  'agency_admin',
  'broker',
  'assistant',
  'marketing_manager',
  'read_only',
] as const

export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number]

/** Roles that may invite or remove members. agency_admin cannot touch owners. */
export const ORGANIZATION_MEMBER_MANAGER_ROLES = ['owner', 'agency_admin'] as const satisfies readonly OrganizationRole[]

/** Roles that may be assigned through an invitation. Owner is never invited. */
export const ORGANIZATION_INVITABLE_ROLES = [
  'agency_admin',
  'broker',
  'assistant',
  'marketing_manager',
  'read_only',
] as const satisfies readonly OrganizationRole[]

/** Roles that may convert inquiries and mutate CRM leads. */
export const ORGANIZATION_SALES_ROLES = ['owner', 'agency_admin', 'broker', 'assistant'] as const satisfies readonly OrganizationRole[]

/** Roles that may see the full organization roster (read_only sees only their own row). */
export const ORGANIZATION_ROSTER_READER_ROLES = [
  'owner',
  'agency_admin',
  'broker',
  'assistant',
  'marketing_manager',
] as const satisfies readonly OrganizationRole[]

export const isOrganizationRole = (value: unknown): value is OrganizationRole =>
  typeof value === 'string' && (ORGANIZATION_ROLES as readonly string[]).includes(value)
