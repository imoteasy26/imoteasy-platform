import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { BrokerWorkspaceNav } from '@/features/broker/broker-workspace-nav'

const workspaceLinks = [
  ['/broker', 'Обзор'], ['/broker/leads', 'CRM и запитвания'], ['/broker/listings', 'Обяви'],
  ['/broker/tasks', 'Задачи'], ['/broker/viewings', 'Огледи'], ['/broker/pipeline', 'Сделки'], ['/broker/team', 'Екип'],
] as const

function BrokerWorkspaceNavFallback() {
  return <nav aria-label="Брокерска работна среда" className="site-container mt-6 flex gap-2 overflow-x-auto border-b border-line pb-3 text-sm font-semibold">{workspaceLinks.map(([href, label]) => <Link className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-ink/75 transition hover:bg-subtle hover:text-brand" href={href} key={href}>{label}</Link>)}</nav>
}

export const metadata: Metadata = {
  title: { default: 'Работна среда за брокери', template: '%s | Imoteasy' },
  robots: { index: false, follow: false },
}

export default async function BrokerLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return <>{user ? <Suspense fallback={<BrokerWorkspaceNavFallback />}><BrokerWorkspaceNav /></Suspense> : null}{children}</>
}
