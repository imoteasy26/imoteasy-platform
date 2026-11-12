export const LISTING_ALT_TEXT_MAX_LENGTH = 200

export const LISTING_STATUSES_REQUIRING_ALT = ['pending_review', 'published'] as const

/**
 * Invisible and space characters, identical to private.listing_alt_invisible_chars()
 * in the SQL trigger. The list is explicit so it does not depend on JS /\s/ or
 * on a regex locale. Space-like members collapse to a single ASCII space in
 * canonicalizeListingAltText; the rest are stripped.
 */
export const LISTING_ALT_INVISIBLE_CODEPOINTS: readonly number[] = [
  0x0009, 0x000a, 0x000b, 0x000c, 0x000d, 0x0020,
  0x0085, 0x00a0, 0x00ad,
  0x115f, 0x1160, 0x1680, 0x180e,
  0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007,
  0x2008, 0x2009, 0x200a, 0x200b, 0x200c, 0x200d, 0x200e, 0x200f,
  0x2028, 0x2029, 0x202f, 0x205f,
  0x2060, 0x2061, 0x2062, 0x2063, 0x2064,
  0x2800, 0x3000, 0x3164, 0xfeff, 0xffa0,
]

const LISTING_ALT_INVISIBLE = new Set(LISTING_ALT_INVISIBLE_CODEPOINTS)

/** Space-like subset of LISTING_ALT_INVISIBLE_CODEPOINTS; collapsed to one space. */
const LISTING_ALT_SPACE_CODEPOINTS = new Set<number>([
  0x0009, 0x000a, 0x000b, 0x000c, 0x000d, 0x0020,
  0x0085, 0x00a0, 0x1680,
  0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007,
  0x2008, 0x2009, 0x200a,
  0x2028, 0x2029, 0x202f, 0x205f,
  0x2800, 0x3000,
])

export const SUBMIT_LISTING_MISSING_IMAGES_MESSAGE = 'Добави поне една снимка, преди да изпратиш обявата.'
export const SUBMIT_LISTING_ALT_REQUIRED_MESSAGE = 'Добави алтернативен текст към всяка недекоративна снимка, преди да изпратиш обявата.'
export const WIZARD_LISTING_ALT_REQUIRED_MESSAGE = 'Добави алтернативен текст към всяка недекоративна снимка, преди да продължиш.'

export type ListingAltTextResult =
  | { ok: true; value: string }
  | { ok: false; message: string }

export type ListingImageAltInput = {
  id: string
  alt_text: string
  is_decorative: boolean
}

export type ListingImagesPublicationReview = {
  missingAltImageIds: string[]
  duplicateAltTexts: string[]
}

export type ListingPublicationImageBlock = 'missing_images' | 'alt_required' | null

export type ListingImageRegistrationInput = {
  storage_path: string
  alt_text: string
  is_decorative: boolean
}

export function listingAltTextHasVisibleContent(value: string) {
  for (const char of value) {
    if (!LISTING_ALT_INVISIBLE.has(char.codePointAt(0)!)) return true
  }
  return false
}

export function canonicalizeListingAltText(value: string) {
  let result = ''
  let lastWasSpace = false
  for (const char of value) {
    const codePoint = char.codePointAt(0)!
    if (LISTING_ALT_SPACE_CODEPOINTS.has(codePoint)) {
      if (!lastWasSpace) {
        result += ' '
        lastWasSpace = true
      }
      continue
    }
    if (LISTING_ALT_INVISIBLE.has(codePoint)) {
      continue
    }
    result += char
    lastWasSpace = false
  }
  return result.trim()
}

/** Duplicate comparison key: canonical whitespace, NFC, Unicode-aware lowercase (bg). */
export function listingAltTextDuplicateKey(value: string) {
  return canonicalizeListingAltText(value).normalize('NFC').toLocaleLowerCase('bg')
}

export function normalizeListingAltText(raw: unknown): ListingAltTextResult {
  if (typeof raw !== 'string') {
    return { ok: false, message: 'Въведи текст за алтернативното описание.' }
  }

  const value = canonicalizeListingAltText(raw)
  if (value.length > LISTING_ALT_TEXT_MAX_LENGTH) {
    return { ok: false, message: `Алтернативният текст може да е най-много ${LISTING_ALT_TEXT_MAX_LENGTH} символа.` }
  }

  return { ok: true, value }
}

