import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowUpRight, CalendarDays, CheckSquare, ContactRound, Home, Sparkles, Workflow } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BrokerErrorNotice, BrokerMigrationNotice, BrokerStateNotice } from '@/features/broker/broker-state'
import { getBrokerAccess } from '@/lib/broker-workspace'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = {
  title: 'За брокери и агенции',
  description: 'Управлявай обяви, запитвания и сделки в една работна среда. Започни с 30 дни Professional без карта и без автоматично таксуване.',
  robots: { index: true, follow: true },
}

function formatTrial(subscription: { status: string; trial_ends_at: string } | null) {
  if (!subscription) return { label: 'Неактивиран', detail: 'Завърши въвеждането, за да активираш пробния период.' }
  if (subscription.status !== 'trialing') return { label: subscription.status === 'active' ? 'Активен план' : 'Планът е неактивен', detail: 'Няма автоматично таксуване от пробен период.' }
  const remaining = new Date(subscription.trial_ends_at).getTime() - Date.now()
  if (remaining <= 0) return { label: 'Пробният период е изтекъл', detail: 'Няма автоматично подновяване или таксуване.' }
  const days = Math.ceil(remaining / 86_400_000)
  return { label: `${days} дни остават`, detail: `Достъпът е до ${new Intl.DateTimeFormat('bg-BG', { dateStyle: 'medium' }).format(new Date(subscription.trial_ends_at))}. Без автоматично подновяване.` }
}

