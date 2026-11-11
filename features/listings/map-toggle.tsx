'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { List, Map } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ListingWithImages } from '@/lib/listing-types'

const MapCanvas = dynamic(() => import('./map-canvas').then((module) => module.MapCanvas), {
  ssr: false,
  loading: () => <div aria-label="Картата се зарежда" className="grid h-[420px] place-items-center rounded-2xl bg-subtle text-sm text-muted-foreground">Зареждаме картата…</div>,
})

export function MapToggle({ listings, list }: { listings: ListingWithImages[]; list: React.ReactNode }) {
  const [showMap, setShowMap] = useState(false)
  const mappable = listings.filter((listing) => listing.latitude !== null && listing.longitude !== null)
  const mapListings = mappable.map((listing) => ({ id: listing.id, slug: listing.slug, title: listing.title, price: new Intl.NumberFormat('bg-BG', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(listing.price_eur), latitude: listing.latitude as number, longitude: listing.longitude as number }))

  return (
    <div>
      <div className="mb-5 flex justify-end">
        <Button onClick={() => setShowMap((value) => !value)} type="button" variant="outline">
          {showMap ? <List data-icon="inline-start" /> : <Map data-icon="inline-start" />}
          {showMap ? 'Покажи списък' : 'Покажи карта'}
        </Button>
      </div>
      {showMap ? (
        <div className="overflow-hidden rounded-2xl border border-line bg-white p-2">
          {mapListings.length ? <MapCanvas listings={mapListings} /> : <div className="mb-2 rounded-xl bg-subtle px-4 py-3 text-sm text-muted-foreground">За тези обяви няма маркирани координати. Точният адрес не се показва публично.</div>}
          {!mapListings.length ? <MapCanvas /> : null}
        </div>
      ) : list}
    </div>
  )
}
