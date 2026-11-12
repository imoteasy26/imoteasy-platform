import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (relativePath: string) => readFileSync(join(root, relativePath), 'utf8')

const stripSqlComments = (sql: string) =>
  sql
    .split('\n')
    .map((line) => line.replace(/--[\s\S]*$/, ''))
    .join('\n')

const migrationSource = read('supabase/migrations/20261112160000_listing_images_is_decorative.sql')
const migration = stripSqlComments(migrationSource)
const rollback = read('supabase/rollback/20261112160000_listing_images_is_decorative.rollback.sql')
const sqlTest = read('supabase/tests/rls/listing_images_is_decorative.sql')
const script = read('scripts/run-org-rls-local.sh')
const types = read('lib/supabase/database.types.ts')
const registerImages = read('app/publish/actions.ts')
const listingCard = read('features/listings/listing-card.tsx')
const listingDetail = read('features/listings/listing-detail.tsx')
const adminPage = read('app/admin/page.tsx')
const imageManager = read('features/dashboard/listing-image-manager.tsx')

describe('listing_images is_decorative migration contract', () => {
  it('adds a not-null false column in a new migration and does not use NOT VALID', () => {
    expect(migration).toMatch(/add column if not exists is_decorative boolean not null default false/i)
    expect(migration).not.toMatch(/\bnot valid\b/i)
    expect(migration).toContain('private.enforce_listing_image_accessible_alt')
    expect(types).toMatch(/is_decorative: boolean/)
  })

  it('uses triggers because a CHECK cannot read listings.status', () => {
    expect(migrationSource).toMatch(/plain CHECK cannot express it/i)
    expect(migration).toContain('listing_images_enforce_accessible_alt')
    expect(migration).toContain('listings_enforce_accessible_alt')
    expect(migration).toContain("'pending_review', 'published'")
    expect(migration).toContain('listing_image_alt_required')
    expect(migration).toMatch(/length\(btrim\(.*alt_text\)\) > 0/)
    expect(sqlTest).toContain('listing_image_alt_required')
    expect(sqlTest).toContain('whitespace-only alt was treated as present')
  })

  it('ships a matching rollback and includes the migration in the local script cycle', () => {
    expect(rollback).toContain('drop trigger if exists listing_images_enforce_accessible_alt')
    expect(rollback).toContain('drop trigger if exists listings_enforce_accessible_alt')
    expect(rollback).toContain('drop function if exists private.enforce_listing_image_accessible_alt')
    expect(rollback).toContain('drop column if exists is_decorative')
    expect(script).toContain('20261112160000_listing_images_is_decorative.sql')
    expect(script).toContain('listing_images_is_decorative.rollback.sql')
    expect(script).toContain('listing_images_is_decorative.sql')
  })

  it('does not fall back to the listing title for alt text', () => {
    expect(registerImages).not.toMatch(/alt_text:\s*`\$\{listing\.title\}/)
    expect(listingCard).not.toMatch(/alt_text\s*\|\|\s*listing\.title/)
    expect(listingDetail).not.toMatch(/alt_text\s*\|\|\s*listing\.title/)
    expect(adminPage).not.toMatch(/alt_text\s*\|\|\s*listing\.title/)
    expect(imageManager).toContain('type="checkbox"')
    expect(imageManager).toContain('is_decorative')
  })
})