export default async function BrokerDashboardPage({ searchParams }: { searchParams: Promise<{ organizationId?: string; onboarding?: string; joined?: string }> }) {
  const query = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return (
    <main className="site-container min-h-[72vh] py-10 sm:py-16" id="main-content">
      <section className="overflow-hidden rounded-[2rem] border border-line bg-gradient-to-br from-white via-white to-brand/[0.06] px-6 py-10 sm:px-10 sm:py-14">
        <p className="eyebrow">Imoteasy за брокери</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-[-0.05em] text-ink sm:text-5xl">Обяви, клиенти и сделки. В една работна среда.</h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground">Организирай екипа, управлявай общия инвентар и превръщай запитванията в проследими следващи стъпки.</p>
        <div className="mt-7 flex flex-wrap gap-3"><Link className="btn-primary" href="/auth/sign-up?next=%2Fbroker%2Fonboarding">Започни 30 дни безплатно<ArrowUpRight aria-hidden size={16} /></Link><Link className="btn-secondary" href="/auth/sign-in?next=%2Fbroker">Вече имаш профил?</Link></div>
        <p className="mt-4 text-sm text-muted-foreground">Professional план · без карта · без автоматично таксуване след пробния период</p>
      </section>
      <section aria-label="Възможности за брокери" className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[
        ['Екип и обяви', 'Споделен инвентар с ролеви достъп за организацията.'],
        ['CRM и запитвания', 'Запази оригиналното запитване и проследи отговорника и статуса.'],
        ['Огледи и задачи', 'Планирай следващите действия и следи резултатите.'],
        ['Път на сделката', 'Проследи етапите до подписан договор и отделна проверка.'],
      ].map(([title, description]) => <article className="rounded-2xl border border-line bg-white p-5" key={title}><h2 className="font-semibold text-ink">{title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p></article>)}</section>
    </main>
  )
  const access = await getBrokerAccess(supabase, user.id, query.organizationId)

  if (access.kind === 'migration_required') return <main className="site-container min-h-[72vh] py-10" id="main-content"><BrokerMigrationNotice /></main>
  if (access.kind === 'error') return <main className="site-container min-h-[72vh] py-10" id="main-content"><BrokerErrorNotice /></main>
  if (access.kind === 'no_membership') return (
    <main className="site-container min-h-[72vh] py-10 sm:py-14" id="main-content">
      <div className="max-w-3xl"><p className="eyebrow">Брокерска работна среда</p><h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-ink sm:text-4xl">Свържи ежедневната си работа с Imoteasy.</h1><p className="mt-4 text-base leading-7 text-muted-foreground">Започни с 30 дни достъп до професионалния план. Не се изисква карта и няма автоматично таксуване след пробния период.</p><Link className="btn-primary mt-6" href="/broker/onboarding">Започни въвеждането<ArrowUpRight aria-hidden size={16} /></Link></div>
    </main>
  )

  const { organization, membership, subscription, plan } = access.context
  const workspaceHref = (path: string) => query.organizationId ? `${path}?organizationId=${encodeURIComponent(organization.id)}` : path
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
  const [listings, leads, tasks, viewings, transactions, usage] = await Promise.all([
    supabase.from('listings').select('id', { count: 'exact', head: true }).eq('organization_id', organization.id).eq('status', 'published'),
    supabase.from('crm_leads').select('id', { count: 'exact', head: true }).eq('organization_id', organization.id).eq('status', 'new'),
    supabase.from('crm_tasks').select('id', { count: 'exact', head: true }).eq('organization_id', organization.id).in('status', ['open', 'in_progress']),
    supabase.from('viewing_appointments').select('id', { count: 'exact', head: true }).eq('organization_id', organization.id).gte('scheduled_at', now.toISOString()).in('status', ['requested', 'confirmed', 'rescheduled']),
    supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('organization_id', organization.id).not('status', 'in', '(completed,cancelled)'),
    supabase.from('broker_usage_events').select('units').eq('organization_id', organization.id).eq('broker_user_id', user.id).gte('created_at', monthStart).limit(1000),
  ])
  const stats = [
    { label: 'Публикувани обяви', value: listings.error ? '—' : String(listings.count ?? 0), href: workspaceHref('/broker/listings'), icon: Home },
    { label: 'Нови лийдове', value: leads.error ? '—' : String(leads.count ?? 0), href: workspaceHref('/broker/leads'), icon: ContactRound },
    { label: 'Отворени задачи', value: tasks.error ? '—' : String(tasks.count ?? 0), href: workspaceHref('/broker/tasks'), icon: CheckSquare },
    { label: 'Предстоящи огледи', value: viewings.error ? '—' : String(viewings.count ?? 0), href: workspaceHref('/broker/viewings'), icon: CalendarDays },
    { label: 'Сделки в процес', value: transactions.error ? '—' : String(transactions.count ?? 0), href: workspaceHref('/broker/pipeline'), icon: Workflow },
  ]
  const trial = formatTrial(subscription)
  const usageUnits = usage.error ? null : (usage.data ?? []).reduce((sum, event) => sum + event.units, 0)
  const onboardingComplete = query.onboarding === 'complete'

  return (
    <main className="site-container min-h-[72vh] py-8 sm:py-12" id="main-content">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="eyebrow">Работно място · {organization.organization_type === 'agency' ? 'Агенция' : 'Брокерски екип'}</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-ink sm:text-4xl">{organization.name}</h1><p className="mt-2 text-sm text-muted-foreground">Роля: {membership.role === 'owner' ? 'Собственик' : membership.role === 'agency_admin' ? 'Администратор' : membership.role === 'broker' ? 'Брокер' : membership.role === 'assistant' ? 'Асистент' : membership.role === 'read_only' ? 'Само преглед' : 'Маркетинг мениджър'}</p></div>
        <div className="flex gap-2"><Link className="btn-secondary" href="/dashboard">Личен профил</Link><Link className="btn-primary" href={`/publish?organizationId=${organization.id}`}>Нова обява<ArrowUpRight aria-hidden size={16} /></Link></div>
      </div>
      {onboardingComplete ? <div className="mt-6"><BrokerStateNotice state="onboarding" /></div> : null}
      {query.joined ? <div className="mt-6"><BrokerStateNotice state="joined" /></div> : null}
      <section aria-label="Абонамент и използване" className="mt-7 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card className="border-line"><CardHeader><p className="eyebrow">Пробен период</p><CardTitle>{trial.label}</CardTitle></CardHeader><CardContent><p className="text-sm leading-6 text-muted-foreground">{trial.detail}</p><p className="mt-3 text-xs text-muted-foreground">План: {plan?.display_name ?? 'Professional'} · 30 дни · без карта</p>{!subscription && membership.role === 'broker' ? <Link className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-brand" href={`/broker/onboarding?organizationId=${organization.id}`}>Завърши въвеждането<ArrowUpRight aria-hidden size={16} /></Link> : null}</CardContent></Card>
        <Card className="border-line"><CardHeader><p className="eyebrow">AI ресурси</p><CardTitle className="flex items-center gap-2"><Sparkles aria-hidden className="text-brand" />Използване този месец</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold text-ink">{usageUnits === null ? '—' : usageUnits.toLocaleString('bg-BG')} <span className="text-sm font-normal text-muted-foreground">единици</span></p><p className="mt-2 text-sm leading-6 text-muted-foreground">Използването се записва по брокер. Генерирането на AI съдържание е следващ етап и не е активирано в тази версия.</p></CardContent></Card>
      </section>
      <section aria-label="Оперативни показатели" className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map(({ label, value, href, icon: Icon }) => <Link href={href} key={label}><Card className="h-full border-line transition hover:border-brand/30"><CardContent className="p-5"><Icon aria-hidden className="text-brand" /><p className="mt-4 text-sm text-muted-foreground">{label}</p><p className="mt-1 text-3xl font-semibold tracking-tight text-ink">{value}</p></CardContent></Card></Link>)}
      </section>
      <section aria-labelledby="broker-next-steps" className="mt-10 rounded-3xl border border-line bg-white p-6 sm:p-8">
        <h2 className="text-xl font-semibold text-ink" id="broker-next-steps">Следващи стъпки</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Link className="rounded-xl bg-subtle p-4 text-sm font-semibold text-ink transition hover:text-brand" href={workspaceHref('/broker/leads')}>Прегледай запитванията и CRM лийдовете</Link>
          <Link className="rounded-xl bg-subtle p-4 text-sm font-semibold text-ink transition hover:text-brand" href={workspaceHref('/broker/viewings')}>Насрочи или обнови оглед</Link>
          <Link className="rounded-xl bg-subtle p-4 text-sm font-semibold text-ink transition hover:text-brand" href={workspaceHref('/broker/pipeline')}>Проследи активна сделка</Link>
        </div>
      </section>
    </main>
  )
}
