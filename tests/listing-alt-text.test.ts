import { describe, expect, it } from 'vitest'
import {
  LISTING_ALT_TEXT_MAX_LENGTH,
  listingAltTextIsRequired,
  normalizeListingAltText,
} from '@/lib/listing-alt-text'

describe('normalizeListingAltText', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeListingAltText('  Дневна   с тераса  ')).toEqual({ ok: true, value: 'Дневна с тераса' })
  })

  it('allows an empty value so drafts can be flagged in the UI', () => {
    expect(normalizeListingAltText('   ')).toEqual({ ok: true, value: '' })
  })

  it('rejects values longer than 200 characters', () => {
    const result = normalizeListingAltText('а'.repeat(LISTING_ALT_TEXT_MAX_LENGTH + 1))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain('200')
  })

  it('accepts a value of exactly 200 characters', () => {
    const value = 'б'.repeat(LISTING_ALT_TEXT_MAX_LENGTH)
    expect(normalizeListingAltText(value)).toEqual({ ok: true, value })
  })

  it('rejects non-strings', () => {
    expect(normalizeListingAltText(null).ok).toBe(false)
    expect(normalizeListingAltText(12).ok).toBe(false)
  })
})

describe('listingAltTextIsRequired', () => {
  it('is required only for published listings', () => {
    expect(listingAltTextIsRequired('published')).toBe(true)
    expect(listingAltTextIsRequired('draft')).toBe(false)
    expect(listingAltTextIsRequired('pending_review')).toBe(false)
  })
})
