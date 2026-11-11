'use client'

import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'

export function SignOutButton() {
  const router = useRouter()
  async function signOut() {
    await createClient().auth.signOut()
    router.push('/')
    router.refresh()
  }
  return <Button onClick={signOut} type="button" variant="outline"><LogOut data-icon="inline-start" />Изход</Button>
}
