export const LISTING_ALT_TEXT_MAX_LENGTH = 200

export type ListingAltTextResult =
  | { ok: true; value: string }
  | { ok: false; message: string }

export function normalizeListingAltText(raw: unknown): ListingAltTextResult {
  if (typeof raw !== 'string') {
    return { ok: false, message: 'Въведи текст за алтернативното описание.' }
  }

  const value = raw.trim().replace(/\s+/g, ' ')
  if (value.length > LISTING_ALT_TEXT_MAX_LENGTH) {
    return { ok: false, message: `Алтернативният текст може да е най-много ${LISTING_ALT_TEXT_MAX_LENGTH} символа.` }
  }

  return { ok: true, value }
}

export function listingAltTextIsRequired(status: string) {
  return status === 'published'
}
