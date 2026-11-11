'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { MapPin, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

const MapCanvas = dynamic(() => import('./map-canvas').then((module) => module.MapCanvas), {
  ssr: false,
  loading: () => <div aria-label="Картата се зарежда" className="grid h-[360px] place-items-center rounded-2xl bg-subtle text-sm text-muted-foreground">Зареждаме картата…</div>,
})

export function LocationPicker({ point, onPick }: { point: [number, number] | null; onPick: (point: [number, number]) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div><p className="font-semibold text-ink">Приблизителна локация <span className="font-normal text-muted-foreground">(по избор)</span></p><p className="mt-1 text-xs leading-5 text-muted-foreground">Точният адрес остава личен. Кликни на картата, за да маркираш район.</p></div>
        <Button onClick={() => setOpen((value) => !value)} size="sm" type="button" variant="outline"><MapPin data-icon="inline-start" />{open ? 'Затвори картата' : point ? 'Промени локацията' : 'Маркирай на картата'}</Button>
      </div>
      {point ? <p className="mt-3 text-xs text-brand">Маркирано: {point[0].toFixed(5)}, {point[1].toFixed(5)}</p> : null}
      {open ? <div className="mt-4 overflow-hidden rounded-2xl"><MapCanvas initialPoint={point ?? undefined} onPick={onPick} /></div> : null}
      {point ? <button className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-destructive" onClick={() => onPick([Number.NaN, Number.NaN])} type="button"><X aria-hidden size={13} />Премахни маркера</button> : null}
    </div>
  )
}
