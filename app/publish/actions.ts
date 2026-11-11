'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { listingSchema } from '@/features/listings/listing-schema'
import { approximateCoordinate } from '@/lib/geo'
import { withSignedImageUrls } from '@/lib/listing-images'
import { createClient } from '@/lib/supabase/server'

const listingIdSchema = z.string().uuid()
const imagePathsSchema = z.array(z.string().min(1).max(512)).min(1).max(8)
const maximumImageBytes = 8 * 1024 * 1024

function matchesImageSignature(name: string, bytes: Uint8Array) {
  if (name.endsWith('.jpg')) return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (name.endsWith('.png')) return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  return name.endsWith('.webp') && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
}

function toListingRecord(values: z.infer<typeof listingSchema>) {
  return {
    title: values.title.trim(),
    description: values.description.trim(),
    property_type: values.property_type,
    transaction_type: values.transaction_type,
    city: values.city.trim(),
    neighborhood: values.neighborhood?.trim() || null,
    price_eur: values.price_eur,
    area_sqm: values.area_sqm,
    rooms: values.rooms ?? null,
    bedrooms: values.bedrooms ?? null,
    floor: values.floor ?? null,
    total_floors: values.total_floors ?? null,
    construction_type: values.construction_type?.trim() || null,
    condition: values.condition?.trim() || null,
    furnishing: values.furnishing?.trim() || null,
    latitude: approximateCoordinate(values.latitude, 90),
    longitude: approximateCoordinate(values.longitude, 180),
  }
}

function createSlug(title: string) {
  const prefix = title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 72) || 'imot'
  return `${prefix}-${globalThis.crypto.randomUUID().slice(0, 8)}`
}

