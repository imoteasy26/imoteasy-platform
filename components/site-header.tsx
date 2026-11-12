import Link from 'next/link'
import { ArrowUpRight, Building2 } from 'lucide-react'

export function SiteHeader() {
  return (
    <header className="relative z-20 border-b border-line bg-paper">
      <div className="site-container flex min-h-[76px] items-center justify-between gap-5">
        <Link aria-label="Imoteasy — начална страница" className="flex items-center gap-2.5" href="/">
          <span className="grid size-10 place-items-center rounded-xl bg-brand text-white"><Building2 aria-hidden size={20} /></span>
          <span className="text-[1.35rem] font-bold tracking-[-0.06em] text-ink">imoteasy<span className="text-brand">.</span></span>
        </Link>
        <nav aria-label="Основна навигация" className="hidden items-center gap-8 text-sm font-semibold text-ink/75 md:flex">
          <Link className="transition hover:text-brand" href="/imoti">Имоти</Link>
          <Link className="transition hover:text-brand" href="/#kak-raboti">Как работи</Link>
          <Link className="transition hover:text-brand" href="/#za-nas">За нас</Link>
          <Link className="transition hover:text-brand" href="/broker">За брокери</Link>
        </nav>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-ink/75 transition hover:text-brand sm:inline-flex" href="/auth/sign-in">Вход</Link>
          <Link className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-ink" href="/publish">
            Публикувай <ArrowUpRight aria-hidden size={16} />
          </Link>
        </div>
      </div>
      <nav aria-label="Мобилна навигация" className="site-container flex gap-5 overflow-x-auto pb-3 text-xs font-semibold text-ink/70 md:hidden">
        <Link href="/imoti">Имоти</Link><Link href="/#kak-raboti">Как работи</Link><Link href="/broker">За брокери</Link><Link href="/auth/sign-in">Вход</Link>
      </nav>
    </header>
  )
}
