'use server'

import { createHash, randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getBrokerAccess, isBrokerSchemaMissing } from '@/lib/broker-workspace'
import { localDateTimeToUtc } from '@/lib/broker-validation'

const brokerTermsVersion = 'broker-trial-v1'
const salesRoles = new Set(['owner', 'agency_admin', 'broker', 'assistant'])

function hasSalesAccess(role: string) {
  return salesRoles.has(role)
}

function organizationPath(path: string, organizationId: string, state?: string) {
  const query = new URLSearchParams({ organizationId })
  if (state) query.set('state', state)
  return `${path}?${query.toString()}`
}

function redirectForBrokerError(path: string, error: { code?: string; message?: string } | null, organizationId?: string) {
  const state = isBrokerSchemaMissing(error) ? 'migration' : 'error'
  redirect(organizationId ? organizationPath(path, organizationId, state) : `${path}?state=${state}`)
}

async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/sign-in?next=%2Fbroker')
  return { supabase, user }
}

export async function completeBrokerOnboarding(formData: FormData) {
  const parsed = z.object({
    organization_id: z.string().optional(),
    organization_name: z.string().trim().min(2).max(120),
    service_area: z.string().trim().max(200).optional(),
    accepted_trial: z.string().optional(),
  }).safeParse(Object.fromEntries(formData))
  if (!parsed.success || parsed.data.accepted_trial !== 'on') redirect('/broker/onboarding?state=invalid')
  const { supabase, user } = await requireUser()
  const organizationId = parsed.data.organization_id?.trim()
  let result: { data: unknown; error: { code?: string; message?: string } | null }

  if (organizationId) {
    if (!z.string().uuid().safeParse(organizationId).success) redirect('/broker/onboarding?state=invalid')
    const access = await getBrokerAccess(supabase, user.id, organizationId)
  if (access.kind === 'migration_required') redirect(organizationId ? organizationPath('/broker/onboarding', organizationId, 'migration') : '/broker/onboarding?state=migration')
  if (access.kind !== 'ready') redirect(organizationId ? organizationPath('/broker/onboarding', organizationId, 'organization') : '/broker/onboarding?state=organization')
    result = await supabase.rpc('activate_broker_trial', {
      p_organization_id: organizationId,
      p_service_area: parsed.data.service_area || null,
      p_terms_version: brokerTermsVersion,
      p_terms_accepted: true,
    })
  } else {
    result = await supabase.rpc('create_broker_workspace', {
      p_name: parsed.data.organization_name,
      p_service_area: parsed.data.service_area || null,
      p_terms_version: brokerTermsVersion,
      p_terms_accepted: true,
    })
  }

  if (result.error) redirectForBrokerError('/broker/onboarding', result.error, organizationId)
  revalidatePath('/broker')
  const workspaceId = organizationId ?? (typeof result.data === 'string' ? result.data : undefined)
  redirect(workspaceId ? `/broker?organizationId=${encodeURIComponent(workspaceId)}&onboarding=complete` : '/broker?onboarding=complete')
}

export type InvitationActionState = { invitePath?: string; error?: string }

export async function createOrganizationInvite(_state: InvitationActionState, formData: FormData): Promise<InvitationActionState> {
  const parsed = z.object({
    organization_id: z.string().uuid(),
    email: z.string().trim().email().max(254),
    role: z.enum(['agency_admin', 'broker', 'assistant', 'marketing_manager', 'read_only']),
  }).safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: 'Провери имейла и избраната роля.' }

  const { supabase, user } = await requireUser()
  const access = await getBrokerAccess(supabase, user.id, parsed.data.organization_id)
  if (access.kind === 'migration_required') return { error: 'Миграцията за брокерската среда още не е приложена.' }
  if (access.kind !== 'ready' || !['owner', 'agency_admin'].includes(access.context.membership.role)) {
    return { error: 'Нямаш права да каниш членове в този екип.' }
  }

  const token = randomBytes(32).toString('hex')
  const tokenHash = createHash('sha256').update(token).digest('hex')
  const { error } = await supabase.rpc('create_organization_invitation', {
    p_organization_id: parsed.data.organization_id,
    p_email: parsed.data.email,
    p_role: parsed.data.role,
    p_token_hash: tokenHash,
  })
  if (error) return { error: isBrokerSchemaMissing(error) ? 'Миграцията за брокерската среда още не е приложена.' : 'Поканата не беше създадена. Провери правата и опитай отново.' }

  revalidatePath('/broker/team')
  return { invitePath: `/broker/accept-invite?token=${token}` }
}

