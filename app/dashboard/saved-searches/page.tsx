import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, BellRing, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/empty-state'
import { createClient } from '@/lib/supabase/server'
import { parseSavedSearchFilters, savedSearchHref } from '@/lib/saved-searches'
import { deleteSavedSearch, toggleSavedSearch } from '../actions'

export const metadata: Metadata = { title: 'Запазени търсения', robots: { index: false, follow: false } }

export default async function SavedSearchesPage({ searchParams }: { searchParams: Promise<{ updated?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/sign-in?next=%2Fdashboard%2Fsaved-searches')

  const [{ data: savedSearches, error }, query] = await Promise.all([
    supabase.from('saved_searches').select('id, name, filters, enabled, created_at').eq('user_id', user.id).order('created_at', { ascending: false }),
    searchParams,
  ])
  const migrationMissing = error && ['42P01', '42703', 'PGRST204', 'PGRST205'].includes(error.code)

  return (
    <main className="site-container min-h-[72vh] py-10 sm:py-14" id="main-content">
      <Link className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-brand" href="/dashboard"><ArrowLeft aria-hidden size={16} />Към профила</Link>
      <p className="eyebrow">Моят профил</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-ink sm:text-4xl">Запазени търсения</h1>
      <p className="mt-2 text-sm text-muted-foreground">Получавай известие, когато се публикува имот по твоите критерии.</p>
      {query.updated === 'ok' ? <p aria-live="polite" className="mt-5 rounded-xl bg-brand/10 p-4 text-sm text-brand">Промяната е запазена.</p> : null}
      {query.updated === 'error' ? <p aria-live="polite" className="mt-5 rounded-xl bg-destructive/10 p-4 text-sm text-destructive">Не успяхме да обновим търсенето. Опитай отново.</p> : null}
      {migrationMissing ? <p role="status" className="mt-6 rounded-2xl border border-brand/20 bg-brand/[0.04] p-5 text-sm leading-6 text-ink">Запазените търсения ще се активират след прилагането на миграцията за MVP функции. Текущите данни и настройки не са променени.</p> : null}
      {error && !migrationMissing ? <p role="alert" className="mt-6 rounded-xl bg-destructive/10 p-4 text-sm text-destructive">Не успяхме да заредим запазените търсения.</p> : null}
      {!error && savedSearches?.length ? <ul className="mt-7 flex flex-col gap-3">{savedSearches.map((savedSearch) => {
        const parsed = parseSavedSearchFilters(savedSearch.filters)
        const href = parsed.success ? savedSearchHref(parsed.data) : '/imoti'
        return <li className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-white p-5" key={savedSearch.id}>
          <div className="min-w-0"><h2 className="flex items-center gap-2 font-semibold text-ink"><BellRing aria-hidden size={17} />{savedSearch.name}</h2><p className="mt-1 text-xs text-muted-foreground">{savedSearch.enabled ? 'Известията са включени' : 'Известията са изключени'} · създадено {new Intl.DateTimeFormat('bg-BG', { dateStyle: 'medium' }).format(new Date(savedSearch.created_at))}</p></div>
          <div className="flex flex-wrap gap-2"><Link className="btn-secondary min-h-9 px-3 text-xs" href={href}>Отвори</Link><form action={toggleSavedSearch}><input name="id" type="hidden" value={savedSearch.id} /><input name="enabled" type="hidden" value={String(!savedSearch.enabled)} /><Button size="sm" type="submit" variant="outline">{savedSearch.enabled ? 'Изключи' : 'Включи'}</Button></form><form action={deleteSavedSearch}><input name="id" type="hidden" value={savedSearch.id} /><Button aria-label={`Изтрий търсенето ${savedSearch.name}`} size="sm" type="submit" variant="outline"><Trash2 data-icon="inline-start" />Изтрий</Button></form></div>
        </li>
      })}</ul> : !error ? <div className="mt-7"><EmptyState description="Избери град, тип или бюджет в търсенето и запази филтрите, за да получаваш известия." title="Нямаш запазени търсения" /></div> : null}
    </main>
  )
}
