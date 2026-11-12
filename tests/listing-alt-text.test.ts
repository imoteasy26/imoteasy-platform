import { describe, expect, it } from 'vitest'
import {
  LISTING_ALT_TEXT_MAX_LENGTH,
  SUBMIT_LISTING_ALT_REQUIRED_MESSAGE,
  SUBMIT_LISTING_MISSING_IMAGES_MESSAGE,
  WIZARD_LISTING_ALT_REQUIRED_MESSAGE,
  canonicalizeListingAltText,
  listingAltTextDuplicateKey,
  listingAltTextHasVisibleContent,
  listingAltTextIsRequired,
  listingImageAltAttribute,
  listingPublicationImageBlock,
  listingPublicationImageBlockMessage,
  normalizeListingAltText,
  parseListingImageRegistrations,
  reviewListingImagesForPublication,
  wizardPhotosNeedAltMessage,
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

  it('strips zero-width and BOM characters and treats NBSP as space', () => {
    expect(normalizeListingAltText('\u200BКухня\uFEFF')).toEqual({ ok: true, value: 'Кухня' })
    expect(normalizeListingAltText('\u00A0Кухня\u00A0')).toEqual({ ok: true, value: 'Кухня' })
    expect(normalizeListingAltText('\u200B\uFEFF\u00A0')).toEqual({ ok: true, value: '' })
  })
})

describe('listingAltTextHasVisibleContent', () => {
  it('rejects TAB, newline, NBSP, ZWSP, and BOM as the only content', () => {
    expect(listingAltTextHasVisibleContent('\t')).toBe(false)
    expect(listingAltTextHasVisibleContent('\n')).toBe(false)
    expect(listingAltTextHasVisibleContent('\u00A0')).toBe(false)
    expect(listingAltTextHasVisibleContent('\u200B')).toBe(false)
    expect(listingAltTextHasVisibleContent('\uFEFF')).toBe(false)
    expect(listingAltTextHasVisibleContent('\t\n\u00A0\u200B\uFEFF')).toBe(false)
  })

  it('accepts real text even when surrounded by invisible characters', () => {
    expect(listingAltTextHasVisibleContent('\u200BКухня\u00A0')).toBe(true)
    expect(listingAltTextHasVisibleContent('Дневна')).toBe(true)
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

  it('treats ZWSP and BOM as invisible in duplicate keys and missing-alt checks', () => {
    expect(canonicalizeListingAltText('Ку\u200Bхня\uFEFF')).toBe('Кухня')
    expect(listingAltTextDuplicateKey('Ку\u200Bхня')).toBe(listingAltTextDuplicateKey('Кухня'))
    const review = reviewListingImagesForPublication([
      { id: 'a', alt_text: '\u200B', is_decorative: false },
      { id: 'b', alt_text: 'Кухня', is_decorative: false },
      { id: 'c', alt_text: 'Ку\u200Bхня', is_decorative: false },
    ])
    expect(review.missingAltImageIds).toEqual(['a'])
    expect(review.duplicateAltTexts).toEqual(['Кухня'])
  })

  it('uses NFC so precomposed and decomposed characters share a duplicate key', () => {
    const precomposed = 'Café'
    const decomposed = 'Cafe\u0301'
    expect(precomposed.normalize('NFC')).not.toBe(decomposed)
    expect(listingAltTextDuplicateKey(precomposed)).toBe(listingAltTextDuplicateKey(decomposed))
    expect(listingAltTextDuplicateKey('й')).toBe(listingAltTextDuplicateKey('и\u0306'))

    const review = reviewListingImagesForPublication([
      { id: 'a', alt_text: precomposed, is_decorative: false },
      { id: 'b', alt_text: decomposed, is_decorative: false },
    ])
    expect(review.missingAltImageIds).toEqual([])
    expect(review.duplicateAltTexts).toEqual([precomposed])
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

describe('register images then submit for review', () => {
  const pathA = 'owner/listing/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'
  const pathB = 'owner/listing/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg'

  it('accepts registrations with alt or decorative and allows submitListingForReview', () => {
    const parsed = parseListingImageRegistrations([
      { storage_path: pathA, alt_text: '  Кухня  ', is_decorative: false },
      { storage_path: pathB, alt_text: '', is_decorative: true },
    ])
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.items).toEqual([
      { storage_path: pathA, alt_text: 'Кухня', is_decorative: false },
      { storage_path: pathB, alt_text: '', is_decorative: true },
    ])
    const registered = parsed.items.map((item, index) => ({
      id: String(index),
      alt_text: item.alt_text,
      is_decorative: item.is_decorative,
    }))
    expect(listingPublicationImageBlock(registered, { requireImages: true })).toBeNull()
    expect(listingPublicationImageBlockMessage(registered, { requireImages: true })).toBeNull()
  })

  it('returns a clean error when a registered image is missing alt text', () => {
    const parsed = parseListingImageRegistrations([
      { storage_path: pathA, alt_text: '\u200B', is_decorative: false },
    ])
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const registered = parsed.items.map((item, index) => ({
      id: String(index),
      alt_text: item.alt_text,
      is_decorative: item.is_decorative,
    }))
    expect(listingPublicationImageBlock(registered, { requireImages: true })).toBe('alt_required')
    expect(listingPublicationImageBlockMessage(registered, { requireImages: true })).toBe(SUBMIT_LISTING_ALT_REQUIRED_MESSAGE)
  })

  it('still accepts a path-only payload used by the draft image manager', () => {
    const parsed = parseListingImageRegistrations([pathA])
    expect(parsed).toEqual({ ok: true, items: [{ storage_path: pathA, alt_text: '', is_decorative: false }] })
    const registered = parsed.ok
      ? parsed.items.map((item, index) => ({ id: String(index), alt_text: item.alt_text, is_decorative: item.is_decorative }))
      : []
    expect(listingPublicationImageBlock(registered, { requireImages: true })).toBe('alt_required')
  })
})

describe('server-side publication blocks', () => {
  it('submitListingForReview blocks missing images and missing alt with the same messages', () => {
    expect(listingPublicationImageBlockMessage(null, { requireImages: true })).toBe(SUBMIT_LISTING_MISSING_IMAGES_MESSAGE)
    expect(listingPublicationImageBlockMessage([], { requireImages: true })).toBe(SUBMIT_LISTING_MISSING_IMAGES_MESSAGE)
    expect(listingPublicationImageBlockMessage(
      [{ id: 'a', alt_text: '', is_decorative: false }],
      { requireImages: true },
    )).toBe(SUBMIT_LISTING_ALT_REQUIRED_MESSAGE)
  })

  it('moderateListing blocks only missing alt, not an empty image list', () => {
    expect(listingPublicationImageBlock([], { requireImages: false })).toBeNull()
    expect(listingPublicationImageBlock(
      [{ id: 'a', alt_text: '\t\u00A0', is_decorative: false }],
      { requireImages: false },
    )).toBe('alt_required')
    expect(listingPublicationImageBlock(
      [{ id: 'a', alt_text: 'Кухня', is_decorative: false }],
      { requireImages: false },
    )).toBeNull()
  })

  it('blocks the publish wizard until every non-decorative photo has visible alt text', () => {
    expect(wizardPhotosNeedAltMessage([
      { altText: '', isDecorative: false },
    ])).toBe(WIZARD_LISTING_ALT_REQUIRED_MESSAGE)
    expect(wizardPhotosNeedAltMessage([
      { altText: 'Кухня', isDecorative: false },
      { altText: '', isDecorative: true },
    ])).toBeNull()
  })
})