export async function acceptOrganizationInvite(formData: FormData) {
  const parsed = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).safeParse(Object.fromEntries(formData))
  if (!parsed.success) redirect('/broker/accept-invite?state=invalid')
  const { supabase, user } = await requireUser()
  const tokenHash = createHash('sha256').update(parsed.data.token).digest('hex')
  const { data: organizationId, error } = await supabase.rpc('accept_organization_invitation', { p_token_hash: tokenHash })
  if (error || !organizationId) redirect(`/broker/accept-invite?state=${isBrokerSchemaMissing(error) ? 'migration' : 'invalid'}`)

  const access = await getBrokerAccess(supabase, user.id, organizationId)
  if (access.kind === 'ready' && access.context.membership.role === 'broker' && !access.context.subscription) {
    redirect(`/broker/onboarding?organizationId=${encodeURIComponent(organizationId)}&state=joined`)
  }
  redirect(`/broker?organizationId=${encodeURIComponent(organizationId)}&joined=1`)
}

export async function convertInquiryToCrmLead(formData: FormData) {
  const parsed = z.object({ organization_id: z.string().uuid(), inquiry_id: z.string().uuid() }).safeParse(Object.fromEntries(formData))
  if (!parsed.success) redirect('/broker/leads?state=invalid')
  const { supabase, user } = await requireUser()
  const access = await getBrokerAccess(supabase, user.id, parsed.data.organization_id)
  if (access.kind === 'migration_required') redirect(organizationPath('/broker/leads', parsed.data.organization_id, 'migration'))
  if (access.kind !== 'ready' || !hasSalesAccess(access.context.membership.role)) redirect(organizationPath('/broker/leads', parsed.data.organization_id, 'forbidden'))

  const { error } = await supabase.rpc('convert_inquiry_to_crm_lead', {
    p_organization_id: parsed.data.organization_id,
    p_inquiry_id: parsed.data.inquiry_id,
    p_assigned_to: user.id,
  })
  if (error) redirectForBrokerError('/broker/leads', error, parsed.data.organization_id)
  revalidatePath('/broker')
  revalidatePath('/broker/leads')
  redirect(organizationPath('/broker/leads', parsed.data.organization_id, 'converted'))
}

export async function updateCrmLead(formData: FormData) {
  const parsed = z.object({
    organization_id: z.string().uuid(),
    lead_id: z.string().uuid(),
    status: z.enum(['new', 'contacted', 'qualified', 'viewing_scheduled', 'viewing_completed', 'offer_received', 'negotiation', 'under_contract', 'won', 'lost']),
    priority: z.enum(['low', 'normal', 'high', 'urgent']),
    assigned_to: z.string().uuid().optional(),
    next_follow_up_at: z.string().optional(),
  }).safeParse(Object.fromEntries(formData))
  if (!parsed.success) redirect('/broker/leads?state=invalid')
  const { supabase, user } = await requireUser()
  const access = await getBrokerAccess(supabase, user.id, parsed.data.organization_id)
  if (access.kind === 'migration_required') redirect(organizationPath('/broker/leads', parsed.data.organization_id, 'migration'))
  if (access.kind !== 'ready' || !hasSalesAccess(access.context.membership.role)) redirect(organizationPath('/broker/leads', parsed.data.organization_id, 'forbidden'))

  const followUp = parsed.data.next_follow_up_at ? localDateTimeToUtc(parsed.data.next_follow_up_at) : null
  if (parsed.data.next_follow_up_at && !followUp) redirect('/broker/leads?state=invalid')
  const { error } = await supabase.rpc('set_crm_lead_state', {
    p_lead_id: parsed.data.lead_id,
    p_status: parsed.data.status,
    p_priority: parsed.data.priority,
    p_assigned_to: parsed.data.assigned_to || user.id,
    p_next_follow_up_at: followUp,
  })
  if (error) redirectForBrokerError('/broker/leads', error, parsed.data.organization_id)
  revalidatePath('/broker')
  revalidatePath('/broker/leads')
  redirect(organizationPath('/broker/leads', parsed.data.organization_id, 'updated'))
}

