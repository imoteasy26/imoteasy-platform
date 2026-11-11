'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

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
