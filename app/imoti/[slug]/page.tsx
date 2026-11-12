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
  const description = `${listing.title} — ${formatPrice(listing.price_eur)} в ${listing.city}. Разгледай подробностите в Imoteasy.`
  return {
    title: listing.title,
    description,
    alternates: { canonical: `/imoti/${listing.slug}` },
    openGraph: { title: listing.title, description, type: 'article' },
  }
}

export default async function ListingPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ contact?: string; report?: string; utm_source?: string | string[]; utm_medium?: string | string[]; utm_campaign?: string | string[]; utm_content?: string | string[]; utm_term?: string | string[]; referral_code?: string | string[] }> }) {
  const [{ slug }, query] = await Promise.all([params, searchParams])
  const listing = await getListingBySlug(slug)
  if (!listing) notFound()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const first = (value?: string | string[]) => Array.isArray(value) ? value[0] : value
  const attribution = {
    utm_source: first(query.utm_source),
    utm_medium: first(query.utm_medium),
    utm_campaign: first(query.utm_campaign),
    utm_content: first(query.utm_content),
    utm_term: first(query.utm_term),
    referral_code: first(query.referral_code),
  }
  return <ListingDetail listing={listing} signedIn={Boolean(user)} contactState={query.contact} reportState={query.report} attribution={attribution} />
}
