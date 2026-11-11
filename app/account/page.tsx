import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { updateProfile } from './actions'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Настройки на профила', robots: { index: false, follow: false } }

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ updated?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/sign-in?next=%2Faccount')
  const [{ data: profile }, query] = await Promise.all([supabase.from('profiles').select('display_name, phone, account_type').eq('id', user.id).maybeSingle(), searchParams])
  return <main className="site-container min-h-[72vh] py-10 sm:py-14" id="main-content"><div className="mx-auto max-w-2xl"><p className="eyebrow">Настройки</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Профил</h1><p className="mt-2 text-sm text-muted-foreground">Имейлът ти остава личен. Можеш да редактираш името и телефона си.</p>{query.updated ? <p aria-live="polite" className="mt-5 rounded-xl bg-subtle p-4 text-sm">{query.updated === 'ok' ? 'Промените са запазени.' : 'Не успяхме да запазим промените.'}</p> : null}<form action={updateProfile} className="mt-6 rounded-2xl border border-line bg-white p-6 sm:p-8"><FieldGroup className="flex flex-col gap-5"><Field><FieldLabel htmlFor="display_name">Име</FieldLabel><Input autoComplete="name" defaultValue={profile?.display_name ?? ''} id="display_name" maxLength={100} minLength={2} name="display_name" required /></Field><Field><FieldLabel htmlFor="phone">Телефон <span className="font-normal text-muted-foreground">(личен)</span></FieldLabel><Input autoComplete="tel" defaultValue={profile?.phone ?? ''} id="phone" maxLength={40} name="phone" type="tel" /></Field><Field><FieldLabel htmlFor="email">Имейл</FieldLabel><Input defaultValue={user.email ?? ''} disabled id="email" type="email" /></Field></FieldGroup><Button className="mt-6" type="submit">Запази промените</Button></form></div></main>
}
