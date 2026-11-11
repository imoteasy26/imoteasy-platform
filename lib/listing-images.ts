import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, ListingImage } from '@/lib/supabase/database.types'

export async function withSignedImageUrls<T extends Pick<ListingImage, 'storage_path'>>(
  supabase: SupabaseClient<Database>,
  images: T[],
): Promise<Array<T & { signed_url: string }>> {
  if (images.length === 0) return []

  const { data } = await supabase.storage.from('imoteasy-listings').createSignedUrls(
    images.map((image) => image.storage_path),
    60 * 60,
  )
  const urls = new Map((data ?? []).map((image) => [image.path, image.signedUrl ?? '']))
  return images.map((image) => ({ ...image, signed_url: urls.get(image.storage_path) ?? '' }))
}
