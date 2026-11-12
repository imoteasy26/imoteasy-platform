import type { Listing, ListingImage } from './supabase/database.types'

export type ListingFilters = {
  city?: string
  neighborhood?: string
  propertyType?: Listing['property_type']
  transactionType?: Listing['transaction_type']
  minPrice?: number
  maxPrice?: number
  minArea?: number
  maxArea?: number
  rooms?: number
  bedrooms?: number
  floor?: number
  condition?: string
  furnishing?: string
  constructionType?: string
  sort?: 'newest' | 'price_asc' | 'price_desc'
}

export type PublicListing = Omit<Listing, 'organization_id'>
export type ListingImageWithUrl = ListingImage & { signed_url: string }
export type ListingWithImages = PublicListing & { images: ListingImageWithUrl[] }
