import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowUpRight } from 'lucide-react'
import { DashboardListingRow } from '@/features/dashboard/dashboard-listing-row'
import { BrokerErrorNotice, BrokerMigrationNotice } from '@/features/broker/broker-state'
import { getBrokerAccess, isBrokerSchemaMissing } from '@/lib/broker-workspace'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Агенционни обяви' }

export default async function BrokerListingsPage({ searchParams }: { searchParams: Promise<{ organizationId?: string }> }) {
  const query = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/sign-in?next=%2Fbroker%2Flistings')
  const access = await getBrokerAccess(supabase, user.id, query.organizationId)
  if (access.kind === 'migration_required') return <main className="site-container py-10" id="main-content"><BrokerMigrationNotice /></main>
  if (access.kind === 'error') return <main className="site-container py-10" id="main-content"><BrokerErrorNotice /></main>
  if (access.kind === 'no_membership') redirect('/broker/onboarding')
  const { organization, membership } = access.context
  if (!['owner', 'agency_admin', 'broker'].includes(membership.role)) redirect('/broker')

  const { data: listings, error } = await supabase.from('listings').select('*').eq('organization_id', organization.id).order('updated_at', { ascending: false }).limit(100)
  if (isBrokerSchemaMissing(error)) return <main className="site-container py-10" id="main-content"><BrokerMigrationNotice /></main>
  if (error) return <main className="site-container py-10" id="main-content"><BrokerErrorNotice /></main>
  const canDeleteAllDrafts = ['owner', 'agency_admin'].includes(membership.role)

  return (
    <main className="site-container min-h-[72vh] py-8 sm:py-12" id="main-content">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">{organization.name} · Инвентар</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-ink">Обяви на агенцията</h1><p className="mt-2 text-sm text-muted-foreground">Общият инвентар е видим за активните членове на организацията.</p></div><Link className="btn-primary" href={`/publish?organizationId=${organization.id}`}>Нова обява<ArrowUpRight aria-hidden size={16} /></Link></div>
      <section aria-label="Обяви на организацията" className="mt-7 flex flex-col gap-3">{listings?.length ? listings.map((listing) => <DashboardListingRow canDeleteDraft={canDeleteAllDrafts || listing.owner_id === user.id} key={listing.id} listing={listing} />) : <p className="rounded-2xl border border-dashed border-line p-6 text-sm text-muted-foreground">Агенцията все още няма обяви. Създай първата обява в името на работното място.</p>}</section>
    </main>
  )
}
