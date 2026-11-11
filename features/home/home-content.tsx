import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, BadgeCheck, Compass, ShieldCheck, Sparkles } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import type { ListingWithImages } from '@/lib/listing-types'
import { ListingCard } from '@/features/listings/listing-card'
import { HomeSearch } from './home-search'

export function HomeContent({ listings }: { listings: ListingWithImages[] }) {
  return (
    <main id="main-content">
      <section className="hero-surface">
        <Image alt="" aria-hidden className="-z-10 object-cover object-center" fill priority sizes="100vw" src="/images/imoteasy-hero.png" />
        <div className="site-container relative z-10 flex min-h-[620px] flex-col justify-center py-16 sm:py-20">
          <div className="max-w-[680px] text-white">
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-2 text-xs font-semibold tracking-wide text-white/90 backdrop-blur"><Sparkles aria-hidden size={14} /> По-лесно намиране. По-спокоен избор.</p>
            <h1 className="text-balance text-4xl font-semibold leading-[1.08] tracking-[-0.045em] sm:text-6xl">Мястото, което търсиш, е <span className="text-[#f1c77d]">по-близо.</span></h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-white/80 sm:text-lg">Разгледай внимателно подбрани обяви и намери имот, който пасва на твоя начин на живот.</p>
          </div>
          <div className="mt-9 max-w-[1060px]"><HomeSearch /></div>
          <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-white/75">
            <Link className="hover:text-white" href="/imoti?transaction_type=sale">За покупка</Link>
            <Link className="hover:text-white" href="/imoti?transaction_type=rent">Под наем</Link>
            <Link className="hover:text-white" href="/imoti?property_type=house">Къщи</Link>
            <Link className="hover:text-white" href="/imoti?property_type=apartment">Апартаменти</Link>
          </div>
        </div>
      </section>

      <section className="site-container grid gap-4 border-b border-line py-7 sm:grid-cols-3 sm:gap-8 sm:py-9">
        <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand"><ShieldCheck aria-hidden size={20} /></span><div><p className="font-semibold text-ink">Преглед преди публикуване</p><p className="mt-1 text-sm text-muted-foreground">Всяка нова обява минава през модерация.</p></div></div>
        <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand"><Compass aria-hidden size={20} /></span><div><p className="font-semibold text-ink">Търсене без излишен шум</p><p className="mt-1 text-sm text-muted-foreground">Филтрирай по място, цена и характеристики.</p></div></div>
        <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand"><BadgeCheck aria-hidden size={20} /></span><div><p className="font-semibold text-ink">Контакт директно с продавача</p><p className="mt-1 text-sm text-muted-foreground">Изпрати запитване през профила си.</p></div></div>
      </section>

      <section className="site-container section-space" id="imoti">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="eyebrow">От пазара</p><h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-ink sm:text-4xl">Най-новите обяви</h2><p className="mt-2 text-sm text-muted-foreground">Нови възможности, подредени за теб.</p></div>
          <Link className="inline-flex items-center gap-2 text-sm font-semibold text-brand hover:underline" href="/imoti">Всички имоти <ArrowRight aria-hidden size={16} /></Link>
        </div>
        {listings.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{listings.map((listing) => <ListingCard key={listing.id} listing={listing} />)}</div> : <EmptyState description="Щом бъдат публикувани първите имоти, ще ги откриеш тук. Можеш да започнеш с търсене или да добавиш своя обява." showPublish title="Все още няма публикувани имоти" />}
      </section>

      <section className="bg-white" id="kak-raboti">
        <div className="site-container section-space grid items-center gap-12 lg:grid-cols-[0.9fr_1.1fr]">
          <div><p className="eyebrow">Търси с яснота</p><h2 className="mt-3 text-3xl font-semibold tracking-[-0.045em] text-ink sm:text-4xl">По-малко скролване. Повече сигурност.</h2><p className="mt-4 max-w-lg text-base leading-7 text-muted-foreground">Imoteasy събира важните детайли на едно място — за да сравняваш спокойно и да говориш директно с човека зад обявата.</p><Link className="btn-primary mt-7" href="/imoti">Разгледай имотите <ArrowRight aria-hidden size={16} /></Link></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <article className="rounded-2xl bg-paper p-6"><span className="text-sm font-bold text-brand">01</span><h3 className="mt-8 font-semibold text-ink">Опиши какво търсиш</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Използвай филтри за бюджет, тип и район.</p></article>
            <article className="rounded-2xl bg-subtle p-6 sm:mt-10"><span className="text-sm font-bold text-brand">02</span><h3 className="mt-8 font-semibold text-ink">Сравни внимателно</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Запази фаворитите си и виж детайлите.</p></article>
            <article className="rounded-2xl bg-subtle p-6"><span className="text-sm font-bold text-brand">03</span><h3 className="mt-8 font-semibold text-ink">Свържи се директно</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Изпрати запитване за оглед или въпрос.</p></article>
            <article className="rounded-2xl bg-brand p-6 text-white sm:mt-10"><span className="text-sm font-bold text-white/70">04</span><h3 className="mt-8 font-semibold">Намери своето място</h3><p className="mt-2 text-sm leading-6 text-white/75">Без бързане. С повече увереност.</p></article>
          </div>
        </div>
      </section>

      <section className="site-container section-space" id="za-nas">
        <div className="flex flex-col justify-between gap-8 rounded-[2rem] bg-ink px-7 py-10 text-white sm:px-12 sm:py-14 lg:flex-row lg:items-center">
          <div className="max-w-2xl"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#f1c77d]">Твоят имот също има място тук</p><h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Публикувай без усложнения.</h2><p className="mt-3 max-w-xl text-sm leading-6 text-white/70">Добави подробности, снимки и локация. След преглед обявата ти ще бъде видима за търсещите.</p></div>
          <Link className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#f1c77d] px-5 font-semibold text-ink transition hover:bg-white" href="/publish">Добави имот <ArrowRight aria-hidden size={17} /></Link>
        </div>
      </section>
    </main>
  )
}
