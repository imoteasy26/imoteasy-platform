import type { Metadata } from 'next'
import { AuthForm } from '@/features/auth/auth-form'

export const metadata: Metadata = { title: 'Създай профил', robots: { index: false, follow: false } }

export default function SignUpPage() {
  return (
    <main className="site-container min-h-[72vh] py-14 sm:py-20" id="main-content">
      <div className="mx-auto max-w-xl rounded-[2rem] border border-line bg-white p-7 shadow-sm sm:p-10">
        <p className="eyebrow">Нова стъпка</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Създай профил</h1><p className="mb-8 mt-2 text-sm leading-6 text-muted-foreground">Запазвай любими имоти, свързвай се с продавачи и управлявай своите обяви.</p>
        <AuthForm mode="sign-up" />
        <p className="mt-6 text-xs leading-5 text-muted-foreground">С регистрацията потвърждаваш, че използваш реален имейл и ще споделяш точна информация в обявите си.</p>
      </div>
    </main>
  )
}
