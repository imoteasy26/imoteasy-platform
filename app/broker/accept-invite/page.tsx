import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { BrokerMigrationNotice } from '@/features/broker/broker-state'
import { acceptOrganizationInvite } from '@/app/broker/actions'
import { getBrokerAccess } from '@/lib/broker-workspace'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Приеми покана', robots: { index: false, follow: false } }

export default async function AcceptBrokerInvitePage({ searchParams }: { searchParams: Promise<{ token?: string; state?: string }> }) {
  const query = await searchParams
  const token = query.token && /^[a-f0-9]{64}$/.test(query.token) ? query.token : null
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    const next = token ? `/broker/accept-invite?token=${token}` : '/broker/accept-invite'
    return <main className="site-container min-h-[72vh] py-12" id="main-content"><div className="max-w-xl rounded-3xl border border-line bg-white p-7"><h1 className="text-2xl font-semibold text-ink">Покана за екип</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">Влез с имейла, към който е изпратена поканата, за да я приемеш.</p><Link className="btn-primary mt-5" href={`/auth/sign-in?next=${encodeURIComponent(next)}`}>Вход</Link></div></main>
  }
  if (!token) return <main className="site-container min-h-[72vh] py-12" id="main-content"><p className="max-w-xl rounded-xl border border-destructive/25 bg-destructive/5 p-5 text-sm text-destructive" role="alert">Линкът за покана е невалиден или е изтекъл.</p></main>

  const access = await getBrokerAccess(supabase, user.id)
  if (access.kind === 'migration_required') return <main className="site-container min-h-[72vh] py-12" id="main-content"><BrokerMigrationNotice /></main>
  const stateMessage = query.state === 'migration'
    ? 'Миграцията за брокерската среда още не е налична.'
    : query.state === 'invalid'
      ? 'Поканата е невалидна, изтекла или адресирана към друг имейл.'
      : null

  return (
    <main className="site-container min-h-[72vh] py-12" id="main-content">
      <section className="mx-auto max-w-xl rounded-3xl border border-line bg-white p-7 shadow-sm">
        <p className="eyebrow">Работа с екип</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Приеми поканата</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">Поканата е еднократна и е свързана с потвърдения имейл на профила ти.</p>
        {stateMessage ? <p className="mt-4 rounded-xl bg-subtle p-4 text-sm text-ink" role="status">{stateMessage}</p> : null}
        <form action={acceptOrganizationInvite} className="mt-6"><input name="token" type="hidden" value={token} /><Button type="submit">Приеми поканата</Button></form>
      </section>
    </main>
  )
}
