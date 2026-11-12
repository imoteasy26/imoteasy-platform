import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { BrokerErrorNotice, BrokerMigrationNotice, BrokerStateNotice } from '@/features/broker/broker-state'
import { OrganizationInviteForm } from '@/features/broker/organization-invite-form'
import { leaveOrganization, removeOrganizationMember } from '@/app/broker/actions'
import { getBrokerAccess, isBrokerSchemaMissing } from '@/lib/broker-workspace'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Екип' }

const roleLabels: Record<string, string> = { owner: 'Собственик', agency_admin: 'Администратор', broker: 'Брокер', assistant: 'Асистент', marketing_manager: 'Маркетинг мениджър', read_only: 'Само преглед' }

export default async function BrokerTeamPage({ searchParams }: { searchParams: Promise<{ organizationId?: string; state?: string }> }) {
  const query = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/sign-in?next=%2Fbroker%2Fteam')
  const access = await getBrokerAccess(supabase, user.id, query.organizationId)
  if (access.kind === 'migration_required') return <main className="site-container py-10" id="main-content"><BrokerMigrationNotice /></main>
  if (access.kind === 'error') return <main className="site-container py-10" id="main-content"><BrokerErrorNotice /></main>
  if (access.kind === 'no_membership') redirect('/broker/onboarding')
  const { organization, membership } = access.context
  const [{ data: members, error: membersError }, { data: invitations, error: invitationsError }] = await Promise.all([
    supabase.from('organization_memberships').select('organization_id, user_id, role, status, invited_by, invited_at, joined_at, created_at, updated_at').eq('organization_id', organization.id).eq('status', 'active').order('joined_at', { ascending: true }),
    ['owner', 'agency_admin'].includes(membership.role)
      ? supabase.from('organization_invitations').select('id, organization_id, invitee_email, invited_role, token_hash, invited_by, status, expires_at, accepted_by, accepted_at, created_at').eq('organization_id', organization.id).eq('status', 'pending').order('created_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ])
  const error = membersError || invitationsError
  if (isBrokerSchemaMissing(error)) return <main className="site-container py-10" id="main-content"><BrokerMigrationNotice /></main>
  if (error) return <main className="site-container py-10" id="main-content"><BrokerErrorNotice /></main>
  const userIds = (members ?? []).map((member) => member.user_id)
  const { data: profiles, error: profilesError } = userIds.length
    ? await supabase.from('profiles').select('id, display_name').in('id', userIds)
    : { data: [], error: null }
  if (isBrokerSchemaMissing(profilesError)) return <main className="site-container py-10" id="main-content"><BrokerMigrationNotice /></main>
  const nameById = new Map((profiles ?? []).map((profile) => [profile.id, profile.display_name]))
  const canInvite = ['owner', 'agency_admin'].includes(membership.role)
  const canManageMembers = canInvite

  return (
    <main className="site-container min-h-[72vh] py-8 sm:py-12" id="main-content">
      <div><p className="eyebrow">{organization.name} · Екип</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-ink">Хора и достъп</h1><p className="mt-2 text-sm text-muted-foreground">Ролите са зададени от организацията и не могат да бъдат променяни от самия поканен.</p></div>
      <div className="mt-5"><BrokerStateNotice state={query.state} /></div>
      <section aria-labelledby="members-heading" className="mt-8"><h2 className="text-xl font-semibold text-ink" id="members-heading">Активни членове</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">{(members ?? []).map((member) => {
            const isSelf = member.user_id === membership.user_id
            const canRemove = canManageMembers && !isSelf && !(membership.role === 'agency_admin' && member.role === 'owner')
            return (
              <article className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-white p-4" key={member.user_id}>
                <div>
                  <h3 className="font-semibold text-ink">{nameById.get(member.user_id) || 'Член на екипа'}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Присъединил се {new Intl.DateTimeFormat('bg-BG', { dateStyle: 'medium' }).format(new Date(member.joined_at))}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={member.role === 'owner' || member.role === 'agency_admin' ? 'default' : 'secondary'}>{roleLabels[member.role]}</Badge>
                  {canRemove ? (
                    <form action={removeOrganizationMember}>
                      <input name="organization_id" type="hidden" value={organization.id} />
                      <input name="user_id" type="hidden" value={member.user_id} />
                      <Button size="sm" type="submit" variant="outline">Премахни</Button>
                    </form>
                  ) : null}
                </div>
              </article>
            )
          })}</div>{members?.length ? null : <p className="mt-4 rounded-xl border border-dashed border-line p-5 text-sm text-muted-foreground">Все още няма активни членове.</p>}</section>
      {canInvite ? <section aria-labelledby="invite-heading" className="mt-10"><h2 className="text-xl font-semibold text-ink" id="invite-heading">Покани член</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Системата създава защитен, еднократен линк с валидност 7 дни. Сподели го директно с човека; имейл не се изпраща автоматично.</p><div className="mt-4 max-w-2xl"><OrganizationInviteForm organizationId={organization.id} /></div></section> : null}
      {canInvite && invitations?.length ? <section aria-labelledby="pending-invites-heading" className="mt-10"><h2 className="text-xl font-semibold text-ink" id="pending-invites-heading">Чакащи покани</h2><div className="mt-4 flex flex-col gap-2">{invitations.map((invitation) => <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white p-4" key={invitation.id}><span className="text-sm font-medium text-ink">{invitation.invitee_email}</span><div className="flex items-center gap-2"><Badge variant="secondary">{roleLabels[invitation.invited_role]}</Badge><span className="text-xs text-muted-foreground">Изтича {new Intl.DateTimeFormat('bg-BG', { dateStyle: 'medium' }).format(new Date(invitation.expires_at))}</span></div></div>)}</div></section> : null}
      <section aria-labelledby="leave-heading" className="mt-10">
        <h2 className="text-xl font-semibold text-ink" id="leave-heading">Напускане</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Можеш да напуснеш екипа по всяко време. Последният собственик трябва първо да предаде ролята на друг член.</p>
        <form action={leaveOrganization} className="mt-4">
          <input name="organization_id" type="hidden" value={organization.id} />
          <Button type="submit" variant="outline">Напусни екипа</Button>
        </form>
      </section>
    </main>
  )
}
