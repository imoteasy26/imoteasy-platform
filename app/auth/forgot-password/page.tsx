import type { Metadata } from 'next'
import Link from 'next/link'
import { PasswordRecoveryForm } from '@/features/auth/password-recovery-form'

export const metadata: Metadata = { title: 'Забравена парола', robots: { index: false, follow: false } }

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ expired?: string }> }) {
  const { expired } = await searchParams
  return (
    <main className="site-container min-h-[72vh] py-14 sm:py-20" id="main-content">
      <div className="mx-auto max-w-xl rounded-[2rem] border border-line bg-white p-7 shadow-sm sm:p-10">
        <p className="eyebrow">Възстановяване</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Забравена парола</h1>
        <p className="mb-8 mt-2 text-sm leading-6 text-muted-foreground">Ще изпратим защитена връзка за създаване на нова парола.</p>
        <PasswordRecoveryForm expired={expired === '1'} mode="request" />
      </div>
    </main>
  )
}
