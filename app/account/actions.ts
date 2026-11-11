'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const profileSchema = z.object({ display_name: z.string().trim().min(2).max(100), phone: z.string().trim().max(40).optional() })

export async function updateProfile(formData: FormData) {
  const parsed = profileSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) redirect('/account?updated=error')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/sign-in?next=%2Faccount')
  const [{ error: profileError }, { error: privateDetailsError }] = await Promise.all([
    supabase.from('profiles').update({ display_name: parsed.data.display_name }).eq('id', user.id),
    supabase.from('private_profile_details').upsert(
      { user_id: user.id, phone: parsed.data.phone || null },
      { onConflict: 'user_id' },
    ),
  ])
  revalidatePath('/account')
  revalidatePath('/dashboard')
  redirect(`/account?updated=${profileError || privateDetailsError ? 'error' : 'ok'}`)
}
