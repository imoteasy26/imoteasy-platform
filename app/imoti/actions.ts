'use server'

import { createHash } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { describeSavedSearch, hasSavedSearchCriteria, parseSavedSearchFilters } from '@/lib/saved-searches'

export async function saveSearch(input: unknown) {
  const parsed = parseSavedSearchFilters(input)
  if (!parsed.success || !hasSavedSearchCriteria(parsed.data)) {
    return { success: false as const, code: 'invalid' as const }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false as const, code: 'sign-in' as const }

  const filterHash = createHash('sha256').update(JSON.stringify(parsed.data)).digest('hex')
  const { error } = await supabase.from('saved_searches').upsert({
    user_id: user.id,
    name: describeSavedSearch(parsed.data),
    filters: parsed.data,
    filter_hash: filterHash,
    enabled: true,
  }, { onConflict: 'user_id,filter_hash' })

  if (error) {
    const migrationMissing = ['42P01', '42703', 'PGRST204', 'PGRST205'].includes(error.code)
    return { success: false as const, code: migrationMissing ? 'migration-required' as const : 'error' as const }
  }

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/saved-searches')
  return { success: true as const }
}
