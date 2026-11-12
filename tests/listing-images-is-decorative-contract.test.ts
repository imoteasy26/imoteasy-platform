import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LISTING_ALT_INVISIBLE_CODEPOINTS } from '@/lib/listing-alt-text'

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
const adminActions = read('app/admin/actions.ts')
const publishWizard = read('features/listings/publish-wizard.tsx')
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
    expect(migration).toContain('private.listing_alt_text_has_visible_content')
    expect(migration).toContain('private.listing_alt_invisible_chars')
    expect(migration).toContain('translate(')
    expect(migration).not.toMatch(/\[:space:\]/)
    expect(migration).toContain('chr(160)')
    expect(migration).toContain('chr(8203)')
    expect(migration).toContain('chr(65279)')
    expect(migration).toContain('chr(8199)')
    expect(migration).toContain('chr(8239)')
    expect(migration).toContain('chr(12288)')
    expect(migration).toContain('chr(8232)')
    expect(migration).not.toMatch(/length\s*\(\s*btrim\s*\(/)
    expect(migration).toMatch(/for no key update/i)
    expect(migration).not.toMatch(/for share/i)
    expect(migration).toContain('listing_image_access_denied')
    expect(migration).toMatch(/security invoker/i)
    expect(migration).toContain('private.can_manage_listing')
    expect(migration).toMatch(/current_user is distinct from 'service_role'/)
    expect(migration).not.toMatch(/auth\.role\(\)/)
    expect(sqlTest).toContain('forged service_role JWT claim bypassed the ownership check')
    expect(sqlTest).toContain('SET ROLE service_role could not update listing images')
    expect(sqlTest).toContain('broker with entitlement could not insert and update an org listing image')
    expect(sqlTest).toContain('agency_admin could not insert and update an org listing image')
    expect(sqlTest).toContain('org owner could not insert and update an org listing image')
    expect(sqlTest).toContain('broker without listing_management inserted an org listing image')
    expect(sqlTest).toContain('listing_image_alt_required')
    expect(sqlTest).toContain('whitespace-only alt was treated as present')
    expect(sqlTest).toContain('ZWSP-only alt was treated as present')
    expect(sqlTest).toContain('listing_image_access_denied')
    expect(sqlTest).toContain("current_setting('standard_conforming_strings')")
  })

  it('ships a matching rollback and includes the migration in the local script cycle', () => {
    expect(rollback).toContain('drop trigger if exists listing_images_enforce_accessible_alt')
    expect(rollback).toContain('drop trigger if exists listings_enforce_accessible_alt')
    expect(rollback).toContain('drop function if exists private.enforce_listing_image_accessible_alt')
    expect(rollback).toContain('drop function if exists private.can_manage_listing')
    expect(rollback).toContain('drop function if exists private.listing_status_for_alt_enforcement')
    expect(rollback).toContain('drop function if exists private.listing_images_missing_accessible_alt')
    expect(rollback).toContain('drop function if exists private.listing_alt_text_has_visible_content')
    expect(rollback).toContain('drop function if exists private.listing_alt_invisible_chars')
    expect(rollback).toContain('listing_images_insert_access')
    expect(rollback).toContain('drop column if exists is_decorative')
    expect(script).toContain('20261112160000_listing_images_is_decorative.sql')
    expect(script).toContain('listing_images_status_concurrency.sh')
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

  it('renders listing images with an explicit alt attribute, empty for decorative images', () => {
    for (const source of [listingCard, listingDetail, adminPage]) {
      expect(source).toMatch(/alt=\{listingImageAltAttribute\(/)
      expect(source).not.toMatch(/alt=\{undefined\}/)
      expect(source).not.toMatch(/<Image(?![^>]*\balt=)/)
    }
    expect(imageManager).toMatch(/alt=\{previewAlt\}/)
    expect(imageManager).toContain('isDecorative ? listingImageAltAttribute')
    expect(imageManager).toContain('is_decorative: true')
    expect(imageManager).not.toMatch(/alt=\{undefined\}/)
    expect(imageManager).not.toMatch(/<Image(?![^>]*\balt=)/)
  })

  it('collects alt and decorative flags in the publish wizard and blocks submit on the server', () => {
    expect(publishWizard).toContain('type="checkbox"')
    expect(publishWizard).toContain('Алтернативен текст')
    expect(publishWizard).toContain('Декоративна снимка')
    expect(publishWizard).toContain('wizardPhotosNeedAltMessage')
    expect(publishWizard).toContain('is_decorative: photos[index].isDecorative')
    expect(registerImages).toContain('parseListingImageRegistrations')
    expect(registerImages).toContain('listingPublicationImageBlockMessage')
    expect(adminActions).toContain("listingPublicationImageBlock(images, { requireImages: false })")
    expect(adminActions).toContain("redirect('/admin?updated=alt_required')")
  })

  it('keeps the SQL and JS invisible character lists identical', () => {
    const sqlCodes = [...migrationSource.matchAll(/chr\((\d+)\)/g)].map((match) => Number(match[1]))
    expect(new Set(sqlCodes)).toEqual(new Set(LISTING_ALT_INVISIBLE_CODEPOINTS))
    expect(sqlCodes).toHaveLength(LISTING_ALT_INVISIBLE_CODEPOINTS.length)
  })
})
