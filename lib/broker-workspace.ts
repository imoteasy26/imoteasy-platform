import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Tables } from '@/lib/supabase/database.types'

export type BrokerContext = {
  membership: Tables<'organization_memberships'>
  organization: Tables<'organizations'>
  subscription: Tables<'broker_subscriptions'> | null
  plan: Tables<'broker_plan_catalog'> | null
}

export type BrokerAccessResult =
  | { kind: 'ready'; context: BrokerContext }
  | { kind: 'no_membership' }
  | { kind: 'migration_required' }
  | { kind: 'error' }

const missingSchemaCodes = new Set(['42P01', '42703', 'PGRST202', 'PGRST204', 'PGRST205'])

export function isBrokerSchemaMissing(error: { code?: string } | null | undefined) {
  return Boolean(error?.code && missingSchemaCodes.has(error.code))
}

export async function getBrokerAccess(
  supabase: SupabaseClient<Database>,
  userId: string,
  organizationId?: string,
): Promise<BrokerAccessResult> {
  let membershipQuery = supabase
    .from('organization_memberships')
    .select('organization_id, user_id, role, status, invited_by, invited_at, joined_at, created_at, updated_at')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('joined_at', { ascending: false })

  if (organizationId) membershipQuery = membershipQuery.eq('organization_id', organizationId)

  const { data: memberships, error: membershipError } = await membershipQuery.limit(1)
  if (membershipError) return isBrokerSchemaMissing(membershipError) ? { kind: 'migration_required' } : { kind: 'error' }

  const membership = memberships?.[0]
  if (!membership) return { kind: 'no_membership' }

  const [{ data: organization, error: organizationError }, { data: subscription, error: subscriptionError }] = await Promise.all([
    supabase
      .from('organizations')
      .select('id, name, slug, organization_type, status, created_by, created_at, updated_at')
      .eq('id', membership.organization_id)
      .maybeSingle(),
    supabase
      .from('broker_subscriptions')
      .select('id, broker_user_id, organization_id, plan_code, status, activated_at, trial_started_at, trial_ends_at, created_at, updated_at')
      .eq('organization_id', membership.organization_id)
      .eq('broker_user_id', userId)
      .maybeSingle(),
  ])

  if (organizationError || subscriptionError) {
    const missingSchema = isBrokerSchemaMissing(organizationError) || isBrokerSchemaMissing(subscriptionError)
    return missingSchema ? { kind: 'migration_required' } : { kind: 'error' }
  }
  if (!organization) return { kind: 'error' }

  let plan: Tables<'broker_plan_catalog'> | null = null
  if (subscription) {
    const { data, error } = await supabase
      .from('broker_plan_catalog')
      .select('plan_code, display_name, tier, trial_days, entitlements, usage_limits, active, created_at, updated_at')
      .eq('plan_code', subscription.plan_code)
      .maybeSingle()
    if (error) return isBrokerSchemaMissing(error) ? { kind: 'migration_required' } : { kind: 'error' }
    plan = data
  }

  return { kind: 'ready', context: { membership, organization, subscription, plan } }
}