export async function createBrokerTask(formData: FormData) {
  const parsed = z.object({
    organization_id: z.string().uuid(),
    title: z.string().trim().min(2).max(160),
    description: z.string().trim().max(2000).optional(),
    lead_id: z.string().optional(),
    due_at: z.string().optional(),
  }).safeParse(Object.fromEntries(formData))
  if (!parsed.success) redirect('/broker/tasks?state=invalid')
  const { supabase, user } = await requireUser()
  const access = await getBrokerAccess(supabase, user.id, parsed.data.organization_id)
  if (access.kind === 'migration_required') redirect(organizationPath('/broker/tasks', parsed.data.organization_id, 'migration'))
  if (access.kind !== 'ready' || !hasSalesAccess(access.context.membership.role)) redirect(organizationPath('/broker/tasks', parsed.data.organization_id, 'forbidden'))

  const dueAt = parsed.data.due_at ? localDateTimeToUtc(parsed.data.due_at) : null
  if (parsed.data.due_at && !dueAt) redirect('/broker/tasks?state=invalid')
  const { error } = await supabase.from('crm_tasks').insert({
    organization_id: parsed.data.organization_id,
    title: parsed.data.title,
    description: parsed.data.description || null,
    lead_id: parsed.data.lead_id ? parsed.data.lead_id : null,
    due_at: dueAt,
    created_by: user.id,
    assigned_to: user.id,
  })
  if (error) redirectForBrokerError('/broker/tasks', error, parsed.data.organization_id)
  revalidatePath('/broker')
  revalidatePath('/broker/tasks')
  redirect(organizationPath('/broker/tasks', parsed.data.organization_id, 'created'))
}

export async function updateBrokerTask(formData: FormData) {
  const parsed = z.object({
    organization_id: z.string().uuid(),
    task_id: z.string().uuid(),
    status: z.enum(['open', 'in_progress', 'completed', 'cancelled']),
  }).safeParse(Object.fromEntries(formData))
  if (!parsed.success) redirect('/broker/tasks?state=invalid')
  const { supabase, user } = await requireUser()
  const access = await getBrokerAccess(supabase, user.id, parsed.data.organization_id)
  if (access.kind === 'migration_required') redirect(organizationPath('/broker/tasks', parsed.data.organization_id, 'migration'))
  if (access.kind !== 'ready' || !hasSalesAccess(access.context.membership.role)) redirect(organizationPath('/broker/tasks', parsed.data.organization_id, 'forbidden'))
  const { error } = await supabase.from('crm_tasks').update({
    status: parsed.data.status,
    completed_at: parsed.data.status === 'completed' ? new Date().toISOString() : null,
  }).eq('id', parsed.data.task_id).eq('organization_id', parsed.data.organization_id)
  if (error) redirectForBrokerError('/broker/tasks', error, parsed.data.organization_id)
  revalidatePath('/broker/tasks')
  redirect(organizationPath('/broker/tasks', parsed.data.organization_id, 'updated'))
}

export async function createViewingAppointment(formData: FormData) {
  const parsed = z.object({
    organization_id: z.string().uuid(),
    listing_id: z.string().uuid(),
    lead_id: z.string().optional(),
    scheduled_at: z.string().min(16).max(16),
    duration_minutes: z.coerce.number().int().min(10).max(240),
  }).safeParse(Object.fromEntries(formData))
  if (!parsed.success) redirect('/broker/viewings?state=invalid')
  const scheduledAt = localDateTimeToUtc(parsed.data.scheduled_at)
  if (!scheduledAt) redirect('/broker/viewings?state=invalid')
  const { supabase, user } = await requireUser()
  const access = await getBrokerAccess(supabase, user.id, parsed.data.organization_id)
  if (access.kind === 'migration_required') redirect(organizationPath('/broker/viewings', parsed.data.organization_id, 'migration'))
  if (access.kind !== 'ready' || !hasSalesAccess(access.context.membership.role)) redirect(organizationPath('/broker/viewings', parsed.data.organization_id, 'forbidden'))

  const { error } = await supabase.from('viewing_appointments').insert({
    organization_id: parsed.data.organization_id,
    listing_id: parsed.data.listing_id,
    lead_id: parsed.data.lead_id || null,
    broker_user_id: user.id,
    scheduled_at: scheduledAt,
    duration_minutes: parsed.data.duration_minutes,
    created_by: user.id,
  })
  if (error) redirectForBrokerError('/broker/viewings', error, parsed.data.organization_id)
  revalidatePath('/broker')
  revalidatePath('/broker/viewings')
  redirect(organizationPath('/broker/viewings', parsed.data.organization_id, 'created'))
}

