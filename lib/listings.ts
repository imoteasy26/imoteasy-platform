import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { approximateListingCoordinates } from '@/lib/geo'
import { withSignedImageUrls } from '@/lib/listing-images'
import type { ListingFilters, ListingWithImages, PublicListing } from '@/lib/listing-types'

const publicListingColumns = 'id, owner_id, title, slug, description, property_type, transaction_type, city, neighborhood, price_eur, area_sqm, rooms, bedrooms, floor, total_floors, construction_type, condition, furnishing, latitude, longitude, status, created_at, updated_at, published_at'
const pageSize = 12
const maximumSearchPage = 100

async function attachImages(listings: PublicListing[]) {
  if (listings.length === 0) return [] as ListingWithImages[]
  const supabase = await createClient()
  const { data } = await supabase
    .from('listing_images')
    .select('id, listing_id, storage_path, alt_text, position, is_cover, created_at')
    .in('listing_id', listings.map((listing) => listing.id))
    .order('position', { ascending: true })

  const signedImages = await withSignedImageUrls(supabase, data ?? [])
  const imagesByListing = new Map<string, typeof signedImages>()
  for (const image of signedImages) {
    const current = imagesByListing.get(image.listing_id) ?? []
    current.push(image)
    imagesByListing.set(image.listing_id, current)
  }

  return listings.map((listing) => ({
    ...approximateListingCoordinates(listing),
    images: imagesByListing.get(listing.id) ?? [],
  }))
}

export async function getRecentListings(limit = 3): Promise<ListingWithImages[]> {
  const supabase = await createClient()
  const safeLimit = Number.isFinite(limit) ? Math.min(12, Math.max(1, Math.floor(limit))) : 3
  const { data, error } = await supabase
    .from('listings')
    .select(publicListingColumns)
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(safeLimit)

  if (error || !data) return []
  return attachImages(data)
}

export async function searchListings(filters: ListingFilters, page = 1) {
  const supabase = await createClient()
  const safePage = Number.isFinite(page) ? Math.min(maximumSearchPage, Math.max(1, Math.floor(page))) : 1
  let query = supabase.from('listings').select(publicListingColumns, { count: 'exact' }).eq('status', 'published')

  if (filters.city) query = query.ilike('city', `%${filters.city}%`)
  if (filters.neighborhood) query = query.ilike('neighborhood', `%${filters.neighborhood}%`)
  if (filters.propertyType) query = query.eq('property_type', filters.propertyType)
  if (filters.transactionType) query = query.eq('transaction_type', filters.transactionType)
  if (filters.minPrice !== undefined) query = query.gte('price_eur', filters.minPrice)
  if (filters.maxPrice !== undefined) query = query.lte('price_eur', filters.maxPrice)
  if (filters.minArea !== undefined) query = query.gte('area_sqm', filters.minArea)
  if (filters.maxArea !== undefined) query = query.lte('area_sqm', filters.maxArea)
  if (filters.rooms !== undefined) query = query.eq('rooms', filters.rooms)
  if (filters.bedrooms !== undefined) query = query.eq('bedrooms', filters.bedrooms)
  if (filters.floor !== undefined) query = query.eq('floor', filters.floor)
  if (filters.condition) query = query.ilike('condition', `%${filters.condition}%`)
  if (filters.furnishing) query = query.ilike('furnishing', `%${filters.furnishing}%`)
  if (filters.constructionType) query = query.ilike('construction_type', `%${filters.constructionType}%`)

  if (filters.sort === 'price_asc') query = query.order('price_eur', { ascending: true })
  else if (filters.sort === 'price_desc') query = query.order('price_eur', { ascending: false })
  else query = query.order('published_at', { ascending: false })
  query = query.order('id', { ascending: false })

  const start = (safePage - 1) * pageSize
  const { data, error, count } = await query.range(start, start + pageSize - 1)
  if (error || !data) return { listings: [] as ListingWithImages[], total: 0, error: true, pageSize }

  const listings = await attachImages(data)
  return {
    listings,
    total: count ?? 0,
    hasNextPage: (count ?? 0) > safePage * pageSize,
    error: false,
    pageSize,
  }
}

export async function getListingBySlug(slug: string) {
  const supabase = await createClient()
  const { data, error } = await supabase.from('listings')
    .select(publicListingColumns)
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle()
  if (error || !data) return null

  const [{ data: images }, { data: seller }, { data: priceHistory, error: priceHistoryError }] = await Promise.all([
    supabase.from('listing_images').select('id, listing_id, storage_path, alt_text, position, is_cover, created_at').eq('listing_id', data.id).order('position'),
    supabase.from('profiles').select('id, display_name, avatar_path, account_type, created_at').eq('id', data.owner_id).maybeSingle(),
    supabase.from('listing_price_history').select('id, listing_id, previous_price, new_price, changed_at').eq('listing_id', data.id).order('changed_at', { ascending: false }).limit(20),
  ])

  return {
    ...approximateListingCoordinates(data),
    images: await withSignedImageUrls(supabase, images ?? []),
    seller,
    priceHistory: priceHistory ?? [],
    priceHistoryAvailable: !priceHistoryError,
  }
}
