import { describe, expect, it } from 'vitest'
import { describeSavedSearch, hasSavedSearchCriteria, parseSavedSearchFilters, savedSearchHref } from '../lib/saved-searches'

describe('saved search validation', () => {
  it('accepts valid supported filters', () => {
    const parsed = parseSavedSearchFilters({ city: 'София', propertyType: 'apartment', minPrice: 100000, maxPrice: 250000, sort: 'price_asc' })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.city).toBe('София')
  })

  it('rejects invalid numeric bounds and unsupported keys', () => {
    expect(parseSavedSearchFilters({ minPrice: 400000, maxPrice: 100000 }).success).toBe(false)
    expect(parseSavedSearchFilters({ city: 'София', rawQuery: 'anything' }).success).toBe(false)
    expect(parseSavedSearchFilters({ bedrooms: 2.5 }).success).toBe(false)
  })

  it('requires at least one non-sort criterion and produces a readable label', () => {
    expect(hasSavedSearchCriteria({ sort: 'newest' })).toBe(false)
    expect(hasSavedSearchCriteria({ city: 'София', sort: 'newest' })).toBe(true)
    expect(describeSavedSearch({ city: 'София', transactionType: 'rent' })).toBe('София · наем')
    expect(savedSearchHref({ city: 'София', propertyType: 'apartment', sort: 'price_asc' })).toBe('/imoti?city=%D0%A1%D0%BE%D1%84%D0%B8%D1%8F&property_type=apartment&sort=price_asc')
  })
})