export async function updateViewingAppointment(formData: FormData) {
  const parsed = z.object({
    organization_id: z.string().uuid(),
    appointment_id: z.string().uuid(),
    status: z.enum(['confirmed', 'cancelled', 'rescheduled', 'completed', 'no_show']),
    outcome: z.enum(['interested', 'not_interested', 'follow_up', 'offer_expected', 'other', '']).optional(),
    scheduled_at: z.string().optional(),
    cancellation_reason: z.string().trim().max(500).optional(),
  }).safeParse(Object.fromEntries(formData))
  if (!parsed.success) redirect('/broker/viewings?state=invalid')
  const { supabase, user } = await requireUser()
  const access = await getBrokerAccess(supabase, user.id, parsed.data.organization_id)
  if (access.kind === 'migration_required') redirect(organizationPath('/broker/viewings', parsed.data.organization_id, 'migration'))
  if (access.kind !== 'ready' || !hasSalesAccess(access.context.membership.role)) redirect(organizationPath('/broker/viewings', parsed.data.organization_id, 'forbidden'))

  const scheduledAt = parsed.data.scheduled_at ? localDateTimeToUtc(parsed.data.scheduled_at) : undefined
  if (parsed.data.scheduled_at && !scheduledAt) redirect('/broker/viewings?state=invalid')
  const { error } = await supabase.from('viewing_appointments').update({
    status: parsed.data.status,
    outcome: parsed.data.outcome || null,
    scheduled_at: scheduledAt ?? undefined,
    cancellation_reason: parsed.data.status === 'cancelled' ? parsed.data.cancellation_reason || null : null,
  }).eq('id', parsed.data.appointment_id).eq('organization_id', parsed.data.organization_id)
  if (error) redirectForBrokerError('/broker/viewings', error, parsed.data.organization_id)
  revalidatePath('/broker')
  revalidatePath('/broker/viewings')
  redirect(organizationPath('/broker/viewings', parsed.data.organization_id, 'updated'))
}

export async function createBrokerTransaction(formData: FormData) {
  const parsed = z.object({
    organization_id: z.string().uuid(),
    listing_id: z.string().uuid(),
    lead_id: z.string().optional(),
  }).safeParse(Object.fromEntries(formData))
  if (!parsed.success) redirect('/broker/pipeline?state=invalid')
  const { supabase, user } = await requireUser()
  const access = await getBrokerAccess(supabase, user.id, parsed.data.organization_id)
  if (access.kind === 'migration_required') redirect(organizationPath('/broker/pipeline', parsed.data.organization_id, 'migration'))
  if (access.kind !== 'ready' || !['owner', 'agency_admin', 'broker'].includes(access.context.membership.role)) redirect(organizationPath('/broker/pipeline', parsed.data.organization_id, 'forbidden'))

  const { data: listing, error: listingError } = await supabase.from('listings')
    .select('id, organization_id, price_eur')
    .eq('id', parsed.data.listing_id)
    .eq('organization_id', parsed.data.organization_id)
    .maybeSingle()
  if (listingError || !listing) redirect('/broker/pipeline?state=listing')

  let contactId: string | null = null
  if (parsed.data.lead_id) {
    const { data: lead } = await supabase.from('crm_leads')
      .select('id, contact_id')
      .eq('id', parsed.data.lead_id)
      .eq('organization_id', parsed.data.organization_id)
      .maybeSingle()
    if (!lead) redirect('/broker/pipeline?state=lead')
    contactId = lead.contact_id
  }

  const { error } = await supabase.from('transactions').insert({
    organization_id: parsed.data.organization_id,
    listing_id: listing.id,
    lead_id: parsed.data.lead_id || null,
    buyer_contact_id: contactId,
    broker_user_id: user.id,
    asking_price_snapshot: listing.price_eur,
    created_by: user.id,
  })
  if (error) redirectForBrokerError('/broker/pipeline', error, parsed.data.organization_id)
  revalidatePath('/broker')
  revalidatePath('/broker/pipeline')
  redirect(organizationPath('/broker/pipeline', parsed.data.organization_id, 'created'))
}

export async function transitionBrokerTransaction(formData: FormData) {
  const parsed = z.object({
    organization_id: z.string().uuid(),
    transaction_id: z.string().uuid(),
    status: z.enum(['lead', 'qualified', 'viewing', 'offer', 'negotiation', 'due_diligence', 'contract_preparation', 'contract_signed', 'cancelled']),
  }).safeParse(Object.fromEntries(formData))
  if (!parsed.success) redirect('/broker/pipeline?state=invalid')
  const { supabase, user } = await requireUser()
  const access = await getBrokerAccess(supabase, user.id, parsed.data.organization_id)
  if (access.kind === 'migration_required') redirect(organizationPath('/broker/pipeline', parsed.data.organization_id, 'migration'))
  if (access.kind !== 'ready' || !['owner', 'agency_admin', 'broker'].includes(access.context.membership.role)) redirect(organizationPath('/broker/pipeline', parsed.data.organization_id, 'forbidden'))
  const { error } = await supabase.rpc('transition_broker_transaction', {
    p_transaction_id: parsed.data.transaction_id,
    p_status: parsed.data.status,
  })
  if (error) redirectForBrokerError('/broker/pipeline', error, parsed.data.organization_id)
  revalidatePath('/broker')
  revalidatePath('/broker/pipeline')
  redirect(organizationPath('/broker/pipeline', parsed.data.organization_id, 'updated'))
}
