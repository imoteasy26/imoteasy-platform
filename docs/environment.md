# Environment variables

The app uses Supabase's browser-safe project credentials. In v0, connect the Supabase integration and let it inject these values; do not copy project secrets into source files or prompt text.

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL used by server and browser clients and for public listing-image URLs. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes (preferred) | Browser-safe publishable key used with RLS. The app falls back to the legacy anon key when this is absent. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Fallback only | Legacy browser-safe key; use only when the publishable key is not available. |
| `NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL` | Optional in v0 | v0 preview redirect proxy used for email confirmation. Local development falls back to the current origin plus `/auth/callback`. |

`NODE_ENV` is supplied by Next.js and is used to set secure auth cookies in production. It is not a project setting to add manually.

## Auth callback

Sign-up email confirmation redirects through the v0-provided preview URL when present, then exchanges the authorization code at `/auth/callback`. For local development, make the current app origin and callback an allowed Supabase Auth redirect. Do not hardcode preview domains: they can change.

## Secrets and storage

The current app does not require `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`, database passwords, or direct Postgres URLs at runtime. Never expose service-role or secret keys through `NEXT_PUBLIC_*` variables or client code. `.env.development.local` is private runtime configuration and must not be committed. `.env.example` contains names only.
