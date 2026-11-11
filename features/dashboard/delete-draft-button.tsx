'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { deleteOwnedDraft } from '@/app/dashboard/actions'

export function DeleteDraftButton({ listingId }: { listingId: string }) {
  const [isPending, setIsPending] = useState(false)

  return (
    <form action={deleteOwnedDraft} onSubmit={(event) => { if (!window.confirm('Изтриването на тази чернова е окончателно. Продължаваме ли?')) event.preventDefault(); else setIsPending(true) }}>
      <input name="id" type="hidden" value={listingId} />
      <Button disabled={isPending} size="sm" type="submit" variant="destructive">{isPending ? 'Изтриване…' : 'Изтрий черновата'}</Button>
    </form>
  )
}
