# Imoteasy

Imoteasy is a Bulgarian-language real-estate marketplace built with Next.js 16 and Supabase Auth, Postgres, and Storage. Public pages expose only published listings and approximate locations; account, seller, and moderation workflows require an authenticated Supabase session.

## Local development

1. Connect the project to its Supabase integration in v0. The integration provides the public URL and publishable key to the application.
2. For a local environment, copy `.env.example` to `.env.development.local` and fill only the public Supabase URL and publishable key. Do not put a service-role key in browser-facing environment variables.
3. Ensure `/auth/callback` is an allowed redirect for the Supabase Auth project. v0 provides the preview redirect variable automatically; local development falls back to the current origin.
4. Install dependencies with the repository's pnpm lockfile, run the Next.js development server, and use `pnpm typecheck` for the TypeScript check.

Schema changes live in `supabase/migrations/` and are applied to the connected project through the Supabase integration. Keep the migration files and connected schema in sync.

## Product and quality docs

- [Environment variables](docs/environment.md)
- [End-to-end user story](docs/user-story.md)
- [Manual QA checklist](docs/manual-qa.md)
- [Security and app audit](docs/security-audit.md)
