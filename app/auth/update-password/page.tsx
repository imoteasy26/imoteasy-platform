import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { PasswordRecoveryForm } from '@/features/auth/password-recovery-form'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Смяна на парола', robots: { index: false, follow: false } }

export default async function UpdatePasswordPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/forgot-password?expired=1')

  return (
    <main className="site-container min-h-[72vh] py-14 sm:py-20" id="main-content">
      <div className="mx-auto max-w-xl rounded-[2rem] border border-line bg-white p-7 shadow-sm sm:p-10">
        <p className="eyebrow">Защита на профила</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Създай нова парола</h1>
        <p className="mb-8 mt-2 text-sm leading-6 text-muted-foreground">Избери парола, която не използваш в други сайтове.</p>
        <PasswordRecoveryForm mode="update" />
      </div>
    </main>
  )
}
