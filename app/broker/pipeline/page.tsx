import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { BrokerErrorNotice, BrokerMigrationNotice, BrokerStateNotice } from '@/features/broker/broker-state'
import { createBrokerTransaction, transitionBrokerTransaction } from '@/app/broker/actions'
import { getBrokerAccess, isBrokerSchemaMissing } from '@/lib/broker-workspace'
import { createClient } from '@/lib/supabase/server'

type TransactionStatus = 'lead' | 'qualified' | 'viewing' | 'offer' | 'negotiation' | 'due_diligence' | 'contract_preparation' | 'contract_signed' | 'completed' | 'cancelled'
const transactionLabels: Record<TransactionStatus, string> = {
  lead: 'Лийд', qualified: 'Квалифициран', viewing: 'Оглед', offer: 'Оферта', negotiation: 'Преговори',
  due_diligence: 'Проверка', contract_preparation: 'Подготовка на договор', contract_signed: 'Договор подписан', completed: 'Завършена', cancelled: 'Отказана',
}
const nextStatuses: Partial<Record<TransactionStatus, TransactionStatus[]>> = {
  lead: ['qualified', 'cancelled'], qualified: ['viewing', 'offer', 'cancelled'], viewing: ['offer', 'negotiation', 'cancelled'],
  offer: ['negotiation', 'contract_preparation', 'cancelled'], negotiation: ['offer', 'due_diligence', 'contract_preparation', 'cancelled'],
  due_diligence: ['negotiation', 'contract_preparation', 'cancelled'], contract_preparation: ['contract_signed', 'due_diligence', 'cancelled'],
  contract_signed: ['cancelled'],
}

export const metadata: Metadata = { title: 'Сделки' }

