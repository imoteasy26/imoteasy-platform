export function getSiteUrl(): URL {
  const configuredHost = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL
  if (!configuredHost) return new URL('http://localhost:3000')
  const normalizedHost = configuredHost.startsWith('http') ? configuredHost : `https://${configuredHost}`
  return new URL(normalizedHost)
}
