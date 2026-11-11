'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { BellRing, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { saveSearch } from '@/app/imoti/actions'
import type { ListingFilters } from '@/lib/listing-types'

export function SaveSearchButton({ filters, active, returnTo }: { filters: ListingFilters; active: boolean; returnTo: string }) {
  const [message, setMessage] = useState('')
  const [needsSignIn, setNeedsSignIn] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    setMessage('')
    setNeedsSignIn(false)
    startTransition(async () => {
      const result = await saveSearch(filters)
      if (result.success) {
        setMessage('Търсенето е запазено. Ще получаваш известия за нови съвпадения.')
      } else if (result.code === 'sign-in') {
        setNeedsSignIn(true)
        setMessage('Влез в профила си, за да запазиш това търсене.')
      } else if (result.code === 'migration-required') {
        setMessage('Функцията ще се активира след прилагането на актуализацията на базата данни.')
      } else if (result.code === 'invalid') {
        setMessage('Добави поне един филтър, за да запазиш търсенето.')
      } else {
        setMessage('Не успяхме да запазим търсенето. Опитай отново.')
      }
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button disabled={!active || isPending} onClick={handleSave} size="sm" type="button" variant="outline">
        {message.startsWith('Търсенето е запазено') ? <Check data-icon="inline-start" /> : <BellRing data-icon="inline-start" />}
        {isPending ? 'Запазване…' : 'Запази търсенето'}
      </Button>
      {message ? <span aria-live="polite" className="text-xs text-muted-foreground">{message}</span> : null}
      {needsSignIn ? <Link className="text-sm font-semibold text-brand hover:underline" href={`/auth/sign-in?next=${encodeURIComponent(returnTo)}`}>Вход</Link> : null}
    </div>
  )
}
