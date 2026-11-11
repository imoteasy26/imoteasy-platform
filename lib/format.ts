import type { Listing } from './supabase/database.types'

export const formatPrice = (price: number) =>
  new Intl.NumberFormat('bg-BG', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(price)

export const formatArea = (area: number) => `${new Intl.NumberFormat('bg-BG', { maximumFractionDigits: 0 }).format(area)} м²`

export const propertyTypeLabels: Record<Listing['property_type'], string> = {
  apartment: 'Апартамент',
  house: 'Къща',
  land: 'Парцел',
  office: 'Офис',
  shop: 'Магазин',
  warehouse: 'Склад',
  other: 'Друг имот',
}

export const transactionLabels: Record<Listing['transaction_type'], string> = {
  sale: 'Продажба',
  rent: 'Наем',
}

export const listingStatusLabels: Record<Listing['status'], string> = {
  draft: 'Чернова',
  pending_review: 'За одобрение',
  published: 'Публикувана',
  rejected: 'Отхвърлена',
  archived: 'Архивирана',
  sold: 'Продадена',
}
