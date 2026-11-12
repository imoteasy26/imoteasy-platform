import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BrokerErrorNotice, BrokerMigrationNotice, BrokerStateNotice } from '@/features/broker/broker-state'
import { convertInquiryToCrmLead, updateCrmLead } from '@/app/broker/actions'
import { getBrokerAccess, isBrokerSchemaMissing } from '@/lib/broker-workspace'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'CRM и лийдове' }

const leadStatuses = [
  ['new', 'Ново'], ['contacted', 'Свързан'], ['qualified', 'Квалифициран'], ['viewing_scheduled', 'Оглед насрочен'],
  ['viewing_completed', 'Оглед проведен'], ['offer_received', 'Получена оферта'], ['negotiation', 'Преговори'],
  ['under_contract', 'Предварителен договор'], ['won', 'Успешно'], ['lost', 'Загубено'],
] as const
const priorities = [['low', 'Нисък'], ['normal', 'Стандартен'], ['high', 'Висок'], ['urgent', 'Спешен']] as const

export default async function BrokerLeadsPage({ searchParams }: { searchParams: Promise<{ organizationId?: string; state?: string }> }) {
  const query = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/sign-in?next=%2Fbroker%2Fleads')
  const access = await getBrokerAccess(supabase, user.id, query.organizationId)
  if (access.kind === 'migration_required') return <main className="site-container min-h-[72vh] py-10" id="main-content"><BrokerMigrationNotice /></main>
  if (access.kind === 'error') return <main className="site-container py-10" id="main-content"><BrokerErrorNotice /></main>
  if (access.kind === 'no_membership') redirect('/broker/onboarding')
  const { organization, membership } = access.context
  const canManage = ['owner', 'agency_admin', 'broker', 'assistant'].includes(membership.role)

  const [{ data: leads, error: leadsError }, { data: memberships, error: membershipsError }, { data: listings, error: listingsError }] = await Promise.all([
    supabase.from('crm_leads').select('id, organization_id, contact_id, listing_id, source_inquiry_id, status, priority, source, assigned_to, next_follow_up_at, created_by, created_at, updated_at').eq('organization_id', organization.id).order('updated_at', { ascending: false }).limit(100),
    supabase.from('organization_memberships').select('organization_id, user_id, role, status, invited_by, invited_at, joined_at, created_at, updated_at').eq('organization_id', organization.id).eq('status', 'active'),
    supabase.from('listings').select('id, title, slug').eq('organization_id', organization.id).order('updated_at', { ascending: false }).limit(100),
  ])
  const queryError = leadsError || membershipsError || listingsError
  if (isBrokerSchemaMissing(queryError)) return <main className="site-container py-10" id="main-content"><BrokerMigrationNotice /></main>
  if (queryError) return <main className="site-container py-10" id="main-content"><BrokerErrorNotice /></main>

  const leadRows = leads ?? []
  const [contactsResult, profilesResult, inquiryRowsResult] = await Promise.all([
    canManage && leadRows.length
      ? supabase.from('crm_contacts').select('id, display_name, email, phone').in('id', leadRows.map((lead) => lead.contact_id))
      : Promise.resolve({ data: [], error: null }),
    memberships?.length
      ? supabase.from('profiles').select('id, display_name').in('id', memberships.map((member) => member.user_id))
      : Promise.resolve({ data: [], error: null }),
    canManage && listings?.length
      ? supabase.from('inquiries').select('id, listing_id, name, email, created_at').in('listing_id', listings.map((listing) => listing.id)).neq('sender_id', user.id).order('created_at', { ascending: false }).limit(50)
      : Promise.resolve({ data: [], error: null }),
  ])
  const secondaryError = contactsResult.error || profilesResult.error || inquiryRowsResult.error
  if (isBrokerSchemaMissing(secondaryError)) return <main className="site-container py-10" id="main-content"><BrokerMigrationNotice /></main>
  const contactById = new Map((contactsResult.data ?? []).map((contact) => [contact.id, contact]))
  const profileById = new Map((profilesResult.data ?? []).map((profile) => [profile.id, profile.display_name]))
  const listingById = new Map((listings ?? []).map((listing) => [listing.id, listing]))
  const convertedInquiries = new Set(leadRows.map((lead) => lead.source_inquiry_id).filter(Boolean))
  const unconvertedInquiries = (inquiryRowsResult.data ?? []).filter((inquiry) => !convertedInquiries.has(inquiry.id))
  const members = (memberships ?? []).filter((member) => ['owner', 'agency_admin', 'broker', 'assistant'].includes(member.role))

  return (
    <main className="site-container min-h-[72vh] py-8 sm:py-12" id="main-content">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">{organization.name} · CRM</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-ink">Запитвания и лийдове</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Всяко запитване остава в първоначалния си запис. Превръщането в CRM създава свързан лийд, без да копира съобщението.</p></div><Badge variant="secondary">{leadRows.length} лийда</Badge></div>
      <div className="mt-5"><BrokerStateNotice state={query.state} /></div>
      <section aria-labelledby="inquiries-title" className="mt-8">
        <h2 className="text-xl font-semibold text-ink" id="inquiries-title">Нови запитвания от обяви</h2>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {unconvertedInquiries.length ? unconvertedInquiries.map((inquiry) => {
            const listing = listingById.get(inquiry.listing_id)
            return <article className="rounded-2xl border border-line bg-white p-5" key={inquiry.id}>
              <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold text-ink">{inquiry.name}</h3><p className="mt-1 text-sm text-muted-foreground">{listing?.title ?? 'Имот на агенцията'}</p></div><time className="text-xs text-muted-foreground" dateTime={inquiry.created_at}>{new Intl.DateTimeFormat('bg-BG', { dateStyle: 'medium' }).format(new Date(inquiry.created_at))}</time></div>
              {canManage ? <><p className="mt-3 text-sm text-muted-foreground">{inquiry.email}</p><form action={convertInquiryToCrmLead} className="mt-4"><input name="organization_id" type="hidden" value={organization.id} /><input name="inquiry_id" type="hidden" value={inquiry.id} /><Button size="sm" type="submit">Добави към CRM</Button></form></> : <p className="mt-3 text-sm text-muted-foreground">Контактните данни са ограничени за тази роля.</p>}
            </article>
          }) : <p className="rounded-2xl border border-dashed border-line p-5 text-sm text-muted-foreground">Няма нови запитвания за преобразуване.</p>}
        </div>
      </section>
      <section aria-labelledby="leads-title" className="mt-10">
        <div className="flex items-end justify-between gap-3"><div><h2 className="text-xl font-semibold text-ink" id="leads-title">Активни лийдове</h2><p className="mt-1 text-sm text-muted-foreground">Статусите и назначенията се записват в историята на лийда.</p></div></div>
        <div className="mt-4 flex flex-col gap-3">
          {leadRows.length ? leadRows.map((lead) => {
            const contact = contactById.get(lead.contact_id)
            const listing = lead.listing_id ? listingById.get(lead.listing_id) : null
            const assignedName = lead.assigned_to ? profileById.get(lead.assigned_to) : null
            return <Card className="border-line" key={lead.id}><CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3"><div><CardTitle className="text-base">{contact?.display_name ?? (canManage ? 'Контактът не е наличен' : 'CRM запис')}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{listing ? <Link className="hover:text-brand" href={`/imoti/${listing.slug}`}>{listing.title}</Link> : 'Без свързан имот'}</p></div><div className="flex items-center gap-2"><Badge variant={lead.priority === 'urgent' || lead.priority === 'high' ? 'default' : 'secondary'}>{lead.priority === 'urgent' ? 'Спешен' : lead.priority === 'high' ? 'Висок' : lead.priority === 'low' ? 'Нисък' : 'Стандартен'}</Badge><Badge variant="outline">{leadStatuses.find(([value]) => value === lead.status)?.[1] ?? lead.status}</Badge></div></CardHeader>
              <CardContent>{canManage ? <><p className="text-sm text-muted-foreground">{contact?.email ?? 'Без имейл'}{contact?.phone ? ` · ${contact.phone}` : ''} · Отговорник: {assignedName || 'Неназначен'}</p><form action={updateCrmLead} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><input name="organization_id" type="hidden" value={organization.id} /><input name="lead_id" type="hidden" value={lead.id} /><label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">Статус<select className="form-control" defaultValue={lead.status} name="status">{leadStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">Приоритет<select className="form-control" defaultValue={lead.priority} name="priority">{priorities.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">Отговорник<select className="form-control" defaultValue={lead.assigned_to ?? user.id} name="assigned_to">{members.map((member) => <option key={member.user_id} value={member.user_id}>{profileById.get(member.user_id) || `Член ${member.user_id.slice(0, 8)}`}</option>)}</select></label><label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">Следващо действие<input className="form-control" defaultValue={lead.next_follow_up_at ? new Date(lead.next_follow_up_at).toISOString().slice(0, 16) : ''} name="next_follow_up_at" type="datetime-local" /></label><div className="flex items-end"><Button className="w-full" size="sm" type="submit" variant="outline">Запази</Button></div></form></> : <p className="text-sm text-muted-foreground">Лийдът е видим в режим само за преглед. Контактните данни не са достъпни за тази роля.</p>}</CardContent>
            </Card>
          }) : <p className="rounded-2xl border border-dashed border-line p-6 text-sm text-muted-foreground">CRM лийдовете ще се появят тук след преобразуване на запитване.</p>}
        </div>
      </section>
      <div className="sr-only"><Card><CardHeader><CardTitle>CRM</CardTitle></CardHeader><CardContent>Обработвай запитванията сигурно.</CardContent></Card></div>
    </main>
  )
}
