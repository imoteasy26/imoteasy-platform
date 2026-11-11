'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Heart } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export function FavoriteButton({ listingId, initiallySaved = false, className = '' }: { listingId: string; initiallySaved?: boolean; className?: string }) {
  const [saved, setSaved] = useState(initiallySaved)
  const [pending, setPending] = useState(false)
  const router = useRouter()

  async function toggleFavorite() {
    if (pending) return
    setPending(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push(`/auth/sign-in?next=${encodeURIComponent(window.location.pathname)}`)
      setPending(false)
      return
    }

    const result = saved
      ? await supabase.from('favorites').delete().eq('user_id', user.id).eq('listing_id', listingId)
      : await supabase.from('favorites').insert({ user_id: user.id, listing_id: listingId })

    if (!result.error) {
      setSaved(!saved)
      router.refresh()
    }
    setPending(false)
  }

  return (
    <button aria-label={saved ? 'Премахни от запазени' : 'Запази имота'} aria-pressed={saved} className={`grid size-10 place-items-center rounded-full border border-white/80 bg-white/95 text-ink shadow-sm transition hover:scale-105 hover:text-rose-600 disabled:opacity-60 ${className}`} disabled={pending} onClick={toggleFavorite} type="button">
      <Heart aria-hidden className={saved ? 'fill-current text-rose-600' : ''} size={18} />
    </button>
  )
}
