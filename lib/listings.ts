import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { Listing, ListingImage } from '@/lib/supabase/database.types'
import type { ListingFilters, ListingWithImages } from '@/lib/listing-types'

async function attachImages(listings: Listing[]) {
  if (listings.length === 0) return [] as ListingWithImages[]
  const supabase = await createClient()
  const { data } = await supabase
    .from('listing_images')
    .select('id, listing_id, storage_path, alt_text, position, is_cover, created_at')
    .in('listing_id', listings.map((listing) => listing.id))
    .order('position', { ascending: true })

  const imagesByListing = new Map<string, ListingImage[]>()
  for (const image of data ?? []) {
    const current = imagesByListing.get(image.listing_id) ?? []
    current.push(image)
    imagesByListing.set(image.listing_id, current)
  }

  return listings.map((listing) => ({ ...listing, images: imagesByListing.get(listing.id) ?? [] }))
}

export async function getRecentListings(limit = 3): Promise<ListingWithImages[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('listings')
    .select('*')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(limit)

  if (error || !data) return []
  return attachImages(data)
}

export async function searchListings(filters: ListingFilters, page = 1) {
  const supabase = await createClient()
  const pageSize = 12
  let query = supabase.from('listings').select('*').eq('status', 'published')

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

  const safePage = Math.max(1, Math.floor(page))
  const { data, error, count } = await query
    .range((safePage - 1) * pageSize, safePage * pageSize)

  if (error || !data) return { listings: [] as ListingWithImages[], total: 0, error: true, pageSize }
  const hasNextPage = data.length > pageSize
  const rows = data.slice(0, pageSize)
  const listings = await attachImages(rows)
  return { listings, total: count ?? (safePage - 1) * pageSize + rows.length, hasNextPage, error: false, pageSize }
}

export async function getListingBySlug(slug: string) {
  const supabase = await createClient()
  const { data, error } = await supabase.from('listings').select('*').eq('slug', slug).eq('status', 'published').maybeSingle()
  if (error || !data) return null

  const [{ data: images }, { data: seller }] = await Promise.all([
    supabase.from('listing_images').select('id, listing_id, storage_path, alt_text, position, is_cover, created_at').eq('listing_id', data.id).order('position'),
    supabase.from('profiles').select('id, display_name, avatar_path, account_type, created_at').eq('id', data.owner_id).maybeSingle(),
  ])

  return { ...data, images: images ?? [], seller }
}
