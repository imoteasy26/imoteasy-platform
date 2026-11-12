import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft, BedDouble, Building2, CalendarDays, CheckCircle2, MapPin, Ruler, TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FavoriteButton } from '@/features/listings/favorite-button'
import { formatArea, formatPrice, propertyTypeLabels, transactionLabels } from '@/lib/format'
import type { ListingWithImages } from '@/lib/listing-types'
import type { Tables } from '@/lib/supabase/database.types'
import { createInquiry, reportListing } from '@/app/imoti/[slug]/actions'

export function ListingDetail({ listing, signedIn, contactState, reportState, attribution }: { listing: ListingWithImages & { seller: { display_name: string; account_type: string; created_at: string } | null; priceHistory: Tables<'listing_price_history'>[]; priceHistoryAvailable: boolean }; signedIn: boolean; contactState?: string; reportState?: string; attribution: { utm_source?: string; utm_medium?: string; utm_campaign?: string; utm_content?: string; utm_term?: string; referral_code?: string } }) {
  const images = listing.images.filter((image) => Boolean(image.signed_url))
  const displayImages = images
  const cover = displayImages.find((image) => image.is_cover) ?? displayImages[0]
  const detailRows = [
    ['Тип имот', propertyTypeLabels[listing.property_type]], ['Площ', formatArea(listing.area_sqm)],
    ['Стаи', listing.rooms ?? '—'], ['Спални', listing.bedrooms ?? '—'],
    ['Етаж', listing.floor === null ? '—' : `${listing.floor}${listing.total_floors ? ` от ${listing.total_floors}` : ''}`],
    ['Строителство', listing.construction_type || '—'], ['Състояние', listing.condition || '—'], ['Обзавеждане', listing.furnishing || '—'],
  ] as const

  return (
    <main className="site-container py-8 sm:py-12" id="main-content">
      <Link className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-brand" href="/imoti"><ArrowLeft aria-hidden size={16} />Назад към обявите</Link>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section>
          <div className="relative overflow-hidden rounded-[1.5rem] bg-subtle">
            {cover ? <Image alt={cover.alt_text || listing.title} className="max-h-[560px] w-full object-cover" height={900} priority sizes="(max-width: 1024px) 100vw, 70vw" src={cover.signed_url} width={1400} /> : <div className="grid min-h-[300px] place-items-center text-sm text-muted-foreground">Към тази обява все още няма снимки.</div>}
            <FavoriteButton className="absolute right-4 top-4" listingId={listing.id} />
          </div>
          {displayImages.length > 1 ? <div aria-label="Снимки на имота" className="mt-3 grid grid-cols-4 gap-3">{displayImages.slice(1, 5).map((image) => <div className="relative aspect-[1.4] overflow-hidden rounded-xl bg-subtle" key={image.id}><Image alt={image.alt_text || listing.title} className="object-cover" fill sizes="25vw" src={image.signed_url} /></div>)}</div> : null}
          <div className="mt-7 flex flex-wrap items-center gap-2"><Badge>{transactionLabels[listing.transaction_type]}</Badge><Badge variant="secondary">{propertyTypeLabels[listing.property_type]}</Badge></div>
          <h1 className="mt-4 text-3xl font-semibold leading-tight tracking-[-0.04em] text-ink sm:text-4xl">{listing.title}</h1>
          <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><MapPin aria-hidden size={16} />{[listing.neighborhood, listing.city].filter(Boolean).join(', ')} <span aria-hidden>·</span> <span>Точният адрес се споделя лично.</span></p>
          <p className="mt-6 whitespace-pre-line text-base leading-7 text-ink/80">{listing.description}</p>
          <section aria-labelledby="details-heading" className="mt-9">
            <h2 className="text-xl font-semibold tracking-tight text-ink" id="details-heading">Характеристики</h2>
            <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3">{detailRows.map(([label, value]) => <div className="bg-white p-4" key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 font-semibold text-ink">{value}</dd></div>)}</dl>
          </section>
          {listing.priceHistory.length || !listing.priceHistoryAvailable ? <section aria-labelledby="price-history-heading" className="mt-9">
            <h2 className="text-xl font-semibold tracking-tight text-ink" id="price-history-heading">История на цената</h2>
            {listing.priceHistory.length ? <ol className="mt-4 flex flex-col gap-3">{listing.priceHistory.map((entry) => <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white p-4" key={entry.id}><div><p className="font-semibold text-ink">{entry.previous_price === null ? `Начална цена: ${formatPrice(entry.new_price)}` : `${formatPrice(entry.previous_price)} → ${formatPrice(entry.new_price)}`}</p><time className="mt-1 block text-xs text-muted-foreground" dateTime={entry.changed_at}>{new Intl.DateTimeFormat('bg-BG', { dateStyle: 'medium' }).format(new Date(entry.changed_at))}</time></div>{entry.previous_price !== null ? <Badge variant={entry.new_price < entry.previous_price ? 'default' : 'secondary'}>{entry.new_price < entry.previous_price ? 'Намаление' : 'Промяна'}</Badge> : null}</li>)}</ol> : <p role="status" className="mt-3 rounded-xl bg-subtle p-4 text-sm text-muted-foreground">Историята ще се активира след актуализацията на базата данни.</p>}
          </section> : null}
          {listing.latitude !== null && listing.longitude !== null ? <div className="mt-8 rounded-2xl border border-line bg-white p-5"><p className="flex items-center gap-2 font-semibold text-ink"><MapPin aria-hidden size={17} />Приблизителна локация</p><p className="mt-1 text-sm text-muted-foreground">Маркерът е ориентировъчен. Точният адрес не се показва на картата.</p><div className="mt-4 h-56 overflow-hidden rounded-xl bg-subtle"><iframe aria-label={`Карта за приблизителната локация в ${listing.city}`} className="h-full w-full border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade" src={`https://www.openstreetmap.org/export/embed.html?bbox=${listing.longitude - 0.01}%2C${listing.latitude - 0.01}%2C${listing.longitude + 0.01}%2C${listing.latitude + 0.01}&layer=mapnik&marker=${listing.latitude}%2C${listing.longitude}`} title={`Карта на ${listing.city}`} /></div></div> : null}
        </section>

        <aside className="flex flex-col gap-4">
          <Card className="sticky top-4 border-line shadow-sm">
            <CardHeader><p className="text-sm text-muted-foreground">Цена</p><CardTitle className="text-3xl font-bold tracking-[-0.05em] text-brand">{formatPrice(listing.price_eur)}</CardTitle><p className="text-sm text-muted-foreground">{formatPrice(listing.price_eur / listing.area_sqm)} / м²</p></CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-3 text-sm text-muted-foreground"><span className="inline-flex items-center gap-1.5"><Ruler aria-hidden size={16} />{formatArea(listing.area_sqm)}</span>{listing.bedrooms ? <span className="inline-flex items-center gap-1.5"><BedDouble aria-hidden size={16} />{listing.bedrooms} спални</span> : null}<span className="inline-flex items-center gap-1.5"><Building2 aria-hidden size={16} />{listing.city}</span></div>
              <div className="rounded-xl bg-subtle p-4"><p className="font-semibold text-ink">{listing.seller?.display_name || 'Собственик на имота'}</p><p className="mt-1 text-xs text-muted-foreground">{listing.seller?.account_type === 'agency' || listing.seller?.account_type === 'broker' ? 'Професионален профил' : 'Частен профил'}</p></div>
              {contactState === 'sent' ? <p aria-live="polite" className="rounded-xl bg-brand/10 p-3 text-sm text-brand"><CheckCircle2 aria-hidden className="mr-2 inline" size={16} />Запитването е изпратено.</p> : null}
              {contactState === 'error' ? <p aria-live="polite" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">Не успяхме да изпратим запитването. Опитай отново.</p> : null}
              {signedIn ? <form action={createInquiry.bind(null, listing.id, listing.slug)} className="flex flex-col gap-4"><input name="utm_source" type="hidden" value={attribution.utm_source ?? ''} /><input name="utm_medium" type="hidden" value={attribution.utm_medium ?? ''} /><input name="utm_campaign" type="hidden" value={attribution.utm_campaign ?? ''} /><input name="utm_content" type="hidden" value={attribution.utm_content ?? ''} /><input name="utm_term" type="hidden" value={attribution.utm_term ?? ''} /><input name="referral_code" type="hidden" value={attribution.referral_code ?? ''} /><FieldGroup className="flex flex-col gap-3"><Field><FieldLabel htmlFor="inquiry-name">Твоето име</FieldLabel><Input autoComplete="name" id="inquiry-name" maxLength={100} name="name" required /></Field><Field><FieldLabel htmlFor="inquiry-email">Имейл</FieldLabel><Input autoComplete="email" id="inquiry-email" maxLength={254} name="email" required type="email" /></Field><Field><FieldLabel htmlFor="inquiry-phone">Телефон <span className="font-normal text-muted-foreground">(по избор)</span></FieldLabel><Input autoComplete="tel" id="inquiry-phone" maxLength={40} name="phone" type="tel" /></Field><Field><FieldLabel htmlFor="inquiry-message">Съобщение</FieldLabel><Textarea id="inquiry-message" maxLength={3000} minLength={10} name="message" placeholder="Здравейте, интересувам се от този имот…" required rows={4} /></Field></FieldGroup><Button className="min-h-12 rounded-xl" type="submit">Изпрати запитване</Button></form> : <Link className="btn-primary w-full" href={`/auth/sign-in?next=${encodeURIComponent(`/imoti/${listing.slug}`)}`}>Влез, за да се свържеш</Link>}
              <p className="text-center text-xs leading-5 text-muted-foreground">Личният адрес и телефон не се показват публично.</p>
            </CardContent>
          </Card>
          <details className="rounded-2xl border border-line bg-white p-4">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-muted-foreground"><TriangleAlert aria-hidden size={16} />Сигнализирай за обявата</summary>
            {reportState === 'sent' ? <p className="mt-3 text-sm text-brand">Благодарим. Сигналът е изпратен за преглед.</p> : null}
            {reportState === 'error' ? <p className="mt-3 text-sm text-destructive">Не успяхме да изпратим сигнала.</p> : null}
            {signedIn ? <form action={reportListing.bind(null, listing.id, listing.slug)} className="mt-4 flex flex-col gap-3"><Field><FieldLabel htmlFor="report-reason">Причина</FieldLabel><select className="form-control" id="report-reason" name="reason" required><option value="incorrect">Неточна информация</option><option value="duplicate">Дублирана обява</option><option value="fraud">Подозрение за измама</option><option value="inappropriate">Неподходящо съдържание</option><option value="other">Друго</option></select></Field><Field><FieldLabel htmlFor="report-details">Детайли <span className="font-normal text-muted-foreground">(по избор)</span></FieldLabel><Textarea id="report-details" maxLength={2000} name="details" rows={3} /></Field><Button size="sm" type="submit" variant="outline">Изпрати сигнал</Button></form> : <Link className="mt-3 inline-block text-sm font-semibold text-brand hover:underline" href="/auth/sign-in">Влез, за да изпратиш сигнал</Link>}
          </details>
          <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground"><CalendarDays aria-hidden className="mt-0.5 shrink-0" size={14} />Публикувана {new Intl.DateTimeFormat('bg-BG', { dateStyle: 'long' }).format(new Date(listing.published_at ?? listing.created_at))}</p>
        </aside>
      </div>
    </main>
  )
}
