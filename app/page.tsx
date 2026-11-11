import { HomeContent } from '@/features/home/home-content'
import { getRecentListings } from '@/lib/listings'

export default async function HomePage() {
  const listings = await getRecentListings(3)
  return <HomeContent listings={listings} />
}
