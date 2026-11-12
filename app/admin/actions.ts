'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { reviewListingImagesForPublication } from '@/lib/listing-alt-text'
import { createClient } from '@/lib/supabase/server'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/sign-in?next=%2Fadmin')
  const { data: profile } = await supabase.from('profiles').select('account_type').eq('id', user.id).maybeSingle()
  if (profile?.account_type !== 'admin') redirect('/dashboard')
  return supabase
}

export async function moderateListing(formData: FormData) {
  const parsed = z.object({ id: z.string().uuid(), decision: z.enum(['approve', 'reject']) }).safeParse(Object.fromEntries(formData))
  if (!parsed.success) redirect('/admin?updated=error')
  const supabase = await requireAdmin()
  const approved = parsed.data.decision === 'approve'

  if (approved) {
    const { data: images, error: imagesError } = await supabase
      .from('listing_images')
      .select('id, alt_text, is_decorative')
      .eq('listing_id', parsed.data.id)
    if (imagesError || !images) redirect('/admin?updated=error')
    const review = reviewListingImagesForPublication(images)
    if (review.missingAltImageIds.length) redirect('/admin?updated=alt_required')
  }

  const { error } = await supabase.from('listings').update({ status: approved ? 'published' : 'rejected', published_at: approved ? new Date().toISOString() : null }).eq('id', parsed.data.id).eq('status', 'pending_review')
  revalidatePath('/admin')
  revalidatePath('/imoti')
  redirect(`/admin?updated=${error ? 'error' : 'ok'}`)
}

export async function reviewReport(formData: FormData) {
  const parsed = z.object({ id: z.string().uuid(), status: z.enum(['reviewed', 'actioned']) }).safeParse(Object.fromEntries(formData))
  if (!parsed.success) redirect('/admin?updated=error')
  const supabase = await requireAdmin()
  const { error } = await supabase.from('listing_reports').update({ status: parsed.data.status }).eq('id', parsed.data.id)
  revalidatePath('/admin')
  redirect(`/admin?updated=${error ? 'error' : 'ok'}`)
}
