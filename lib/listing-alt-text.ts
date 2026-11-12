export const LISTING_ALT_TEXT_MAX_LENGTH = 200

export const LISTING_STATUSES_REQUIRING_ALT = ['pending_review', 'published'] as const

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

export function canonicalizeListingAltText(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

/** Duplicate comparison key: trimmed, collapsed whitespace, Unicode-aware lowercase (bg). */
export function listingAltTextDuplicateKey(value: string) {
  return canonicalizeListingAltText(value).toLocaleLowerCase('bg')
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
  return (image.alt_text ?? '').trim()
}

export function reviewListingImagesForPublication(images: ListingImageAltInput[]): ListingImagesPublicationReview {
  const missingAltImageIds = images
    .filter((image) => !image.is_decorative && canonicalizeListingAltText(image.alt_text).length === 0)
    .map((image) => image.id)

  const counts = new Map<string, { count: number; display: string }>()
  for (const image of images) {
    const display = canonicalizeListingAltText(image.alt_text)
    if (!display) continue
    const key = listingAltTextDuplicateKey(display)
    const current = counts.get(key)
    if (current) current.count += 1
    else counts.set(key, { count: 1, display })
  }
  const duplicateAltTexts = [...counts.values()].filter((entry) => entry.count > 1).map((entry) => entry.display)

  return { missingAltImageIds, duplicateAltTexts }
}
