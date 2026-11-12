import Image from 'next/image'
import Link from 'next/link'
import { BedDouble, MapPin, Ruler, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { formatArea, formatPrice, propertyTypeLabels, transactionLabels } from '@/lib/format'
import { listingImageAltAttribute } from '@/lib/listing-alt-text'
import type { ListingWithImages } from '@/lib/listing-types'
import { FavoriteButton } from './favorite-button'

export function ListingCard({ listing, initiallySaved = false }: { listing: ListingWithImages; initiallySaved?: boolean }) {
  const cover = listing.images.find((image) => image.is_cover) ?? listing.images[0]
  const photoUrl = cover?.signed_url ?? ''

  return (
    <Card className="property-card group relative gap-0 overflow-hidden border-line p-0 shadow-none">
      <div className="property-image relative">
        {photoUrl ? (
          <Image alt={listingImageAltAttribute(cover)} className="object-cover transition duration-500 group-hover:scale-[1.035]" fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" src={photoUrl} />
        ) : (
          <div aria-hidden className="grid size-full place-items-center text-brand/45"><Sparkles size={30} strokeWidth={1.4} /></div>
        )}
        <div className="absolute left-3 top-3 flex gap-2">
          <Badge className="border-0 bg-white/95 text-ink shadow-sm hover:bg-white">{transactionLabels[listing.transaction_type]}</Badge>
        </div>
        <FavoriteButton className="absolute right-3 top-3" initiallySaved={initiallySaved} listingId={listing.id} />
      </div>
      <CardContent className="flex flex-col gap-3 p-4 sm:p-5">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><MapPin aria-hidden size={14} /><span>{[listing.neighborhood, listing.city].filter(Boolean).join(', ')}</span></div>
        <Link className="line-clamp-2 min-h-12 text-base font-semibold leading-6 tracking-[-0.02em] text-ink transition hover:text-brand" href={`/imoti/${listing.slug}`}>{listing.title}</Link>
        <div className="flex items-end justify-between gap-3">
          <div><p className="text-lg font-bold tracking-[-0.04em] text-brand">{formatPrice(listing.price_eur)}</p><p className="mt-0.5 text-xs text-muted-foreground">{propertyTypeLabels[listing.property_type]}</p></div>
          <div className="flex shrink-0 items-center gap-3 text-xs font-medium text-muted-foreground"><span className="inline-flex items-center gap-1"><Ruler aria-hidden size={14} />{formatArea(listing.area_sqm)}</span>{listing.bedrooms ? <span className="inline-flex items-center gap-1"><BedDouble aria-hidden size={14} />{listing.bedrooms}</span> : null}</div>
        </div>
      </CardContent>
    </Card>
  )
}
