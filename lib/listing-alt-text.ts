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

export function listingImageAltAttribute(image: { alt_text: string; is_decorative?: boolean } | null | undefined) {
  if (!image || image.is_decorative) return ''
  return image.alt_text.trim()
}

export function reviewListingImagesForPublication(images: ListingImageAltInput[]): ListingImagesPublicationReview {
  const missingAltImageIds = images
    .filter((image) => !image.is_decorative && canonicalizeListingAltText(image.alt_text).length === 0)
    .map((image) => image.id)

  const counts = new Map<string, number>()
  for (const image of images) {
    const value = canonicalizeListingAltText(image.alt_text)
    if (!value) continue
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  const duplicateAltTexts = [...counts.entries()].filter(([, count]) => count > 1).map(([value]) => value)

  return { missingAltImageIds, duplicateAltTexts }
}
