import { z } from 'zod'
import type { ListingFilters } from '@/lib/listing-types'

export const savedSearchFiltersSchema = z.object({
  city: z.string().trim().min(1).max(100).optional(),
  neighborhood: z.string().trim().min(1).max(100).optional(),
  propertyType: z.enum(['apartment', 'house', 'land', 'office', 'shop', 'warehouse', 'other']).optional(),
  transactionType: z.enum(['sale', 'rent']).optional(),
  minPrice: z.number().finite().min(0).max(1_000_000_000).optional(),
  maxPrice: z.number().finite().min(0).max(1_000_000_000).optional(),
  minArea: z.number().finite().min(0).max(10_000_000).optional(),
  maxArea: z.number().finite().min(0).max(10_000_000).optional(),
  rooms: z.number().int().min(0).max(30).optional(),
  bedrooms: z.number().int().min(0).max(30).optional(),
  floor: z.number().int().min(-5).max(200).optional(),
  condition: z.string().trim().min(1).max(80).optional(),
  furnishing: z.string().trim().min(1).max(80).optional(),
  constructionType: z.string().trim().min(1).max(80).optional(),
  sort: z.enum(['newest', 'price_asc', 'price_desc']).optional(),
}).strict().superRefine((filters, context) => {
  if (filters.minPrice !== undefined && filters.maxPrice !== undefined && filters.minPrice > filters.maxPrice) {
    context.addIssue({ code: 'custom', path: ['maxPrice'], message: 'Maximum price must be greater than minimum price.' })
  }
  if (filters.minArea !== undefined && filters.maxArea !== undefined && filters.minArea > filters.maxArea) {
    context.addIssue({ code: 'custom', path: ['maxArea'], message: 'Maximum area must be greater than minimum area.' })
  }
})

export function parseSavedSearchFilters(value: unknown) {
  return savedSearchFiltersSchema.safeParse(value)
}

export function hasSavedSearchCriteria(filters: ListingFilters): boolean {
  return Object.entries(filters).some(([key, value]) => key !== 'sort' && value !== undefined && value !== '')
}

export function describeSavedSearch(filters: ListingFilters): string {
  const parts = [filters.city, filters.neighborhood].filter(Boolean)
  if (filters.propertyType) parts.push({
    apartment: 'апартамент',
    house: 'къща',
    land: 'парцел',
    office: 'офис',
    shop: 'магазин',
    warehouse: 'склад',
    other: 'имот',
  }[filters.propertyType])
  if (filters.transactionType) parts.push(filters.transactionType === 'sale' ? 'покупка' : 'наем')
  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
    parts.push(`${filters.minPrice ?? 0}–${filters.maxPrice ?? '∞'} €`)
  }
  return (parts.length ? parts.join(' · ') : 'Всички имоти').slice(0, 80)
}

export function savedSearchHref(filters: ListingFilters): string {
  const params = new URLSearchParams()
  const queryKeys: Record<string, string> = {
    propertyType: 'property_type',
    transactionType: 'transaction_type',
    minPrice: 'min_price',
    maxPrice: 'max_price',
    minArea: 'min_area',
    maxArea: 'max_area',
    constructionType: 'construction_type',
  }
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') params.set(queryKeys[key] ?? key, String(value))
  }
  const query = params.toString()
  return query ? `/imoti?${query}` : '/imoti'
}