export function listingAltTextIsRequired(status: string, isDecorative = false) {
  return !isDecorative && (LISTING_STATUSES_REQUIRING_ALT as readonly string[]).includes(status)
}

export function listingImageAltAttribute(image: { alt_text?: string | null; is_decorative?: boolean } | null | undefined): string {
  if (!image || image.is_decorative) return ''
  return canonicalizeListingAltText(image.alt_text ?? '')
}

export function reviewListingImagesForPublication(images: ListingImageAltInput[]): ListingImagesPublicationReview {
  const missingAltImageIds = images
    .filter((image) => !image.is_decorative && !listingAltTextHasVisibleContent(image.alt_text))
    .map((image) => image.id)

  const counts = new Map<string, { count: number; display: string }>()
  for (const image of images) {
    const display = canonicalizeListingAltText(image.alt_text)
    if (!listingAltTextHasVisibleContent(image.alt_text)) continue
    const key = listingAltTextDuplicateKey(display)
    const current = counts.get(key)
    if (current) current.count += 1
    else counts.set(key, { count: 1, display })
  }
  const duplicateAltTexts = [...counts.values()].filter((entry) => entry.count > 1).map((entry) => entry.display)

  return { missingAltImageIds, duplicateAltTexts }
}

export function listingPublicationImageBlock(
  images: ListingImageAltInput[] | null | undefined,
  options?: { requireImages?: boolean },
): ListingPublicationImageBlock {
  const requireImages = options?.requireImages !== false
  if (!images?.length) return requireImages ? 'missing_images' : null
  if (reviewListingImagesForPublication(images).missingAltImageIds.length) return 'alt_required'
  return null
}

export function listingPublicationImageBlockMessage(
  images: ListingImageAltInput[] | null | undefined,
  options?: { requireImages?: boolean },
) {
  const block = listingPublicationImageBlock(images, options)
  if (block === 'missing_images') return SUBMIT_LISTING_MISSING_IMAGES_MESSAGE
  if (block === 'alt_required') return SUBMIT_LISTING_ALT_REQUIRED_MESSAGE
  return null
}

export function parseListingImageRegistrations(input: unknown):
  | { ok: true; items: ListingImageRegistrationInput[] }
  | { ok: false } {
  if (!Array.isArray(input) || input.length < 1 || input.length > 8) return { ok: false }

  const items: ListingImageRegistrationInput[] = []
  for (const entry of input) {
    if (typeof entry === 'string') {
      if (entry.length < 1 || entry.length > 512) return { ok: false }
      items.push({ storage_path: entry, alt_text: '', is_decorative: false })
      continue
    }
    if (!entry || typeof entry !== 'object') return { ok: false }
    const record = entry as { storage_path?: unknown; alt_text?: unknown; is_decorative?: unknown }
    if (typeof record.storage_path !== 'string' || record.storage_path.length < 1 || record.storage_path.length > 512) {
      return { ok: false }
    }
    if (record.is_decorative !== undefined && typeof record.is_decorative !== 'boolean') return { ok: false }
    if (record.alt_text !== undefined && typeof record.alt_text !== 'string') return { ok: false }
    const parsedAlt = normalizeListingAltText(record.alt_text ?? '')
    if (!parsedAlt.ok) return { ok: false }
    items.push({
      storage_path: record.storage_path,
      alt_text: parsedAlt.value,
      is_decorative: record.is_decorative === true,
    })
  }
  if (new Set(items.map((item) => item.storage_path)).size !== items.length) return { ok: false }
  return { ok: true, items }
}

export function wizardPhotosNeedAltMessage(photos: Array<{ altText: string; isDecorative: boolean }>) {
  if (photos.some((photo) => !photo.isDecorative && !listingAltTextHasVisibleContent(photo.altText))) {
    return WIZARD_LISTING_ALT_REQUIRED_MESSAGE
  }
  return null
}
