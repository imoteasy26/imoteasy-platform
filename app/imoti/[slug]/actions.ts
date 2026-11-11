'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const inquirySchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().max(40).optional(),
  message: z.string().trim().min(10).max(3000),
})
const reportSchema = z.object({
  reason: z.enum(['incorrect', 'duplicate', 'fraud', 'inappropriate', 'other']),
  details: z.string().trim().max(2000).optional(),
})

export async function createInquiry(listingId: string, slug: string, formData: FormData) {
  const safeId = z.string().uuid().safeParse(listingId)
  const safeSlug = z.string().regex(/^[a-z0-9-]{1,140}$/).safeParse(slug)
  const parsed = inquirySchema.safeParse(Object.fromEntries(formData))
  if (!safeId.success || !safeSlug.success || !parsed.success) redirect('/imoti')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/auth/sign-in?next=${encodeURIComponent(`/imoti/${safeSlug.data}`)}`)

  const { error } = await supabase.from('inquiries').insert({
    listing_id: safeId.data,
    sender_id: user.id,
    name: parsed.data.name,
    email: parsed.data.email,
    phone: parsed.data.phone || null,
    message: parsed.data.message,
  })
  if (error) redirect(`/imoti/${safeSlug.data}?contact=error`)
  revalidatePath(`/imoti/${safeSlug.data}`)
  redirect(`/imoti/${safeSlug.data}?contact=sent`)
}

export async function reportListing(listingId: string, slug: string, formData: FormData) {
  const safeId = z.string().uuid().safeParse(listingId)
  const safeSlug = z.string().regex(/^[a-z0-9-]{1,140}$/).safeParse(slug)
  const parsed = reportSchema.safeParse(Object.fromEntries(formData))
  if (!safeId.success || !safeSlug.success || !parsed.success) redirect('/imoti')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/auth/sign-in?next=${encodeURIComponent(`/imoti/${safeSlug.data}`)}`)
  const { error } = await supabase.from('listing_reports').insert({
    listing_id: safeId.data,
    reporter_id: user.id,
    reason: parsed.data.reason,
    details: parsed.data.details || null,
  })
  redirect(`/imoti/${safeSlug.data}?report=${error ? 'error' : 'sent'}`)
}
