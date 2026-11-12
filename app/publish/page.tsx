import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { PublishWizard } from '@/features/listings/publish-wizard'
import { BrokerMigrationNotice } from '@/features/broker/broker-state'
import { getBrokerAccess } from '@/lib/broker-workspace'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Публикувай имот', description: 'Добави своя имот в Imoteasy.' }

export default async function PublishPage({ searchParams }: { searchParams: Promise<{ organizationId?: string }> }) {
  const query = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/auth/sign-in?next=${encodeURIComponent(`/publish${query.organizationId ? `?organizationId=${query.organizationId}` : ''}`)}`)
  const organizationId = query.organizationId && /^[0-9a-f-]{36}$/i.test(query.organizationId) ? query.organizationId : undefined
  if (query.organizationId && !organizationId) redirect('/publish')
  if (organizationId) {
    const access = await getBrokerAccess(supabase, user.id, organizationId)
    if (access.kind === 'migration_required') return <main className="site-container min-h-[75vh] py-10 sm:py-14" id="main-content"><BrokerMigrationNotice /></main>
    if (access.kind !== 'ready' || !['owner', 'agency_admin', 'broker'].includes(access.context.membership.role)) redirect('/broker')
  }
  return <main className="site-container min-h-[75vh] py-10 sm:py-14" id="main-content"><div className="mb-8"><p className="eyebrow">Добави обява</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-ink sm:text-4xl">Публикувай имот</h1><p className="mt-2 text-sm text-muted-foreground">Попълни информацията стъпка по стъпка. Черновата ти се изпраща за преглед.</p></div><PublishWizard organizationId={organizationId} /></main>
}
