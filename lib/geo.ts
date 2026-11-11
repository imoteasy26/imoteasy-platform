const publicCoordinatePrecision = 3

export function approximateCoordinate(value: number | null | undefined, maximumMagnitude = 180): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null
  if (Math.abs(value) > maximumMagnitude) return null
  return Number(value.toFixed(publicCoordinatePrecision))
}

export function approximateListingCoordinates<T extends { latitude: number | null; longitude: number | null }>(listing: T): T {
  return {
    ...listing,
    latitude: approximateCoordinate(listing.latitude, 90),
    longitude: approximateCoordinate(listing.longitude, 180),
  }
}