export default async function BrokerPipelinePage({ searchParams }: { searchParams: Promise<{ organizationId?: string; state?: string }> }) {
  const query = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/sign-in?next=%2Fbroker%2Fpipeline')
  const access = await getBrokerAccess(supabase, user.id, query.organizationId)
  if (access.kind === 'migration_required') return <main className="site-container py-10" id="main-content"><BrokerMigrationNotice /></main>
  if (access.kind === 'error') return <main className="site-container py-10" id="main-content"><BrokerErrorNotice /></main>
  if (access.kind === 'no_membership') redirect('/broker/onboarding')
  const { organization, membership } = access.context
  const canManage = ['owner', 'agency_admin', 'broker'].includes(membership.role)
  const [{ data: transactions, error: transactionError }, { data: listings, error: listingError }, { data: leads, error: leadError }] = await Promise.all([
    supabase.from('transactions').select('id, organization_id, listing_id, lead_id, seller_contact_id, buyer_contact_id, broker_user_id, status, asking_price_snapshot, verified_completion_at, verified_completion_by, completion_verification_note, created_by, created_at, updated_at').eq('organization_id', organization.id).order('updated_at', { ascending: false }).limit(100),
    supabase.from('listings').select('id, title, slug, price_eur').eq('organization_id', organization.id).eq('status', 'published').order('updated_at', { ascending: false }).limit(100),
    canManage ? supabase.from('crm_leads').select('id, contact_id, listing_id, status').eq('organization_id', organization.id).not('status', 'in', '(won,lost)').limit(100) : Promise.resolve({ data: [], error: null }),
  ])
  const error = transactionError || listingError || leadError
  if (isBrokerSchemaMissing(error)) return <main className="site-container py-10" id="main-content"><BrokerMigrationNotice /></main>
  if (error) return <main className="site-container py-10" id="main-content"><BrokerErrorNotice /></main>

  const leadContactIds = (leads ?? []).map((lead) => lead.contact_id)
  const { data: contacts, error: contactError } = leadContactIds.length
    ? await supabase.from('crm_contacts').select('id, display_name').in('id', leadContactIds)
    : { data: [], error: null }
  if (isBrokerSchemaMissing(contactError)) return <main className="site-container py-10" id="main-content"><BrokerMigrationNotice /></main>
  const { data: events, error: eventError } = transactions?.length
    ? await supabase.from('transaction_events').select('id, organization_id, transaction_id, actor_id, event_type, event_data, created_at').eq('organization_id', organization.id).in('transaction_id', transactions.map((transaction) => transaction.id)).order('created_at', { ascending: false }).limit(100)
    : { data: [], error: null }
  if (isBrokerSchemaMissing(eventError)) return <main className="site-container py-10" id="main-content"><BrokerMigrationNotice /></main>

  const listingById = new Map((listings ?? []).map((listing) => [listing.id, listing]))
  const contactById = new Map((contacts ?? []).map((contact) => [contact.id, contact.display_name]))
  const eventsByTransaction = new Map<string, NonNullable<typeof events>>()
  for (const event of events ?? []) eventsByTransaction.set(event.transaction_id, [...(eventsByTransaction.get(event.transaction_id) ?? []), event])

  return (
    <main className="site-container min-h-[72vh] py-8 sm:py-12" id="main-content">
      <div><p className="eyebrow">{organization.name} · Транзакции</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-ink">Пътят на сделката</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Офертата не означава завършена сделка. Завършването изисква отделна проверка от платформен администратор.</p></div>
      <div className="mt-5"><BrokerStateNotice state={query.state} /></div>
      {canManage ? <form action={createBrokerTransaction} className="mt-7 grid gap-4 rounded-2xl border border-line bg-white p-5 sm:grid-cols-2"><input name="organization_id" type="hidden" value={organization.id} /><Field><FieldLabel htmlFor="deal-listing">Обява</FieldLabel><select className="form-control" defaultValue="" id="deal-listing" name="listing_id" required><option disabled value="">Избери публикуван имот</option>{(listings ?? []).map((listing) => <option key={listing.id} value={listing.id}>{listing.title}</option>)}</select></Field><Field><FieldLabel htmlFor="deal-lead">Свързан лийд <span className="font-normal text-muted-foreground">(по избор)</span></FieldLabel><select className="form-control" defaultValue="" id="deal-lead" name="lead_id"><option value="">Без CRM лийд</option>{(leads ?? []).map((lead) => <option key={lead.id} value={lead.id}>{contactById.get(lead.contact_id) || `Лийд ${lead.id.slice(0, 8)}`}</option>)}</select></Field><div className="sm:col-span-2"><Button type="submit">Започни сделка</Button></div></form> : null}
      <section aria-labelledby="deal-list-title" className="mt-9"><h2 className="text-xl font-semibold text-ink" id="deal-list-title">Активни сделки</h2><div className="mt-4 flex flex-col gap-3">{transactions?.length ? transactions.map((transaction) => {
        const listing = listingById.get(transaction.listing_id)
        const status = transaction.status as TransactionStatus
        const possibleNext = nextStatuses[status] ?? []
        return <article className="rounded-2xl border border-line bg-white p-5" key={transaction.id}><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold text-ink">{listing?.title ?? 'Имот'}</h3><p className="mt-1 text-sm text-muted-foreground">{transaction.asking_price_snapshot ? `${new Intl.NumberFormat('bg-BG', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(transaction.asking_price_snapshot)} при откриване` : 'Без ценова снимка'}</p></div><Badge variant={status === 'completed' ? 'default' : status === 'cancelled' ? 'secondary' : 'outline'}>{transactionLabels[status]}</Badge></div>
          {status === 'completed' && transaction.verified_completion_at ? <p className="mt-3 text-sm text-muted-foreground">Проверено {new Intl.DateTimeFormat('bg-BG', { dateStyle: 'medium' }).format(new Date(transaction.verified_completion_at))}.</p> : null}
          {possibleNext.length && canManage ? <form action={transitionBrokerTransaction} className="mt-4 flex flex-wrap items-end gap-3"><input name="organization_id" type="hidden" value={organization.id} /><input name="transaction_id" type="hidden" value={transaction.id} /><Field><FieldLabel htmlFor={`deal-status-${transaction.id}`}>Следваща стъпка</FieldLabel><select className="form-control min-w-56" defaultValue={possibleNext[0]} id={`deal-status-${transaction.id}`} name="status">{possibleNext.map((nextStatus) => <option key={nextStatus} value={nextStatus}>{transactionLabels[nextStatus]}</option>)}</select></Field><Button size="sm" type="submit" variant="outline">Обнови етап</Button></form> : null}
          <details className="mt-4 border-t border-line pt-3"><summary className="cursor-pointer text-sm font-semibold text-muted-foreground">История на сделката ({eventsByTransaction.get(transaction.id)?.length ?? 0})</summary><ol className="mt-3 flex flex-col gap-2">{(eventsByTransaction.get(transaction.id) ?? []).map((event) => <li className="rounded-lg bg-subtle p-3 text-xs text-muted-foreground" key={event.id}><span className="font-semibold text-ink">{event.event_type === 'created' ? 'Създадена' : 'Промяна на етап'}</span><time className="ml-2" dateTime={event.created_at}>{new Intl.DateTimeFormat('bg-BG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(event.created_at))}</time>{event.event_data && typeof event.event_data === 'object' && 'new_status' in event.event_data ? <span className="ml-2">{String(event.event_data.new_status)}</span> : null}</li>)}</ol></details>
        </article>
      }) : <p className="rounded-2xl border border-dashed border-line p-6 text-sm text-muted-foreground">Няма започнати сделки за тази агенция.</p>}</div></section>
    </main>
  )
}