export async function saveListingDraft(existingId: string | null, input: unknown) {
  const parsed = listingSchema.safeParse(input)
  const safeId = existingId === null ? null : listingIdSchema.safeParse(existingId)
  if (!parsed.success || (existingId !== null && !safeId?.success)) return { success: false as const, message: 'Провери данните и опитай отново.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false as const, message: 'Влез в профила си, за да запазиш обява.' }

  const values = parsed.data
  const hasExactCoordinates = values.latitude !== undefined || values.longitude !== undefined
  const { error: coordinateSchemaError } = await supabase
    .from('private_listing_details')
    .select('exact_latitude, exact_longitude')
    .limit(0)
  const privateCoordinatesReady = !coordinateSchemaError
  if (hasExactCoordinates && !privateCoordinatesReady) {
    return { success: false as const, message: 'Прилагането на актуализацията за защита на локацията е необходимо, преди да запазиш точни координати.' }
  }

  const listingValues = toListingRecord(values)
  let listingId: string
  let slug: string

  if (existingId && safeId?.success) {
    const { data: listing, error } = await supabase.from('listings')
      .update(listingValues)
      .eq('id', safeId.data)
      .eq('owner_id', user.id)
      .eq('status', 'draft')
      .select('id, slug')
      .maybeSingle()
    if (error || !listing) return { success: false as const, message: 'Черновата не е намерена или вече не може да бъде редактирана.' }
    listingId = listing.id
    slug = listing.slug
  } else {
    const { data: listing, error } = await supabase.from('listings').insert({
      ...listingValues,
      owner_id: user.id,
      slug: createSlug(values.title),
      status: 'draft',
    }).select('id, slug').single()
    if (error || !listing) return { success: false as const, message: 'Не успяхме да запазим обявата. Провери въведените данни и опитай отново.' }
    listingId = listing.id
    slug = listing.slug
  }

  const { error: addressError } = await supabase.from('private_listing_details').upsert({
    listing_id: listingId,
    exact_address: values.exact_address?.trim() || '',
    ...(privateCoordinatesReady ? {
      exact_latitude: values.latitude ?? null,
      exact_longitude: values.longitude ?? null,
    } : {}),
  }, { onConflict: 'listing_id' })

  if (addressError) return { success: false as const, message: 'Данните за имота са запазени, но личният адрес не се обнови.' }
  revalidatePath('/dashboard')
  revalidatePath(`/imoti/${slug}`)
  return { success: true as const, listingId, userId: user.id }
}

export async function registerListingImages(listingId: string, input: unknown) {
  const safeId = listingIdSchema.safeParse(listingId)
  const parsedPaths = imagePathsSchema.safeParse(input)
  if (!safeId.success || !parsedPaths.success) return { success: false as const, message: 'Избраните снимки не са валидни.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false as const, message: 'Влез в профила си, за да качваш снимки.' }

  const { data: listing } = await supabase.from('listings').select('id, title, slug')
    .eq('id', safeId.data).eq('owner_id', user.id).maybeSingle()
  if (!listing) return { success: false as const, message: 'Обявата не е намерена.' }

  const prefix = `${user.id}/${listing.id}/`
  const names = parsedPaths.data.map((path) => path.startsWith(prefix) ? path.slice(prefix.length) : '')
  if (names.some((name) => !/^[a-f0-9-]{36}\.(jpg|png|webp)$/i.test(name)) || new Set(names).size !== names.length) {
    return { success: false as const, message: 'Пътят на една или повече снимки не е валиден.' }
  }

  const [{ data: existingImages, error: imagesError }, { data: storedFiles, error: storageError }] = await Promise.all([
    supabase.from('listing_images').select('id, position').eq('listing_id', listing.id),
    supabase.storage.from('imoteasy-listings').list(`${user.id}/${listing.id}`, { limit: 100 }),
  ])
  if (imagesError || storageError) return { success: false as const, message: 'Не успяхме да проверим снимките. Опитай отново.' }
  if ((existingImages?.length ?? 0) + names.length > 8) return { success: false as const, message: 'За една обява можеш да добавиш до 8 снимки.' }

  const storedNames = new Set((storedFiles ?? []).map((file) => file.name))
  if (names.some((name) => !storedNames.has(name))) return { success: false as const, message: 'Една или повече снимки не са качени.' }

  const storage = supabase.storage.from('imoteasy-listings')
  for (const [index, path] of parsedPaths.data.entries()) {
    const { data: file, error: downloadError } = await storage.download(path)
    if (downloadError || !file || file.size > maximumImageBytes) return { success: false as const, message: 'Снимките трябва да са JPG, PNG или WebP до 8 MB.' }
    const signature = new Uint8Array(await file.slice(0, 12).arrayBuffer())
    if (!matchesImageSignature(names[index], signature)) return { success: false as const, message: 'Форматът на една или повече снимки не е валиден.' }
  }

  const nextPosition = Math.max(-1, ...(existingImages ?? []).map((image) => image.position)) + 1
  const rows = parsedPaths.data.map((storage_path, index) => ({
    listing_id: listing.id,
    storage_path,
    alt_text: `${listing.title}, снимка ${nextPosition + index + 1}`,
    position: nextPosition + index,
    is_cover: (existingImages?.length ?? 0) === 0 && index === 0,
  }))
  const { data: savedImages, error } = await supabase.from('listing_images').insert(rows)
    .select('id, storage_path, alt_text, position, is_cover')
  if (error || !savedImages) return { success: false as const, message: 'Не успяхме да запишем снимките. Опитай отново.' }

  revalidatePath('/dashboard')
  revalidatePath(`/imoti/${listing.slug}`)
  return { success: true as const, images: await withSignedImageUrls(supabase, savedImages) }
}

export async function submitListingForReview(listingId: string) {
  const safeId = listingIdSchema.safeParse(listingId)
  if (!safeId.success) return { success: false as const, message: 'Обявата не е валидна.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false as const, message: 'Влез в профила си, за да изпратиш обява.' }

  const { data: listing } = await supabase.from('listings').select('id, slug, status')
    .eq('id', safeId.data).eq('owner_id', user.id).maybeSingle()
  if (!listing || !['draft', 'rejected'].includes(listing.status)) {
    return { success: false as const, message: 'Обявата не е намерена или не може да бъде изпратена за преглед.' }
  }
  const { data: image } = await supabase.from('listing_images').select('id').eq('listing_id', listing.id).limit(1).maybeSingle()
  if (!image) return { success: false as const, message: 'Добави поне една снимка, преди да изпратиш обявата.' }

  const { data: updated, error } = await supabase.from('listings').update({ status: 'pending_review' })
    .eq('id', listing.id).eq('owner_id', user.id).eq('status', listing.status).select('id').maybeSingle()
  if (error || !updated) return { success: false as const, message: 'Обявата е запазена като чернова, но не успяхме да я изпратим за преглед.' }

  revalidatePath('/dashboard')
  revalidatePath(`/imoti/${listing.slug}`)
  return { success: true as const }
}

export async function deleteListingImage(listingId: string, imageId: string) {
  const safeListingId = listingIdSchema.safeParse(listingId)
  const safeImageId = listingIdSchema.safeParse(imageId)
  if (!safeListingId.success || !safeImageId.success) return { success: false as const, message: 'Снимката не е валидна.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false as const, message: 'Влез в профила си, за да редактираш снимки.' }

  const { data: listing } = await supabase.from('listings').select('id, slug')
    .eq('id', safeListingId.data).eq('owner_id', user.id).maybeSingle()
  const { data: image } = await supabase.from('listing_images').select('id, storage_path, is_cover')
    .eq('id', safeImageId.data).eq('listing_id', safeListingId.data).maybeSingle()
  if (!listing || !image || !image.storage_path.startsWith(`${user.id}/${listing.id}/`)) {
    return { success: false as const, message: 'Снимката не е намерена.' }
  }

  const { error: storageError } = await supabase.storage.from('imoteasy-listings').remove([image.storage_path])
  if (storageError) return { success: false as const, message: 'Не успяхме да изтрием снимката от хранилището.' }
  const { error: rowError } = await supabase.from('listing_images').delete()
    .eq('id', image.id).eq('listing_id', listing.id)
  if (rowError) return { success: false as const, message: 'Снимката е премахната от хранилището, но метаданните не се обновиха.' }

  if (image.is_cover) {
    const { data: nextImage } = await supabase.from('listing_images').select('id')
      .eq('listing_id', listing.id).order('position', { ascending: true }).limit(1).maybeSingle()
    if (nextImage) await supabase.from('listing_images').update({ is_cover: true }).eq('id', nextImage.id)
  }

  revalidatePath('/dashboard')
  revalidatePath(`/imoti/${listing.slug}`)
  return { success: true as const }
}
