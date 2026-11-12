import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { BrokerErrorNotice, BrokerMigrationNotice, BrokerStateNotice } from '@/features/broker/broker-state'
import { createViewingAppointment, updateViewingAppointment } from '@/app/broker/actions'
import { getBrokerAccess, isBrokerSchemaMissing } from '@/lib/broker-workspace'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Огледи' }

const viewingStatusLabel = { requested: 'Заявено', confirmed: 'Потвърдено', cancelled: 'Отказано', rescheduled: 'Пренасрочено', completed: 'Проведено', no_show: 'Не се яви' } as const
const outcomeLabel = { interested: 'Има интерес', not_interested: 'Няма интерес', follow_up: 'Нужно проследяване', offer_expected: 'Очаква се оферта', other: 'Друго' } as const

export default async function BrokerViewingsPage({ searchParams }: { searchParams: Promise<{ organizationId?: string; state?: string }> }) {
  const query = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/sign-in?next=%2Fbroker%2Fviewings')
  const access = await getBrokerAccess(supabase, user.id, query.organizationId)
  if (access.kind === 'migration_required') return <main className="site-container py-10" id="main-content"><BrokerMigrationNotice /></main>
  if (access.kind === 'error') return <main className="site-container py-10" id="main-content"><BrokerErrorNotice /></main>
  if (access.kind === 'no_membership') redirect('/broker/onboarding')
  const { organization, membership } = access.context
  const canManage = ['owner', 'agency_admin', 'broker', 'assistant'].includes(membership.role)
  const [{ data: appointments, error: appointmentError }, { data: listings, error: listingError }, { data: leads, error: leadError }] = await Promise.all([
    supabase.from('viewing_appointments').select('id, organization_id, listing_id, lead_id, contact_id, broker_user_id, scheduled_at, duration_minutes, status, outcome, internal_notes, cancellation_reason, created_by, created_at, updated_at').eq('organization_id', organization.id).order('scheduled_at', { ascending: true }).limit(100),
    supabase.from('listings').select('id, title, slug').eq('organization_id', organization.id).eq('status', 'published').order('updated_at', { ascending: false }).limit(100),
    canManage ? supabase.from('crm_leads').select('id, contact_id, status').eq('organization_id', organization.id).not('status', 'in', '(won,lost)').limit(100) : Promise.resolve({ data: [], error: null }),
  ])
  const error = appointmentError || listingError || leadError
  if (isBrokerSchemaMissing(error)) return <main className="site-container py-10" id="main-content"><BrokerMigrationNotice /></main>
  if (error) return <main className="site-container py-10" id="main-content"><BrokerErrorNotice /></main>
  const listingById = new Map((listings ?? []).map((listing) => [listing.id, listing]))
  const leadNames = new Map<string, string>()
  if (canManage && leads?.length) {
    const { data: contacts, error: contactError } = await supabase.from('crm_contacts').select('id, display_name').in('id', leads.map((lead) => lead.contact_id))
    if (isBrokerSchemaMissing(contactError)) return <main className="site-container py-10" id="main-content"><BrokerMigrationNotice /></main>
    for (const contact of contacts ?? []) leadNames.set(contact.id, contact.display_name)
  }

  return (
    <main className="site-container min-h-[72vh] py-8 sm:py-12" id="main-content">
      <div><p className="eyebrow">{organization.name} · Календар</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-ink">Огледи</h1><p className="mt-2 text-sm text-muted-foreground">Планирай посещения и записвай потвърждения, промени и резултат.</p></div>
      <div className="mt-5"><BrokerStateNotice state={query.state} /></div>
      {canManage ? <form action={createViewingAppointment} className="mt-7 grid gap-4 rounded-2xl border border-line bg-white p-5 sm:grid-cols-2 lg:grid-cols-4"><input name="organization_id" type="hidden" value={organization.id} /><Field><FieldLabel htmlFor="viewing-listing">Имот</FieldLabel><select className="form-control" defaultValue="" id="viewing-listing" name="listing_id" required><option disabled value="">Избери обява</option>{(listings ?? []).map((listing) => <option key={listing.id} value={listing.id}>{listing.title}</option>)}</select></Field><Field><FieldLabel htmlFor="viewing-lead">CRM лийд <span className="font-normal text-muted-foreground">(по избор)</span></FieldLabel><select className="form-control" defaultValue="" id="viewing-lead" name="lead_id"><option value="">Без свързан лийд</option>{(leads ?? []).map((lead) => <option key={lead.id} value={lead.id}>{leadNames.get(lead.contact_id) || `Лийд ${lead.id.slice(0, 8)}`}</option>)}</select></Field><Field><FieldLabel htmlFor="viewing-time">Дата и час · София</FieldLabel><Input id="viewing-time" name="scheduled_at" required type="datetime-local" /></Field><Field><FieldLabel htmlFor="viewing-duration">Продължителност (минути)</FieldLabel><Input defaultValue="30" id="viewing-duration" max="240" min="10" name="duration_minutes" required type="number" /></Field><div className="sm:col-span-2 lg:col-span-4"><Button type="submit">Насрочи оглед</Button></div></form> : null}
      <section aria-labelledby="viewings-list-title" className="mt-9"><h2 className="text-xl font-semibold text-ink" id="viewings-list-title">График на екипа</h2><div className="mt-4 flex flex-col gap-3">{appointments?.length ? appointments.map((appointment) => {
        const listing = listingById.get(appointment.listing_id)
        return <article className="rounded-2xl border border-line bg-white p-5" key={appointment.id}><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold text-ink">{listing?.title ?? 'Обява'}</h3><p className="mt-1 text-sm text-muted-foreground">{new Intl.DateTimeFormat('bg-BG', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/Sofia' }).format(new Date(appointment.scheduled_at))} · {appointment.duration_minutes} мин.</p>{appointment.outcome ? <p className="mt-2 text-sm text-muted-foreground">Резултат: {outcomeLabel[appointment.outcome]}</p> : null}</div><Badge variant={appointment.status === 'confirmed' ? 'default' : appointment.status === 'cancelled' ? 'secondary' : 'outline'}>{viewingStatusLabel[appointment.status]}</Badge></div>{canManage ? <form action={updateViewingAppointment} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><input name="organization_id" type="hidden" value={organization.id} /><input name="appointment_id" type="hidden" value={appointment.id} /><Field><FieldLabel htmlFor={`viewing-status-${appointment.id}`}>Статус</FieldLabel><select className="form-control" defaultValue={appointment.status} id={`viewing-status-${appointment.id}`} name="status">{Object.entries(viewingStatusLabel).filter(([status]) => status !== 'requested').map(([status, label]) => <option key={status} value={status}>{label}</option>)}</select></Field><Field><FieldLabel htmlFor={`viewing-time-${appointment.id}`}>Нов час <span className="font-normal text-muted-foreground">(при пренасрочване)</span></FieldLabel><Input id={`viewing-time-${appointment.id}`} name="scheduled_at" type="datetime-local" /></Field><Field><FieldLabel htmlFor={`viewing-outcome-${appointment.id}`}>Резултат</FieldLabel><select className="form-control" defaultValue={appointment.outcome ?? ''} id={`viewing-outcome-${appointment.id}`} name="outcome"><option value="">Не е записан</option>{Object.entries(outcomeLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field><FieldLabel htmlFor={`viewing-cancel-${appointment.id}`}>Причина при отказ</FieldLabel><Input id={`viewing-cancel-${appointment.id}`} maxLength={500} name="cancellation_reason" /></Field><div className="sm:col-span-2 lg:col-span-4"><Button size="sm" type="submit" variant="outline">Запази огледа</Button></div></form> : null}</article>
      }) : <p className="rounded-2xl border border-dashed border-line p-6 text-sm text-muted-foreground">Няма насрочени огледи.</p>}</div></section>
    </main>
  )
}
