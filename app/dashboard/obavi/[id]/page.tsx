import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ListingEditor } from '@/features/dashboard/listing-editor'
import { listingStatusLabels } from '@/lib/format'
import { withSignedImageUrls } from '@/lib/listing-images'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Редакция на обява', robots: { index: false, follow: false } }

export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/auth/sign-in?next=${encodeURIComponent(`/dashboard/obavi/${id}`)}`)

  const [{ data: listing }, { data: images }, { data: privateDetails, error: privateDetailsError }] = await Promise.all([
    supabase.from('listings').select('*').eq('id', id).maybeSingle(),
    supabase.from('listing_images').select('*').eq('listing_id', id).order('position', { ascending: true }),
    supabase.from('private_listing_details').select('exact_address, exact_latitude, exact_longitude').eq('listing_id', id).maybeSingle(),
  ])
  if (!listing) notFound()
  const signedImages = await withSignedImageUrls(supabase, images ?? [])

  return (
    <main className="site-container min-h-[72vh] py-10 sm:py-14" id="main-content">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <div>
          <Link className="btn-secondary mb-5 inline-flex" href="/dashboard">Назад към профила</Link>
          <p className="eyebrow">Редакция на обява · {listingStatusLabels[listing.status]}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{listing.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">Промените по публикувана обява ще се отразят веднага. Точният адрес остава личен.</p>
        </div>
        {!privateDetailsError ? null : <p className="rounded-xl border border-brand/20 bg-brand/[0.04] p-4 text-sm text-ink">За да редактираш точната локация, първо приложи миграцията за поверителност. Снимките и останалите данни остават достъпни.</p>}
        <ListingEditor coordinateSchemaReady={!privateDetailsError} exactLatitude={privateDetails?.exact_latitude ?? listing.latitude} exactLongitude={privateDetails?.exact_longitude ?? listing.longitude} listing={listing} exactAddress={privateDetails?.exact_address ?? ''} images={signedImages} />
      </div>
    </main>
  )
}
