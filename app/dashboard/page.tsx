import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowUpRight, Heart, MessageSquareText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/empty-state'
import { SignOutButton } from '@/features/auth/sign-out-button'
import { ListingCard } from '@/features/listings/listing-card'
import { DashboardListingRow } from '@/features/dashboard/dashboard-listing-row'
import { createClient } from '@/lib/supabase/server'
import { updateInquiryStatus } from './actions'
import type { Tables } from '@/lib/supabase/database.types'

const inquiryStatusLabels = { new: 'Ново', read: 'Прочетено', replied: 'Отговорено', archived: 'Архивирано' } as const
const nextInquiryStatus = { new: 'read', read: 'replied', replied: 'archived', archived: 'new' } as const
const nextInquiryActionLabels = { new: 'Отбележи като прочетено', read: 'Отбележи като отговорено', replied: 'Архивирай', archived: 'Върни в нови' } as const

export const metadata: Metadata = { title: 'Моят профил', robots: { index: false, follow: false } }

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ submitted?: string; updated?: string; deleted?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/sign-in?next=%2Fdashboard')
  const query = await searchParams
  const [{ data: profile }, { data: listings }, { data: favoriteRows }] = await Promise.all([
    supabase.from('profiles').select('display_name, account_type').eq('id', user.id).maybeSingle(),
    supabase.from('listings').select('*').eq('owner_id', user.id).order('updated_at', { ascending: false }),
    supabase.from('favorites').select('listing_id').eq('user_id', user.id),
  ])
  const userListings = listings ?? []
  const ownListingIds = userListings.map((listing) => listing.id)
  const favoriteIds = (favoriteRows ?? []).map((favorite) => favorite.listing_id)
  const { data: inquiries } = ownListingIds.length
    ? await supabase.from('inquiries').select('*').in('listing_id', ownListingIds).neq('sender_id', user.id).order('created_at', { ascending: false }).limit(20)
    : { data: [] as Tables<'inquiries'>[] }
  const { data: favoriteListings } = favoriteIds.length
    ? await supabase.from('listings').select('*').in('id', favoriteIds).eq('status', 'published')
    : { data: [] as Tables<'listings'>[] }
  const pendingCount = userListings.filter((listing) => listing.status === 'pending_review').length
  const liveCount = userListings.filter((listing) => listing.status === 'published').length
  const received = inquiries ?? []
  const listingTitles = new Map(userListings.map((listing) => [listing.id, listing.title]))

  return (
    <main className="site-container min-h-[72vh] py-10 sm:py-14" id="main-content">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="eyebrow">Моят профил</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-ink sm:text-4xl">Здравей, {profile?.display_name || user.email?.split('@')[0] || 'приятелю'}.</h1><p className="mt-2 text-sm text-muted-foreground">Управлявай обявите, запазените имоти и запитванията си.</p></div><div className="flex gap-2"><Link className="btn-primary" href="/publish">Нова обява</Link><SignOutButton /></div></div>
      {query.submitted ? <p aria-live="polite" className="mt-6 rounded-xl bg-brand/10 p-4 text-sm text-brand">Обявата е изпратена за преглед. Ще получиш обновление в профила си.</p> : null}
      {query.deleted ? <p aria-live="polite" className="mt-6 rounded-xl bg-brand/10 p-4 text-sm text-brand">Черновата е изтрита окончателно.</p> : null}
      {query.updated === 'ok' ? <p aria-live="polite" className="mt-6 rounded-xl bg-brand/10 p-4 text-sm text-brand">Промените са запазени.</p> : null}
      {query.updated === 'error' ? <p aria-live="polite" className="mt-6 rounded-xl bg-destructive/10 p-4 text-sm text-destructive">Не успяхме да запазим промените. Провери данните и опитай отново.</p> : null}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-2xl border border-line bg-white p-5"><p className="text-sm text-muted-foreground">Общо обяви</p><p className="mt-2 text-3xl font-semibold text-ink">{userListings.length}</p></div><div className="rounded-2xl border border-line bg-white p-5"><p className="text-sm text-muted-foreground">Публикувани</p><p className="mt-2 text-3xl font-semibold text-brand">{liveCount}</p></div><div className="rounded-2xl border border-line bg-white p-5"><p className="text-sm text-muted-foreground">За преглед</p><p className="mt-2 text-3xl font-semibold text-ink">{pendingCount}</p></div><div className="rounded-2xl border border-line bg-white p-5"><p className="text-sm text-muted-foreground">Запитвания</p><p className="mt-2 text-3xl font-semibold text-ink">{received.length}</p></div></div>
      {profile?.account_type === 'admin' ? <div className="mt-5 rounded-2xl border border-brand/20 bg-brand/[0.04] p-4"><Link className="inline-flex items-center gap-2 font-semibold text-brand" href="/admin">Отвори административния панел<ArrowUpRight aria-hidden size={16} /></Link></div> : null}
      <section className="mt-12" aria-labelledby="my-listings-heading"><div className="mb-5 flex items-center justify-between gap-4"><div><h2 className="text-2xl font-semibold tracking-tight text-ink" id="my-listings-heading">Моите обяви</h2><p className="mt-1 text-sm text-muted-foreground">Редактирай детайлите и снимките или архивирай обява по всяко време.</p></div></div>{userListings.length ? <div className="flex flex-col gap-3">{userListings.map((listing) => <DashboardListingRow key={listing.id} listing={listing} />)}</div> : <EmptyState description="Публикувай първия си имот и ще го виждаш тук, заедно със статуса на прегледа." title="Все още нямаш обяви" />}</section>
      <section className="mt-12" aria-labelledby="inquiries-heading"><h2 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-ink" id="inquiries-heading"><MessageSquareText aria-hidden size={20} />Последни запитвания</h2><div className="mt-4 flex flex-col gap-3">{received.length ? received.map((inquiry) => { const listingTitle = listingTitles.get(inquiry.listing_id) || 'обява'; const nextStatus = nextInquiryStatus[inquiry.status]; return <article className="rounded-2xl border border-line bg-white p-5" key={inquiry.id}><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-ink">{inquiry.name} за „{listingTitle}“</h3><Badge variant={inquiry.status === 'new' ? 'default' : 'secondary'}>{inquiryStatusLabels[inquiry.status]}</Badge></div><time className="text-xs text-muted-foreground" dateTime={inquiry.created_at}>{new Intl.DateTimeFormat('bg-BG', { dateStyle: 'medium' }).format(new Date(inquiry.created_at))}</time></div><p className="mt-1 text-sm text-muted-foreground">{inquiry.email}{inquiry.phone ? ` · ${inquiry.phone}` : ''}</p><p className="mt-3 whitespace-pre-line text-sm leading-6 text-ink/80">{inquiry.message}</p><div className="mt-4 flex flex-wrap gap-2"><a className="btn-secondary min-h-9 px-3 text-xs" href={`mailto:${encodeURIComponent(inquiry.email)}?subject=${encodeURIComponent(`Запитване за ${listingTitle}`)}`}>Отговори по имейл</a><form action={updateInquiryStatus}><input name="id" type="hidden" value={inquiry.id} /><Button name="status" size="sm" type="submit" value={nextStatus} variant="outline">{nextInquiryActionLabels[inquiry.status]}</Button></form></div></article>}) : <p className="rounded-2xl border border-dashed border-line p-6 text-sm text-muted-foreground">Запитванията за твоите имоти ще се появят тук.</p>}</div></section>
      <section className="mt-12" aria-labelledby="favorites-heading"><h2 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-ink" id="favorites-heading"><Heart aria-hidden size={20} />Запазени имоти</h2><div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{favoriteListings?.length ? favoriteListings.map((listing) => <ListingCard key={listing.id} listing={{ ...listing, images: [] }} initiallySaved />) : <div className="sm:col-span-2 lg:col-span-3"><p className="rounded-2xl border border-dashed border-line p-6 text-sm text-muted-foreground">Натисни сърцето върху обява, за да я запазиш за по-късно.</p></div>}</div></section>
      <div className="mt-10"><Link className="btn-secondary" href="/account">Настройки на профила</Link></div>
    </main>
  )
}
