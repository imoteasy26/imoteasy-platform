import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, Bell, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/empty-state'
import { createClient } from '@/lib/supabase/server'
import { markNotificationRead } from '../actions'

export const metadata: Metadata = { title: 'Известия', robots: { index: false, follow: false } }

export default async function NotificationsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/sign-in?next=%2Fdashboard%2Fnotifications')

  const { data: notifications, error } = await supabase.from('notifications')
    .select('id, title, body, href, is_read, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)
  const migrationMissing = error && ['42P01', '42703', 'PGRST204', 'PGRST205'].includes(error.code)

  return (
    <main className="site-container min-h-[72vh] py-10 sm:py-14" id="main-content">
      <Link className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-brand" href="/dashboard"><ArrowLeft aria-hidden size={16} />Към профила</Link>
      <p className="eyebrow">Моят профил</p>
      <h1 className="mt-2 flex items-center gap-3 text-3xl font-semibold tracking-[-0.04em] text-ink sm:text-4xl"><Bell aria-hidden size={26} />Известия</h1>
      <p className="mt-2 text-sm text-muted-foreground">Нови обяви по запазени търсения, спадове в цените и запитвания.</p>
      {migrationMissing ? <p role="status" className="mt-6 rounded-2xl border border-brand/20 bg-brand/[0.04] p-5 text-sm leading-6 text-ink">Известията ще се активират след прилагането на миграцията за MVP функции. Текущите данни и настройки не са променени.</p> : null}
      {error && !migrationMissing ? <p role="alert" className="mt-6 rounded-xl bg-destructive/10 p-4 text-sm text-destructive">Не успяхме да заредим известията.</p> : null}
      {!error && notifications?.length ? <ul className="mt-7 flex flex-col gap-3">{notifications.map((notification) => <li className={`rounded-2xl border p-5 ${notification.is_read ? 'border-line bg-white' : 'border-brand/25 bg-brand/[0.035]'}`} key={notification.id}>
        <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="font-semibold text-ink">{notification.title}</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">{notification.body}</p><time className="mt-3 block text-xs text-muted-foreground" dateTime={notification.created_at}>{new Intl.DateTimeFormat('bg-BG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(notification.created_at))}</time></div>
          <div className="flex shrink-0 gap-2"><Link className="btn-secondary min-h-9 px-3 text-xs" href={notification.href}>Отвори</Link>{!notification.is_read ? <form action={markNotificationRead}><input name="id" type="hidden" value={notification.id} /><Button aria-label={`Маркирай като прочетено: ${notification.title}`} size="sm" type="submit" variant="outline"><Check data-icon="inline-start" />Прочетено</Button></form> : null}</div>
        </div>
      </li>)}</ul> : !error ? <div className="mt-7"><EmptyState description="Ще ти покажем новите съвпадения и важните промени по имотите тук." title="Нямаш известия" /></div> : null}
    </main>
  )
}
