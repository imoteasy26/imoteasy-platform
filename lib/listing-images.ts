export function getPublicImageUrl(path: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) return ''
  return `${url}/storage/v1/object/public/imoteasy-listings/${path.split('/').map(encodeURIComponent).join('/')}`
}
