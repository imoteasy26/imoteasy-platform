import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SUBMIT_LISTING_ALT_REQUIRED_MESSAGE, SUBMIT_LISTING_MISSING_IMAGES_MESSAGE } from '@/lib/listing-alt-text'

const ownerId = '11111111-1111-4111-8111-111111111111'
const listingId = '22222222-2222-4222-8222-222222222222'
const fileA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'
const fileB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg'
const pathA = `${ownerId}/${listingId}/${fileA}`
const pathB = `${ownerId}/${listingId}/${fileB}`

type Row = Record<string, unknown>

const { revalidatePath, withSignedImageUrls, state, createMockClient } = vi.hoisted(() => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01])
  const hoistedOwnerId = '11111111-1111-4111-8111-111111111111'
  const hoistedListingId = '22222222-2222-4222-8222-222222222222'
  const hoistedPathA = `${hoistedOwnerId}/${hoistedListingId}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg`
  const hoistedPathB = `${hoistedOwnerId}/${hoistedListingId}/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg`
  const state = {
    userId: hoistedOwnerId,
    listing: {
      id: hoistedListingId,
      slug: 'draft-listing',
      status: 'draft',
      owner_id: hoistedOwnerId,
    } as Row,
    images: [] as Row[],
    storedNames: [
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg',
    ],
    downloads: new Map<string, Uint8Array>([
      [hoistedPathA, jpeg],
      [hoistedPathB, jpeg],
    ]),
  }

  const revalidatePath = vi.fn()
  const withSignedImageUrls = vi.fn(async (_supabase: unknown, images: Row[]) => images)

  function matches(row: Row, filters: Array<[string, unknown]>) {
    return filters.every(([column, value]) => row[column] === value)
  }

  function createMockClient() {
    return {
      auth: {
        getUser: async () => ({ data: { user: state.userId ? { id: state.userId } : null } }),
      },
      storage: {
        from: (bucket: string) => ({
          list: async (prefix: string) => {
            if (bucket !== 'imoteasy-listings') return { data: null, error: { message: 'unknown bucket' } }
            const folder = `${state.listing.owner_id}/${state.listing.id}`
            if (prefix !== folder) return { data: [], error: null }
            return { data: state.storedNames.map((name) => ({ name })), error: null }
          },
          download: async (storagePath: string) => {
            const bytes = state.downloads.get(storagePath)
            if (!bytes) return { data: null, error: { message: 'missing' } }
            return { data: new Blob([bytes]), error: null }
          },
        }),
      },
      from: (table: string) => {
        const filters: Array<[string, unknown]> = []
        let action: 'select' | 'insert' | 'update' = 'select'
        let insertRows: Row[] = []
        let updatePatch: Row = {}

        const execute = async (mode: 'many' | 'maybeSingle' | 'single') => {
          if (table === 'listings') {
            if (action === 'update') {
              if (!matches(state.listing, filters)) return { data: null, error: null }
              Object.assign(state.listing, updatePatch)
              const data = { ...state.listing }
              return mode === 'many' ? { data: [data], error: null } : { data, error: null }
            }
            const data = matches(state.listing, filters) ? { ...state.listing } : null
            if (mode === 'many') return { data: data ? [data] : [], error: null }
            if (mode === 'single' && !data) return { data: null, error: { message: 'not found' } }
            return { data, error: null }
          }
          if (table === 'listing_images') {
            if (action === 'insert') {
              const start = state.images.length
              const saved = insertRows.map((row, index) => ({
                id: `image-${start + index}`,
                is_cover: row.is_cover ?? false,
                ...row,
              }))
              state.images.push(...saved)
              return { data: saved, error: null }
            }
            if (action === 'update') {
              const updated = state.images.filter((row) => matches(row, filters)).map((row) => Object.assign(row, updatePatch))
              return mode === 'many' ? { data: updated, error: null } : { data: updated[0] ?? null, error: null }
            }
            const rows = state.images.filter((row) => matches(row, filters))
            if (mode === 'many') return { data: rows, error: null }
            return { data: rows[0] ?? null, error: null }
          }
          return { data: mode === 'many' ? [] : null, error: null }
        }

        const api: Record<string, unknown> = {
          select: () => api,
          insert: (rows: Row | Row[]) => {
            action = 'insert'
            insertRows = Array.isArray(rows) ? rows : [rows]
            return api
          },
          update: (patch: Row) => {
            action = 'update'
            updatePatch = patch
            return api
          },
          eq: (column: string, value: unknown) => {
            filters.push([column, value])
            return api
          },
          maybeSingle: () => execute('maybeSingle'),
          single: () => execute('single'),
          then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => execute('many').then(resolve, reject),
        }
        return api
      },
    }
  }

  return { revalidatePath, withSignedImageUrls, state, createMockClient }
})

vi.mock('next/cache', () => ({ revalidatePath }))
vi.mock('@/lib/listing-images', () => ({ withSignedImageUrls }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => createMockClient() }))

import { registerListingImages, submitListingForReview } from '@/app/publish/actions'

describe('registerListingImages then submitListingForReview', () => {
  beforeEach(() => {
    state.userId = ownerId
    state.listing = { id: listingId, slug: 'draft-listing', status: 'draft', owner_id: ownerId }
    state.images = []
    revalidatePath.mockClear()
    withSignedImageUrls.mockClear()
  })

  it('registers valid images and submits the listing for review', async () => {
    const registered = await registerListingImages(listingId, [
      { storage_path: pathA, alt_text: '  Кухня  ', is_decorative: false },
      { storage_path: pathB, alt_text: '', is_decorative: true },
    ])
    expect(registered).toMatchObject({ success: true })
    if (!registered.success) return
    expect(registered.images).toEqual([
      expect.objectContaining({ storage_path: pathA, alt_text: 'Кухня', is_decorative: false, is_cover: true }),
      expect.objectContaining({ storage_path: pathB, alt_text: '', is_decorative: true, is_cover: false }),
    ])
    expect(state.images).toHaveLength(2)

    const submitted = await submitListingForReview(listingId)
    expect(submitted).toEqual({ success: true })
    expect(state.listing.status).toBe('pending_review')
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard')
    expect(revalidatePath).toHaveBeenCalledWith('/imoti/draft-listing')
  })

  it('lets registration succeed for a draft image without alt, then blocks submit', async () => {
    const registered = await registerListingImages(listingId, [
      { storage_path: pathA, alt_text: '\u200B', is_decorative: false },
    ])
    expect(registered).toMatchObject({ success: true })
    expect(state.listing.status).toBe('draft')

    const submitted = await submitListingForReview(listingId)
    expect(submitted).toEqual({ success: false, message: SUBMIT_LISTING_ALT_REQUIRED_MESSAGE })
    expect(state.listing.status).toBe('draft')
  })

  it('blocks submit when the listing has no images', async () => {
    const submitted = await submitListingForReview(listingId)
    expect(submitted).toEqual({ success: false, message: SUBMIT_LISTING_MISSING_IMAGES_MESSAGE })
    expect(state.listing.status).toBe('draft')
  })
})
