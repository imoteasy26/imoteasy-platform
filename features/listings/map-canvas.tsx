'use client'

import 'leaflet/dist/leaflet.css'
import { useMapEvents, MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'

type MapListing = { id: string; slug: string; title: string; price: string; latitude: number; longitude: number }
type MapCanvasProps = { listings?: MapListing[]; initialPoint?: [number, number]; onPick?: (point: [number, number]) => void }

function PickPoint({ onPick }: { onPick?: (point: [number, number]) => void }) {
  useMapEvents({ click(event) { onPick?.([event.latlng.lat, event.latlng.lng]) } })
  return null
}

export function MapCanvas({ listings = [], initialPoint, onPick }: MapCanvasProps) {
  const center = initialPoint ?? (listings[0] ? [listings[0].latitude, listings[0].longitude] as [number, number] : [42.7339, 25.4858])
  return (
    <MapContainer center={center} className="h-[420px] w-full rounded-2xl" scrollWheelZoom={false} zoom={listings.length ? 12 : 7}>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <PickPoint onPick={onPick} />
      {listings.map((listing) => (
        <CircleMarker center={[listing.latitude, listing.longitude]} key={listing.id} pathOptions={{ color: '#176c51', fillColor: '#176c51', fillOpacity: 0.86 }} radius={9}>
          <Popup><a className="font-semibold" href={`/imoti/${listing.slug}`}>{listing.title}</a><br />{listing.price}</Popup>
        </CircleMarker>
      ))}
      {onPick && initialPoint ? <CircleMarker center={initialPoint} pathOptions={{ color: '#b76e20', fillColor: '#f0bd6b', fillOpacity: 1 }} radius={10} /> : null}
    </MapContainer>
  )
}
