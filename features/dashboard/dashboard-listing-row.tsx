import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { listingStatusLabels } from '@/lib/format'
import { formatPrice } from '@/lib/format'
import type { Listing } from '@/lib/supabase/database.types'
import { updateOwnedListing, updateOwnedListingStatus } from '@/app/dashboard/actions'
import { DeleteDraftButton } from './delete-draft-button'

export function DashboardListingRow({ listing }: { listing: Listing }) {
  return (
    <article className="rounded-2xl border border-line bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-ink">{listing.title}</h3><Badge variant={listing.status === 'published' ? 'default' : 'secondary'}>{listingStatusLabels[listing.status]}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{listing.city}{listing.neighborhood ? ` · ${listing.neighborhood}` : ''} · {formatPrice(listing.price_eur)}</p></div><div className="flex items-center gap-2">{listing.status === 'published' ? <Link aria-label={`Отвори обявата ${listing.title}`} className="rounded-lg p-2 text-muted-foreground hover:bg-subtle hover:text-brand" href={`/imoti/${listing.slug}`}><ExternalLink aria-hidden size={16} /></Link> : null}<Link className="btn-secondary min-h-9 px-3 text-xs" href={`/dashboard/obavi/${listing.id}`}>Редактирай</Link></div></div>
      <form action={updateOwnedListing} className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px_auto] sm:items-end"><input name="id" type="hidden" value={listing.id} /><FieldGroup className="contents"><Field><FieldLabel htmlFor={`title-${listing.id}`}>Заглавие</FieldLabel><Input id={`title-${listing.id}`} maxLength={120} minLength={10} name="title" required defaultValue={listing.title} /></Field><Field><FieldLabel htmlFor={`price-${listing.id}`}>Цена (€)</FieldLabel><Input id={`price-${listing.id}`} min="1" name="price_eur" required step="1" type="number" defaultValue={listing.price_eur} /></Field></FieldGroup><Button className="min-h-10" size="sm" type="submit">Запази</Button></form>
      {(listing.status === 'published' || listing.status === 'archived') ? <form action={updateOwnedListingStatus} className="mt-4 flex flex-wrap items-center gap-2"><input name="id" type="hidden" value={listing.id} />{listing.status === 'published' ? <><Button name="status" size="sm" type="submit" value="archived" variant="outline">Архивирай</Button><Button name="status" size="sm" type="submit" value="sold" variant="outline">Отбележи като продаден</Button></> : <Button name="status" size="sm" type="submit" value="draft" variant="outline">Върни в чернови</Button>}</form> : null}
      {listing.status === 'draft' ? <div className="mt-4"><DeleteDraftButton listingId={listing.id} /></div> : null}
      {listing.status === 'pending_review' ? <p className="mt-4 rounded-xl bg-subtle px-4 py-3 text-xs leading-5 text-muted-foreground">Обявата ще стане видима след одобрение от модератор.</p> : null}
    </article>
  )
}
