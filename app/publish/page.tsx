import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { PublishWizard } from '@/features/listings/publish-wizard'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Публикувай имот', description: 'Добави своя имот в Imoteasy.' }

export default async function PublishPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/sign-in?next=%2Fpublish')
  return <main className="site-container min-h-[75vh] py-10 sm:py-14" id="main-content"><div className="mb-8"><p className="eyebrow">Добави обява</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-ink sm:text-4xl">Публикувай имот</h1><p className="mt-2 text-sm text-muted-foreground">Попълни информацията стъпка по стъпка. Черновата ти се изпраща за преглед.</p></div><PublishWizard /></main>
}
