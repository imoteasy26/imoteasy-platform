import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight, Check, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { BrokerMigrationNotice } from '@/features/broker/broker-state'
import { BrokerStateNotice } from '@/features/broker/broker-state'
import { completeBrokerOnboarding } from '@/app/broker/actions'
import { getBrokerAccess, isBrokerSchemaMissing } from '@/lib/broker-workspace'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Активирай брокерската среда', robots: { index: false, follow: false } }

export default async function BrokerOnboardingPage({ searchParams }: { searchParams: Promise<{ organizationId?: string; state?: string }> }) {
  const query = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/auth/sign-in?next=${encodeURIComponent(`/broker/onboarding${query.organizationId ? `?organizationId=${query.organizationId}` : ''}`)}`)

  const organizationId = query.organizationId && /^[0-9a-f-]{36}$/i.test(query.organizationId) ? query.organizationId : undefined
  const access = await getBrokerAccess(supabase, user.id, organizationId)
  if (access.kind === 'ready' && access.context.subscription) redirect(`/broker?organizationId=${access.context.organization.id}`)

  const migrationMissing = access.kind === 'migration_required' || isBrokerSchemaMissing(null)
  const joiningOrganization = access.kind === 'ready' ? access.context.organization : null
  const state = query.state === 'joined' ? 'joined' : query.state

  return (
    <main className="site-container min-h-[72vh] py-10 sm:py-14" id="main-content">
      <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[1fr_0.8fr]">
        <section>
          <p className="eyebrow">Imoteasy за професионалисти</p>
          <h1 className="mt-3 max-w-2xl text-3xl font-semibold tracking-[-0.04em] text-ink sm:text-4xl">
            {joiningOrganization ? `Завърши настройката за ${joiningOrganization.name}` : 'Започни работа с брокерска среда'}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
            Свържи екипа, запитванията, задачите, огледите и сделките в едно работно място. Запазваш съществуващия си профил и обяви.
          </p>
          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            {['CRM и управление на лийдове', 'Задачи и проследяване', 'Календар за огледи', 'Професионален план за 30 дни'].map((benefit) => (
              <div className="flex items-center gap-3 rounded-xl border border-line bg-white p-4 text-sm font-medium text-ink" key={benefit}><Check aria-hidden className="text-brand" />{benefit}</div>
            ))}
          </div>
          <div className="mt-7 flex items-start gap-3 rounded-2xl bg-subtle p-5">
            <ShieldCheck aria-hidden className="mt-0.5 shrink-0 text-brand" />
            <div><p className="font-semibold text-ink">Без карта. Без автоматично подновяване.</p><p className="mt-1 text-sm leading-6 text-muted-foreground">30-дневният пробен период започва при завършване на въвеждането. След края му няма автоматично таксуване или скрито подновяване.</p></div>
          </div>
          <div className="mt-6"><BrokerStateNotice state={state} /></div>
          {migrationMissing ? <div className="mt-6"><BrokerMigrationNotice /></div> : null}
          {access.kind === 'error' ? <p className="mt-6 rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive" role="alert">Не успяхме да проверим членството. Опитай отново по-късно.</p> : null}
        </section>

        <section aria-labelledby="onboarding-form-title" className="h-fit rounded-3xl border border-line bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-xl font-semibold text-ink" id="onboarding-form-title">{joiningOrganization ? 'Активирай 30-дневния период' : 'Създай работно място'}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Няма да бъдеш питан за банкова карта и няма да бъдеш таксуван след пробния период.</p>
          <form action={completeBrokerOnboarding} className="mt-6 flex flex-col gap-5">
            {joiningOrganization ? <input name="organization_id" type="hidden" value={joiningOrganization.id} /> : <Field><FieldLabel htmlFor="organization-name">Име на агенцията или екипа</FieldLabel><Input autoComplete="organization" id="organization-name" maxLength={120} name="organization_name" required /></Field>}
            <FieldGroup className="flex flex-col gap-3">
              <Field><FieldLabel htmlFor="service-area">Градове и райони <span className="font-normal text-muted-foreground">(по избор)</span></FieldLabel><Input autoComplete="address-level2" id="service-area" maxLength={200} name="service_area" placeholder="Напр. София, Пловдив" /></Field>
            </FieldGroup>
            <label className="flex items-start gap-3 rounded-xl border border-line p-4 text-sm leading-6 text-ink">
              <input className="mt-1 size-4 accent-[var(--brand)]" name="accepted_trial" required type="checkbox" />
              <span>Съгласен/съгласна съм да започна 30-дневния безплатен пробен период. Разбирам, че не се изисква карта и няма автоматично таксуване след края му.</span>
            </label>
            <Button className="min-h-12" disabled={migrationMissing} type="submit">{joiningOrganization ? 'Завърши въвеждането' : 'Създай и активирай'}<ArrowRight aria-hidden data-icon="inline-end" /></Button>
          </form>
          <p className="mt-4 text-xs leading-5 text-muted-foreground">Това действие не променя настройките на профила ти и не публикува обяви.</p>
          <Link className="mt-4 inline-flex text-sm font-semibold text-brand hover:underline" href="/dashboard">Към личния профил</Link>
        </section>
      </div>
    </main>
  )
}
