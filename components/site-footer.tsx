import Link from 'next/link'
import { Building2 } from 'lucide-react'

export function SiteFooter() {
  return (
    <footer className="bg-ink text-white">
      <div className="site-container grid gap-10 py-12 md:grid-cols-[1.5fr_1fr_1fr] md:py-16">
        <div>
          <Link aria-label="Imoteasy — начална страница" className="inline-flex items-center gap-2.5" href="/">
            <span className="grid size-9 place-items-center rounded-xl bg-white/10"><Building2 aria-hidden size={18} /></span>
            <span className="text-xl font-bold tracking-[-0.05em]">imoteasy<span className="text-sun">.</span></span>
          </Link>
          <p className="mt-4 max-w-sm text-sm leading-6 text-white/65">По-лесният начин да намериш мястото, което ще наречеш свое.</p>
        </div>
        <div>
          <p className="text-sm font-semibold">Разгледай</p>
          <div className="mt-4 flex flex-col gap-3 text-sm text-white/65"><Link className="hover:text-white" href="/imoti">Всички имоти</Link><Link className="hover:text-white" href="/publish">Публикувай обява</Link><Link className="hover:text-white" href="/dashboard">Моят профил</Link></div>
        </div>
        <div>
          <p className="text-sm font-semibold">Насоки</p>
          <div className="mt-4 flex flex-col gap-3 text-sm text-white/65"><Link className="hover:text-white" href="/#kak-raboti">Как работи</Link><a className="hover:text-white" href="mailto:hello@imoteasy.bg">Свържи се с нас</a></div>
        </div>
      </div>
      <div className="border-t border-white/10"><div className="site-container flex flex-col gap-2 py-5 text-xs text-white/50 sm:flex-row sm:items-center sm:justify-between"><span>© {new Date().getFullYear()} Imoteasy. Всички права запазени.</span><span>Създадено с мисъл за по-лесно търсене.</span></div></div>
    </footer>
  )
}
