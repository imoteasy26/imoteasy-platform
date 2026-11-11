'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { listingSchema } from '@/features/listings/listing-schema'
import { approximateCoordinate } from '@/lib/geo'

const listingEditSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(10).max(120),
  price_eur: z.coerce.number().positive().max(1_000_000_000),
})

export async function updateOwnedListing(formData: FormData) {
  const parsed = listingEditSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) redirect('/dashboard?updated=error')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/sign-in?next=%2Fdashboard')
  const { error } = await supabase.from('listings').update({ title: parsed.data.title, price_eur: parsed.data.price_eur }).eq('id', parsed.data.id).eq('owner_id', user.id)
  revalidatePath('/dashboard')
  redirect(`/dashboard?updated=${error ? 'error' : 'ok'}`)
}

export async function updateOwnedListingStatus(formData: FormData) {
  const parsed = z.object({ id: z.string().uuid(), status: z.enum(['archived', 'sold', 'draft']) }).safeParse(Object.fromEntries(formData))
  if (!parsed.success) redirect('/dashboard?updated=error')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/sign-in?next=%2Fdashboard')
  const { error } = await supabase.from('listings').update({ status: parsed.data.status }).eq('id', parsed.data.id).eq('owner_id', user.id)
  revalidatePath('/dashboard')
  redirect(`/dashboard?updated=${error ? 'error' : 'ok'}`)
}

export async function updateOwnedListingDetails(formData: FormData) {
  const parsed = listingSchema.extend({ id: z.string().uuid() }).safeParse(Object.fromEntries(formData))
  if (!parsed.success) redirect('/dashboard?updated=error')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/sign-in?next=%2Fdashboard')

  const { id, exact_address, ...values } = parsed.data
  const { error: coordinateSchemaError } = await supabase
    .from('private_listing_details')
    .select('exact_latitude, exact_longitude')
    .limit(0)
  const privateCoordinatesReady = !coordinateSchemaError
  const hasSubmittedCoordinates = values.latitude !== undefined || values.longitude !== undefined
  if (hasSubmittedCoordinates && !privateCoordinatesReady) redirect('/dashboard?updated=migration')

  const listingUpdate = {
    title: values.title,
    description: values.description,
    property_type: values.property_type,
    transaction_type: values.transaction_type,
    city: values.city,
    neighborhood: values.neighborhood || null,
    price_eur: values.price_eur,
    area_sqm: values.area_sqm,
    rooms: values.rooms ?? null,
    bedrooms: values.bedrooms ?? null,
    floor: values.floor ?? null,
    total_floors: values.total_floors ?? null,
    construction_type: values.construction_type || null,
    condition: values.condition || null,
    furnishing: values.furnishing || null,
    ...(privateCoordinatesReady ? {
      latitude: approximateCoordinate(values.latitude, 90),
      longitude: approximateCoordinate(values.longitude, 180),
    } : {}),
  }
  const { data: listing, error } = await supabase.from('listings').update(listingUpdate).eq('id', id).eq('owner_id', user.id).select('slug').maybeSingle()
  if (error || !listing) redirect('/dashboard?updated=error')

  const { error: privateDetailsError } = await supabase.from('private_listing_details').upsert({
    listing_id: id,
    exact_address: exact_address?.trim() || '',
    ...(privateCoordinatesReady ? {
      exact_latitude: values.latitude ?? null,
      exact_longitude: values.longitude ?? null,
    } : {}),
  }, { onConflict: 'listing_id' })
  revalidatePath('/dashboard')
  revalidatePath(`/imoti/${listing.slug}`)
  redirect(`/dashboard?updated=${privateDetailsError ? 'error' : 'ok'}`)
}

export async function deleteOwnedDraft(formData: FormData) {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(Object.fromEntries(formData))
  if (!parsed.success) redirect('/dashboard?updated=error')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/sign-in?next=%2Fdashboard')

  const { data: listing } = await supabase.from('listings').select('id')
    .eq('id', parsed.data.id).eq('owner_id', user.id).eq('status', 'draft').maybeSingle()
  if (!listing) redirect('/dashboard?updated=error')
  const { data: images } = await supabase.from('listing_images').select('storage_path').eq('listing_id', listing.id)
  const paths = (images ?? []).map((image) => image.storage_path)
  if (paths.length) {
    const { error: storageError } = await supabase.storage.from('imoteasy-listings').remove(paths)
    if (storageError) redirect('/dashboard?updated=error')
  }
  const { error } = await supabase.from('listings').delete().eq('id', listing.id).eq('owner_id', user.id).eq('status', 'draft')
  if (error) redirect('/dashboard?updated=error')
  revalidatePath('/dashboard')
  redirect('/dashboard?deleted=1')
}

export async function updateInquiryStatus(formData: FormData) {
  const parsed = z.object({ id: z.string().uuid(), status: z.enum(['new', 'read', 'replied', 'archived']) }).safeParse(Object.fromEntries(formData))
  if (!parsed.success) redirect('/dashboard?updated=error')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/sign-in?next=%2Fdashboard')
  const { data, error } = await supabase.from('inquiries').update({ status: parsed.data.status })
    .eq('id', parsed.data.id).select('id').maybeSingle()
  revalidatePath('/dashboard')
  redirect(`/dashboard?updated=${error || !data ? 'error' : 'ok'}`)
}

export async function toggleSavedSearch(formData: FormData) {
  const parsed = z.object({ id: z.string().uuid(), enabled: z.enum(['true', 'false']) }).safeParse(Object.fromEntries(formData))
  if (!parsed.success) redirect('/dashboard/saved-searches?updated=error')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/sign-in?next=%2Fdashboard%2Fsaved-searches')
  const { error } = await supabase.from('saved_searches').update({ enabled: parsed.data.enabled === 'true' })
    .eq('id', parsed.data.id).eq('user_id', user.id)
  revalidatePath('/dashboard/saved-searches')
  redirect(`/dashboard/saved-searches?updated=${error ? 'error' : 'ok'}`)
}

export async function deleteSavedSearch(formData: FormData) {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(Object.fromEntries(formData))
  if (!parsed.success) redirect('/dashboard/saved-searches?updated=error')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/sign-in?next=%2Fdashboard%2Fsaved-searches')
  const { error } = await supabase.from('saved_searches').delete().eq('id', parsed.data.id).eq('user_id', user.id)
  revalidatePath('/dashboard/saved-searches')
  redirect(`/dashboard/saved-searches?updated=${error ? 'error' : 'ok'}`)
}

export async function markNotificationRead(formData: FormData) {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(Object.fromEntries(formData))
  if (!parsed.success) redirect('/dashboard/notifications?updated=error')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/sign-in?next=%2Fdashboard%2Fnotifications')
  const { error } = await supabase.from('notifications').update({ is_read: true })
    .eq('id', parsed.data.id).eq('user_id', user.id)
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/notifications')
  redirect(`/dashboard/notifications?updated=${error ? 'error' : 'ok'}`)
}
