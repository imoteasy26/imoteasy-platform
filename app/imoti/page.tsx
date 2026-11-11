import type { Metadata } from 'next'
import Link from 'next/link'
import { Search, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/empty-state'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ListingCard } from '@/features/listings/listing-card'
import { MapToggle } from '@/features/listings/map-toggle'
import { searchListings, type ListingFilters } from '@/lib/listings'

export const metadata: Metadata = { title: 'Имоти за продажба и под наем', description: 'Търси имоти по град, цена, площ, тип и още критерии в Imoteasy.' }
type SearchParams = Record<string, string | string[] | undefined>

function one(params: SearchParams, key: string) { const value = params[key]; return Array.isArray(value) ? value[0] : value }
function numberParam(params: SearchParams, key: string) {
  const value = one(params, key)
  if (!value || value.length > 16) return undefined
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 && number <= 1_000_000_000 ? number : undefined
}
function pageHref(params: SearchParams, page: number) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value && key !== 'page') query.set(key, Array.isArray(value) ? value[0] : value)
  query.set('page', String(page))
  return `/imoti?${query.toString()}`
}

export default async function ListingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const propertyType = one(params, 'property_type')
  const transactionType = one(params, 'transaction_type')
  const sort = one(params, 'sort')
  const page = Math.max(1, Number(one(params, 'page')) || 1)
  const filters: ListingFilters = {
    city: one(params, 'city')?.trim().slice(0, 100) || undefined,
    neighborhood: one(params, 'neighborhood')?.trim().slice(0, 100) || undefined,
    propertyType: ['apartment', 'house', 'land', 'office', 'shop', 'warehouse', 'other'].includes(propertyType ?? '') ? propertyType as ListingFilters['propertyType'] : undefined,
    transactionType: ['sale', 'rent'].includes(transactionType ?? '') ? transactionType as ListingFilters['transactionType'] : undefined,
    minPrice: numberParam(params, 'min_price'), maxPrice: numberParam(params, 'max_price'),
    minArea: numberParam(params, 'min_area'), maxArea: numberParam(params, 'max_area'),
    rooms: numberParam(params, 'rooms'), bedrooms: numberParam(params, 'bedrooms'), floor: numberParam(params, 'floor'),
    condition: one(params, 'condition')?.trim().slice(0, 80) || undefined,
    furnishing: one(params, 'furnishing')?.trim().slice(0, 80) || undefined,
    constructionType: one(params, 'construction_type')?.trim().slice(0, 80) || undefined,
    sort: ['price_asc', 'price_desc'].includes(sort ?? '') ? sort as ListingFilters['sort'] : 'newest',
  }
  const result = await searchListings(filters, page)

  return (
    <main className="site-container min-h-[70vh] py-10 sm:py-14" id="main-content">
      <div className="mb-8"><p className="eyebrow">Търсене</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-ink sm:text-4xl">Намери своя имот</h1><p className="mt-2 text-sm text-muted-foreground">Филтрирай обявите и сравни това, което има значение за теб.</p></div>
      <form action="/imoti" className="mb-8 rounded-2xl border border-line bg-white p-4 sm:p-6" method="get">
        <FieldGroup className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
          <Field><FieldLabel htmlFor="city">Град</FieldLabel><Input autoComplete="address-level2" defaultValue={filters.city} id="city" name="city" placeholder="София" /></Field>
          <Field><FieldLabel htmlFor="neighborhood">Квартал</FieldLabel><Input defaultValue={filters.neighborhood} id="neighborhood" name="neighborhood" placeholder="Лозенец" /></Field>
          <Field><FieldLabel htmlFor="transaction_type">Сделка</FieldLabel><select className="form-control" defaultValue={filters.transactionType ?? ''} id="transaction_type" name="transaction_type"><option value="">Всички</option><option value="sale">Покупка</option><option value="rent">Наем</option></select></Field>
          <Field><FieldLabel htmlFor="property_type">Тип имот</FieldLabel><select className="form-control" defaultValue={filters.propertyType ?? ''} id="property_type" name="property_type"><option value="">Всички типове</option><option value="apartment">Апартамент</option><option value="house">Къща</option><option value="land">Парцел</option><option value="office">Офис</option><option value="shop">Магазин</option><option value="warehouse">Склад</option><option value="other">Друг</option></select></Field>
          <Field><FieldLabel htmlFor="min_price">Цена от (€)</FieldLabel><Input defaultValue={one(params, 'min_price')} id="min_price" min="0" name="min_price" type="number" /></Field>
          <Field><FieldLabel htmlFor="max_price">Цена до (€)</FieldLabel><Input defaultValue={one(params, 'max_price')} id="max_price" min="0" name="max_price" type="number" /></Field>
          <Field><FieldLabel htmlFor="min_area">Площ от (м²)</FieldLabel><Input defaultValue={one(params, 'min_area')} id="min_area" min="0" name="min_area" type="number" /></Field>
          <Field><FieldLabel htmlFor="max_area">Площ до (м²)</FieldLabel><Input defaultValue={one(params, 'max_area')} id="max_area" min="0" name="max_area" type="number" /></Field>
          <Field><FieldLabel htmlFor="rooms">Стаи</FieldLabel><Input defaultValue={one(params, 'rooms')} id="rooms" max="30" min="0" name="rooms" type="number" /></Field>
          <Field><FieldLabel htmlFor="bedrooms">Спални</FieldLabel><Input defaultValue={one(params, 'bedrooms')} id="bedrooms" max="30" min="0" name="bedrooms" type="number" /></Field>
          <Field><FieldLabel htmlFor="floor">Етаж</FieldLabel><Input defaultValue={one(params, 'floor')} id="floor" max="200" min="-5" name="floor" type="number" /></Field>
          <Field><FieldLabel htmlFor="construction_type">Строителство</FieldLabel><Input defaultValue={one(params, 'construction_type')} id="construction_type" name="construction_type" placeholder="Тухла, панел…" /></Field>
          <Field><FieldLabel htmlFor="condition">Състояние</FieldLabel><Input defaultValue={one(params, 'condition')} id="condition" name="condition" placeholder="Ново, за ремонт…" /></Field>
          <Field><FieldLabel htmlFor="furnishing">Обзавеждане</FieldLabel><Input defaultValue={one(params, 'furnishing')} id="furnishing" name="furnishing" placeholder="Обзаведен…" /></Field>
          <Field><FieldLabel htmlFor="sort">Подреди</FieldLabel><select className="form-control" defaultValue={filters.sort} id="sort" name="sort"><option value="newest">Най-нови</option><option value="price_asc">Цена: ниска към висока</option><option value="price_desc">Цена: висока към ниска</option></select></Field>
        </FieldGroup>
        <div className="mt-5 flex flex-wrap items-center gap-3"><Button className="rounded-xl" type="submit"><Search data-icon="inline-start" />Покажи резултати</Button><Link className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-muted-foreground hover:bg-subtle" href="/imoti"><SlidersHorizontal aria-hidden size={15} />Изчисти филтрите</Link></div>
      </form>
      <div className="mb-4 flex items-center justify-between gap-4"><p className="text-sm text-muted-foreground">{result.error ? 'Не успяхме да заредим обявите.' : `${result.total} ${result.total === 1 ? 'обява' : 'обяви'}`}</p><span className="text-xs text-muted-foreground">Цените са в евро</span></div>
      {result.error ? <div className="rounded-2xl bg-subtle p-6 text-sm text-ink">Възникна временен проблем при зареждането. Опитай отново.</div> : result.listings.length ? <MapToggle listings={result.listings} list={<div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{result.listings.map((listing) => <ListingCard key={listing.id} listing={listing} />)}</div>} /> : <EmptyState description="Опитай да промениш критериите или се върни по-късно — нови обяви се добавят след преглед." title="Няма резултати за тези критерии" />}
      {(page > 1 || result.hasNextPage) ? <nav aria-label="Страници с резултати" className="mt-8 flex justify-center gap-3">{page > 1 ? <Link className="btn-secondary" href={pageHref(params, page - 1)}>Назад</Link> : null}{result.hasNextPage ? <Link className="btn-primary" href={pageHref(params, page + 1)}>Още обяви</Link> : null}</nav> : null}
    </main>
  )
}
