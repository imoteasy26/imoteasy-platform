'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Building2, CalendarDays, CheckSquare, ContactRound, Home, LayoutDashboard, Users, Workflow } from 'lucide-react'

const links = [
  { href: '/broker', label: 'Обзор', icon: LayoutDashboard },
  { href: '/broker/leads', label: 'CRM и запитвания', icon: ContactRound },
  { href: '/broker/listings', label: 'Обяви', icon: Home },
  { href: '/broker/tasks', label: 'Задачи', icon: CheckSquare },
  { href: '/broker/viewings', label: 'Огледи', icon: CalendarDays },
  { href: '/broker/pipeline', label: 'Сделки', icon: Workflow },
  { href: '/broker/team', label: 'Екип', icon: Users },
]

export function BrokerWorkspaceNav() {
  const searchParams = useSearchParams()
  const organizationId = searchParams.get('organizationId')

  return (
    <nav aria-label="Брокерска работна среда" className="site-container mt-6 flex gap-2 overflow-x-auto border-b border-line pb-3 text-sm font-semibold">
      {links.map(({ href, label, icon: Icon }) => {
        const workspaceHref = organizationId ? `${href}?organizationId=${encodeURIComponent(organizationId)}` : href
        return <Link className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-ink/75 transition hover:bg-subtle hover:text-brand" href={workspaceHref} key={href}>
          <Icon aria-hidden size={16} />{label}
        </Link>
      })}
      <Link className="sr-only" href="/imoti"><Building2 aria-hidden />Към пазара</Link>
    </nav>
  )
}
