import type { Metadata } from 'next'
import { AuthForm } from '@/features/auth/auth-form'

export const metadata: Metadata = { title: 'Вход', robots: { index: false, follow: false } }

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; verified?: string }> }) {
  const { next, verified } = await searchParams
  return (
    <main className="site-container min-h-[72vh] py-14 sm:py-20" id="main-content">
      <div className="mx-auto grid max-w-5xl overflow-hidden rounded-[2rem] border border-line bg-white shadow-sm md:grid-cols-[0.85fr_1.15fr]">
        <div className="hidden flex-col justify-between bg-ink p-10 text-white md:flex"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#f1c77d]">Добре дошъл отново</p><h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em]">Продължи оттам, където спря.</h1><p className="mt-4 text-sm leading-6 text-white/70">Запазените имоти и разговорите ти са на едно място.</p></div><p className="text-xs text-white/50">Imoteasy — намери своето място.</p></div>
        <div className="p-7 sm:p-10"><p className="eyebrow">Вход</p><h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Влез в профила си</h2><p className="mb-8 mt-2 text-sm text-muted-foreground">{verified ? 'Имейлът е потвърден. Влез, за да продължиш.' : 'Радваме се, че си отново тук.'}</p><AuthForm mode="sign-in" next={next} /></div>
      </div>
    </main>
  )
}
