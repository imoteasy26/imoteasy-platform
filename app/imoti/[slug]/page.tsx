import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getListingBySlug } from '@/lib/listings'
import { formatPrice } from '@/lib/format'
import { ListingDetail } from '@/features/listings/listing-detail'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const listing = await getListingBySlug(slug)
  if (!listing) return { title: 'Обявата не е намерена', robots: { index: false } }
  return { title: listing.title, description: `${listing.title} — ${formatPrice(listing.price_eur)} в ${listing.city}. Разгледай подробностите в Imoteasy.` }
}

export default async function ListingPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ contact?: string; report?: string }> }) {
  const [{ slug }, query] = await Promise.all([params, searchParams])
  const listing = await getListingBySlug(slug)
  if (!listing) notFound()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return <ListingDetail listing={listing} signedIn={Boolean(user)} contactState={query.contact} reportState={query.report} />
}
