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
  utm_source: z.string().trim().max(120).optional(),
  utm_medium: z.string().trim().max(120).optional(),
  utm_campaign: z.string().trim().max(160).optional(),
  utm_content: z.string().trim().max(160).optional(),
  utm_term: z.string().trim().max(160).optional(),
  referral_code: z.string().trim().max(100).optional(),
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
  const { data: listing } = await supabase.from('listings').select('id')
    .eq('id', safeId.data).eq('slug', safeSlug.data).eq('status', 'published').maybeSingle()
  if (!listing) redirect(`/imoti/${safeSlug.data}?contact=error`)

  const { data: inquiry, error } = await supabase.from('inquiries').insert({
    listing_id: safeId.data,
    sender_id: user.id,
    name: parsed.data.name,
    email: parsed.data.email,
    phone: parsed.data.phone || null,
    message: parsed.data.message,
  }).select('id').maybeSingle()
  if (error || !inquiry) redirect(`/imoti/${safeSlug.data}?contact=error`)

  await supabase.rpc('capture_inquiry_attribution', {
    p_inquiry_id: inquiry.id,
    p_channel: 'marketplace_inquiry',
    p_source: parsed.data.utm_source || null,
    p_medium: parsed.data.utm_medium || null,
    p_campaign: parsed.data.utm_campaign || null,
    p_content: parsed.data.utm_content || null,
    p_term: parsed.data.utm_term || null,
    p_referral_code: parsed.data.referral_code || null,
    p_referrer_host: null,
  })
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
  const { data: listing } = await supabase.from('listings').select('id')
    .eq('id', safeId.data).eq('slug', safeSlug.data).eq('status', 'published').maybeSingle()
  if (!listing) redirect(`/imoti/${safeSlug.data}?report=error`)
  const { error } = await supabase.from('listing_reports').insert({
    listing_id: safeId.data,
    reporter_id: user.id,
    reason: parsed.data.reason,
    details: parsed.data.details || null,
  })
  redirect(`/imoti/${safeSlug.data}?report=${error ? 'error' : 'sent'}`)
}
