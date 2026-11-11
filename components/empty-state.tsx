import Link from 'next/link'
import { ArrowUpRight, HousePlus } from 'lucide-react'

export function EmptyState({ title, description, showPublish = false }: { title: string; description: string; showPublish?: boolean }) {
  return (
    <div className="empty-state flex flex-col items-center px-6 py-14 text-center sm:py-16">
      <span className="grid size-14 place-items-center rounded-2xl bg-brand/10 text-brand"><HousePlus aria-hidden size={24} /></span>
      <h3 className="mt-5 text-xl font-semibold tracking-tight text-ink">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
      {showPublish ? <Link className="btn-primary mt-6" href="/publish">Публикувай първата обява <ArrowUpRight aria-hidden size={16} /></Link> : null}
    </div>
  )
}
