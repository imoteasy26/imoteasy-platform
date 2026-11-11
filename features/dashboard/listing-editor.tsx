'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { LocationPicker } from '@/features/listings/location-picker'
import { propertyTypeLabels, transactionLabels } from '@/lib/format'
import type { Listing, ListingImage } from '@/lib/supabase/database.types'
import { updateOwnedListingDetails } from '@/app/dashboard/actions'
import { ListingImageManager } from './listing-image-manager'

export function ListingEditor({ listing, exactAddress, images }: { listing: Listing; exactAddress: string; images: ListingImage[] }) {
  const [latitude, setLatitude] = useState<number | null>(listing.latitude)
  const [longitude, setLongitude] = useState<number | null>(listing.longitude)
  const point = latitude !== null && longitude !== null ? [latitude, longitude] as [number, number] : null

  return (
    <div className="flex flex-col gap-5">
      <form action={updateOwnedListingDetails} className="rounded-2xl border border-line bg-white p-5 sm:p-8">
        <input name="id" type="hidden" value={listing.id} />
        <FieldGroup className="grid gap-5 md:grid-cols-2">
          <Field className="md:col-span-2"><FieldLabel htmlFor="title">Заглавие</FieldLabel><Input autoComplete="off" defaultValue={listing.title} id="title" maxLength={120} minLength={10} name="title" required /></Field>
          <Field><FieldLabel htmlFor="transaction_type">Тип сделка</FieldLabel><select className="form-control" defaultValue={listing.transaction_type} id="transaction_type" name="transaction_type"><option value="sale">{transactionLabels.sale}</option><option value="rent">{transactionLabels.rent}</option></select></Field>
          <Field><FieldLabel htmlFor="property_type">Тип имот</FieldLabel><select className="form-control" defaultValue={listing.property_type} id="property_type" name="property_type">{Object.entries(propertyTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
          <Field><FieldLabel htmlFor="price_eur">Цена (€)</FieldLabel><Input defaultValue={listing.price_eur} id="price_eur" min="1" name="price_eur" required step="1" type="number" /></Field>
          <Field><FieldLabel htmlFor="area_sqm">Площ (м²)</FieldLabel><Input defaultValue={listing.area_sqm} id="area_sqm" min="1" name="area_sqm" required step="0.1" type="number" /></Field>
          <Field className="md:col-span-2"><FieldLabel htmlFor="description">Описание</FieldLabel><Textarea defaultValue={listing.description} id="description" maxLength={10000} minLength={30} name="description" required rows={6} /></Field>
          <Field><FieldLabel htmlFor="city">Град</FieldLabel><Input autoComplete="address-level2" defaultValue={listing.city} id="city" maxLength={100} name="city" required /></Field>
          <Field><FieldLabel htmlFor="neighborhood">Квартал</FieldLabel><Input defaultValue={listing.neighborhood ?? ''} id="neighborhood" maxLength={100} name="neighborhood" /></Field>
          <Field><FieldLabel htmlFor="rooms">Стаи</FieldLabel><Input defaultValue={listing.rooms ?? ''} id="rooms" max="30" min="0" name="rooms" type="number" /></Field>
          <Field><FieldLabel htmlFor="bedrooms">Спални</FieldLabel><Input defaultValue={listing.bedrooms ?? ''} id="bedrooms" max="30" min="0" name="bedrooms" type="number" /></Field>
          <Field><FieldLabel htmlFor="floor">Етаж</FieldLabel><Input defaultValue={listing.floor ?? ''} id="floor" max="200" min="-5" name="floor" type="number" /></Field>
          <Field><FieldLabel htmlFor="total_floors">Етажи в сградата</FieldLabel><Input defaultValue={listing.total_floors ?? ''} id="total_floors" max="200" min="1" name="total_floors" type="number" /></Field>
          <Field><FieldLabel htmlFor="construction_type">Строителство</FieldLabel><Input defaultValue={listing.construction_type ?? ''} id="construction_type" maxLength={80} name="construction_type" /></Field>
          <Field><FieldLabel htmlFor="condition">Състояние</FieldLabel><Input defaultValue={listing.condition ?? ''} id="condition" maxLength={80} name="condition" /></Field>
          <Field><FieldLabel htmlFor="furnishing">Обзавеждане</FieldLabel><Input defaultValue={listing.furnishing ?? ''} id="furnishing" maxLength={80} name="furnishing" /></Field>
          <Field><FieldLabel htmlFor="exact_address">Точен адрес <span className="font-normal text-muted-foreground">(личен)</span></FieldLabel><Input autoComplete="street-address" defaultValue={exactAddress} id="exact_address" maxLength={500} name="exact_address" /><FieldDescription>Този адрес не се показва на публичната обява.</FieldDescription></Field>
          <div className="md:col-span-2"><LocationPicker onPick={([nextLatitude, nextLongitude]) => { const validPoint = Number.isFinite(nextLatitude) && Number.isFinite(nextLongitude); setLatitude(validPoint ? nextLatitude : null); setLongitude(validPoint ? nextLongitude : null) }} point={point} /><input name="latitude" type="hidden" value={latitude ?? ''} /><input name="longitude" type="hidden" value={longitude ?? ''} /></div>
        </FieldGroup>
        <Button className="mt-6" type="submit">Запази промените</Button>
      </form>
      <ListingImageManager initialImages={images} listingId={listing.id} ownerId={listing.owner_id} />
    </div>
  )
}
