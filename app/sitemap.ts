import type { MetadataRoute } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getSiteUrl } from '@/lib/site-url'

export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getSiteUrl()
  const supabase = await createClient()
  const { data: listings, error } = await supabase.from('listings')
    .select('slug, updated_at')
    .eq('status', 'published')
    .order('updated_at', { ascending: false })
    .limit(5000)

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: new URL('/', baseUrl).toString(), changeFrequency: 'weekly', priority: 1 },
    { url: new URL('/imoti', baseUrl).toString(), changeFrequency: 'daily', priority: 0.9 },
  ]
  if (error || !listings) return staticRoutes

  return [
    ...staticRoutes,
    ...listings.map((listing) => ({
      url: new URL(`/imoti/${listing.slug}`, baseUrl).toString(),
      lastModified: listing.updated_at,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
  ]
}
