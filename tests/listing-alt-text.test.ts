import { describe, expect, it } from 'vitest'
import {
  LISTING_ALT_INVISIBLE_CODEPOINTS,
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
  it('rejects every code point in the shared invisible list, including U+2007, U+202F, U+3000, and U+2028', () => {
    expect(LISTING_ALT_INVISIBLE_CODEPOINTS).toHaveLength(43)
    expect(LISTING_ALT_INVISIBLE_CODEPOINTS).toEqual(expect.arrayContaining([
      0x0009, 0x000a, 0x000b, 0x000c, 0x000d, 0x0020,
      0x0085, 0x00a0, 0x00ad, 0x115f, 0x1160, 0x1680, 0x180e,
      0x2000, 0x2007, 0x200b, 0x200f, 0x2028, 0x2029, 0x202f, 0x205f,
      0x2060, 0x2064, 0x2800, 0x3000, 0x3164, 0xfeff, 0xffa0,
    ]))
    for (const codePoint of LISTING_ALT_INVISIBLE_CODEPOINTS) {
      expect(listingAltTextHasVisibleContent(String.fromCodePoint(codePoint)), `U+${codePoint.toString(16).toUpperCase()}`).toBe(false)
    }
    expect(listingAltTextHasVisibleContent(LISTING_ALT_INVISIBLE_CODEPOINTS.map((codePoint) => String.fromCodePoint(codePoint)).join(''))).toBe(false)
    expect(listingAltTextHasVisibleContent('\u2007')).toBe(false)
    expect(listingAltTextHasVisibleContent('\u202F')).toBe(false)
    expect(listingAltTextHasVisibleContent('\u3000')).toBe(false)
    expect(listingAltTextHasVisibleContent('\u2028')).toBe(false)
  })

  it('accepts real text even when surrounded by invisible characters', () => {
    expect(listingAltTextHasVisibleContent('\u200BКухня\u00A0')).toBe(true)
    expect(listingAltTextHasVisibleContent('\u2007Кухня\u202F')).toBe(true)
    expect(listingAltTextHasVisibleContent('\u3000Кухня\u2028')).toBe(true)
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

  it('treats the shared invisible list as invisible in duplicate keys and missing-alt checks', () => {
    expect(canonicalizeListingAltText('Ку\u200Bхня\uFEFF')).toBe('Кухня')
    expect(canonicalizeListingAltText('\u2007Кухня\u202F')).toBe('Кухня')
    expect(canonicalizeListingAltText('\u3000Кухня\u2028')).toBe('Кухня')
    expect(listingAltTextDuplicateKey('Ку\u200Bхня')).toBe(listingAltTextDuplicateKey('Кухня'))
    expect(listingAltTextDuplicateKey('\u2007Кухня')).toBe(listingAltTextDuplicateKey('Кухня'))
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
