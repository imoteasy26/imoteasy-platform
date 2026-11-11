import { describe, expect, it } from 'vitest'
import { approximateCoordinate, approximateListingCoordinates } from '../lib/geo'

describe('approximateCoordinate', () => {
  it('rounds map coordinates to roughly neighborhood precision', () => {
    expect(approximateCoordinate(42.6977123)).toBe(42.698)
    expect(approximateCoordinate(23.3218674)).toBe(23.322)
  })

  it('rejects non-finite and out-of-range values', () => {
    expect(approximateCoordinate(Number.NaN)).toBeNull()
    expect(approximateCoordinate(Number.POSITIVE_INFINITY)).toBeNull()
    expect(approximateCoordinate(181)).toBeNull()
    expect(approximateCoordinate(91, 90)).toBeNull()
    expect(approximateCoordinate(null)).toBeNull()
  })

  it('returns a new listing with only approximate public coordinates', () => {
    const listing = { id: 'listing-1', latitude: 42.6977123, longitude: 23.3218674 }
    expect(approximateListingCoordinates(listing)).toEqual({ id: 'listing-1', latitude: 42.698, longitude: 23.322 })
    expect(listing.latitude).toBe(42.6977123)
  })
})
