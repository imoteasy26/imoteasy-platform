import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Check, ExternalLink, ShieldCheck, TriangleAlert, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/empty-state'
import { createClient } from '@/lib/supabase/server'
import { formatPrice } from '@/lib/format'
import { propertyTypeLabels, transactionLabels } from '@/lib/format'
import { moderateListing, reviewReport } from './actions'

export const metadata: Metadata = { title: 'Модерация', robots: { index: false, follow: false } }

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ updated?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/sign-in?next=%2Fadmin')
  const { data: profile } = await supabase.from('profiles').select('account_type').eq('id', user.id).maybeSingle()
  if (profile?.account_type !== 'admin') redirect('/dashboard')
  const [{ data: listings }, { data: reports }, query] = await Promise.all([
    supabase.from('listings').select('*').eq('status', 'pending_review').order('created_at', { ascending: true }),
    supabase.from('listing_reports').select('*').eq('status', 'new').order('created_at', { ascending: true }),
    searchParams,
  ])
  const listingRows = listings ?? []
  const ids = listingRows.map((listing) => listing.id)
  const [{ data: images }, { data: privateDetails }] = ids.length ? await Promise.all([
    supabase.from('listing_images').select('listing_id, storage_path, is_cover, alt_text').in('listing_id', ids),
    supabase.from('private_listing_details').select('listing_id, exact_address').in('listing_id', ids),
  ]) : [{ data: [] }, { data: [] }]
  const imageByListing = new Map((images ?? []).map((image) => [image.listing_id, image]))
  const addressByListing = new Map((privateDetails ?? []).map((item) => [item.listing_id, item.exact_address]))

  return (
    <main className="site-container min-h-[72vh] py-10 sm:py-14" id="main-content">
      <div className="flex items-start gap-4"><div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand/10 text-brand"><ShieldCheck aria-hidden size={22} /></div><div><p className="eyebrow">Администрация</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Преглед и модерация</h1><p className="mt-2 text-sm text-muted-foreground">Публикувай само обяви с точни данни и безопасно съдържание.</p></div></div>
      {query.updated ? <p aria-live="polite" className="mt-6 rounded-xl bg-subtle p-4 text-sm">{query.updated === 'ok' ? 'Промените са запазени.' : 'Не успяхме да запазим промените.'}</p> : null}
      <section aria-labelledby="review-listings" className="mt-10"><div className="mb-5 flex items-center justify-between"><h2 className="text-2xl font-semibold text-ink" id="review-listings">За одобрение</h2><Badge variant="secondary">{listingRows.length}</Badge></div>{listingRows.length ? <div className="flex flex-col gap-4">{listingRows.map((listing) => <article className="rounded-2xl border border-line bg-white p-5 sm:p-6" key={listing.id}><div className="grid gap-5 sm:grid-cols-[180px_minmax(0,1fr)]"><div className="relative aspect-[1.3] overflow-hidden rounded-xl bg-subtle">{imageByListing.get(listing.id) && process.env.NEXT_PUBLIC_SUPABASE_URL ? <Image alt={imageByListing.get(listing.id)?.alt_text || listing.title} className="object-cover" fill sizes="180px" src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/imoteasy-listings/${imageByListing.get(listing.id)?.storage_path}`} /> : <div className="grid size-full place-items-center text-xs text-muted-foreground">Без снимка</div>}</div><div><div className="flex flex-wrap items-start justify-between gap-3"><div><Badge variant="outline">В очакване</Badge><h3 className="mt-2 text-xl font-semibold text-ink">{listing.title}</h3><p className="mt-1 text-sm text-muted-foreground">{listing.city}{listing.neighborhood ? ` · ${listing.neighborhood}` : ''} · {transactionLabels[listing.transaction_type]} · {propertyTypeLabels[listing.property_type]}</p></div><p className="font-semibold text-brand">{formatPrice(listing.price_eur)}</p></div><p className="mt-3 line-clamp-4 whitespace-pre-line text-sm leading-6 text-muted-foreground">{listing.description}</p><div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground"><span>{listing.area_sqm} м²</span>{listing.rooms !== null ? <span>{listing.rooms} стаи</span> : null}{addressByListing.get(listing.id) ? <span>Личен адрес: {addressByListing.get(listing.id)}</span> : null}<Link className="inline-flex items-center gap-1 font-semibold text-brand" href={`/imoti/${listing.slug}`}><ExternalLink aria-hidden size={13} />Преглед</Link></div><div className="mt-5 flex flex-wrap gap-2"><form action={moderateListing}><input name="id" type="hidden" value={listing.id} /><Button name="decision" type="submit" value="approve"><Check data-icon="inline-start" />Одобри и публикувай</Button></form><form action={moderateListing}><input name="id" type="hidden" value={listing.id} /><Button name="decision" type="submit" value="reject" variant="outline"><X data-icon="inline-start" />Отхвърли</Button></form></div></div></div></article>)}</div> : <EmptyState description="Когато някой изпрати нова обява, тя ще се появи тук за преглед." title="Няма чакащи обяви" />}</section>
      <section aria-labelledby="review-reports" className="mt-12"><div className="mb-5 flex items-center gap-2"><TriangleAlert aria-hidden className="text-amber-600" size={20} /><h2 className="text-2xl font-semibold text-ink" id="review-reports">Нови сигнали</h2><Badge variant="secondary">{reports?.length ?? 0}</Badge></div>{reports?.length ? <div className="flex flex-col gap-3">{reports.map((report) => <article className="flex flex-col justify-between gap-4 rounded-2xl border border-line bg-white p-5 sm:flex-row sm:items-center" key={report.id}><div><p className="font-semibold text-ink">{report.reason} <span className="font-normal text-muted-foreground">· Обява </span><code className="text-xs">{report.listing_id.slice(0, 8)}</code></p><p className="mt-1 text-sm text-muted-foreground">{report.details || 'Без допълнителни детайли'}</p></div><div className="flex gap-2"><form action={reviewReport}><input name="id" type="hidden" value={report.id} /><Button name="status" size="sm" type="submit" value="reviewed" variant="outline">Отметни прегледан</Button></form><form action={reviewReport}><input name="id" type="hidden" value={report.id} /><Button name="status" size="sm" type="submit" value="actioned">Обработен</Button></form></div></article>)}</div> : <p className="rounded-2xl border border-dashed border-line p-6 text-sm text-muted-foreground">Няма нови сигнали.</p>}</section>
    </main>
  )
}
