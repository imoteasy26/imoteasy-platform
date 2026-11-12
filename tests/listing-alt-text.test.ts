import { describe, expect, it } from 'vitest'
import {
  LISTING_ALT_TEXT_MAX_LENGTH,
  listingAltTextDuplicateKey,
  listingAltTextIsRequired,
  listingImageAltAttribute,
  normalizeListingAltText,
  reviewListingImagesForPublication,
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
  it('is required for pending_review and published non-decorative images', () => {
    expect(listingAltTextIsRequired('published')).toBe(true)
    expect(listingAltTextIsRequired('pending_review')).toBe(true)
    expect(listingAltTextIsRequired('draft')).toBe(false)
    expect(listingAltTextIsRequired('rejected')).toBe(false)
    expect(listingAltTextIsRequired('published', true)).toBe(false)
    expect(listingAltTextIsRequired('pending_review', true)).toBe(false)
  })
})

describe('listingImageAltAttribute', () => {
  it('returns the image alt text and never falls back to a title', () => {
    expect(listingImageAltAttribute({ alt_text: '  Кухня  ', is_decorative: false })).toBe('Кухня')
    expect(listingImageAltAttribute({ alt_text: '', is_decorative: false })).toBe('')
  })

  it('returns an explicit empty string for decorative or missing images, never undefined', () => {
    const decorative = listingImageAltAttribute({ alt_text: 'Кухня', is_decorative: true })
    const emptyDecorative = listingImageAltAttribute({ alt_text: '', is_decorative: true })
    const missing = listingImageAltAttribute(undefined)
    const nullable = listingImageAltAttribute(null)
    const missingText = listingImageAltAttribute({ alt_text: null, is_decorative: false })

    for (const alt of [decorative, emptyDecorative, missing, nullable, missingText]) {
      expect(alt).toBe('')
      expect(alt).not.toBeUndefined()
      expect(typeof alt).toBe('string')
    }
  })
})

describe('reviewListingImagesForPublication', () => {
  it('reports non-decorative images with empty or whitespace alt text', () => {
    const review = reviewListingImagesForPublication([
      { id: 'a', alt_text: 'Дневна', is_decorative: false },
      { id: 'b', alt_text: '   ', is_decorative: false },
      { id: 'c', alt_text: '', is_decorative: true },
    ])
    expect(review.missingAltImageIds).toEqual(['b'])
    expect(review.duplicateAltTexts).toEqual([])
  })

  it('flags identical canonical alt text reused within one listing', () => {
    const review = reviewListingImagesForPublication([
      { id: 'a', alt_text: '  Дневна  с тераса ', is_decorative: false },
      { id: 'b', alt_text: 'Дневна с тераса', is_decorative: false },
      { id: 'c', alt_text: 'Кухня', is_decorative: false },
    ])
    expect(review.missingAltImageIds).toEqual([])
    expect(review.duplicateAltTexts).toEqual(['Дневна с тераса'])
  })

  it('treats Cyrillic alts that differ only by case or surrounding space as duplicates', () => {
    expect(listingAltTextDuplicateKey('Кухня')).toBe('кухня')
    expect(listingAltTextDuplicateKey('кухня ')).toBe('кухня')
    expect(listingAltTextDuplicateKey('  КУХНЯ')).toBe(listingAltTextDuplicateKey('Кухня'))

    const review = reviewListingImagesForPublication([
      { id: 'a', alt_text: 'Кухня', is_decorative: false },
      { id: 'b', alt_text: 'кухня ', is_decorative: false },
      { id: 'c', alt_text: 'Дневна', is_decorative: false },
    ])
    expect(review.missingAltImageIds).toEqual([])
    expect(review.duplicateAltTexts).toEqual(['Кухня'])
  })

  it('does not treat empty decorative alts as duplicates', () => {
    const review = reviewListingImagesForPublication([
      { id: 'a', alt_text: '', is_decorative: true },
      { id: 'b', alt_text: '   ', is_decorative: true },
    ])
    expect(review.missingAltImageIds).toEqual([])
    expect(review.duplicateAltTexts).toEqual([])
  })
})
