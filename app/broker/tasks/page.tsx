import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { BrokerErrorNotice, BrokerMigrationNotice, BrokerStateNotice } from '@/features/broker/broker-state'
import { createBrokerTask, updateBrokerTask } from '@/app/broker/actions'
import { getBrokerAccess, isBrokerSchemaMissing } from '@/lib/broker-workspace'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Задачи' }

const taskStatusLabel = { open: 'Отворена', in_progress: 'В процес', completed: 'Завършена', cancelled: 'Отказана' } as const

export default async function BrokerTasksPage({ searchParams }: { searchParams: Promise<{ organizationId?: string; state?: string }> }) {
  const query = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/sign-in?next=%2Fbroker%2Ftasks')
  const access = await getBrokerAccess(supabase, user.id, query.organizationId)
  if (access.kind === 'migration_required') return <main className="site-container py-10" id="main-content"><BrokerMigrationNotice /></main>
  if (access.kind === 'error') return <main className="site-container py-10" id="main-content"><BrokerErrorNotice /></main>
  if (access.kind === 'no_membership') redirect('/broker/onboarding')
  const { organization, membership } = access.context
  const canManage = ['owner', 'agency_admin', 'broker', 'assistant'].includes(membership.role)
  const [{ data: tasks, error: taskError }, { data: leads, error: leadError }] = await Promise.all([
    supabase.from('crm_tasks').select('id, organization_id, lead_id, title, description, status, priority, due_at, assigned_to, created_by, completed_at, created_at, updated_at').eq('organization_id', organization.id).order('due_at', { ascending: true, nullsFirst: false }).limit(100),
    canManage ? supabase.from('crm_leads').select('id, contact_id, status').eq('organization_id', organization.id).not('status', 'in', '(won,lost)').limit(100) : Promise.resolve({ data: [], error: null }),
  ])
  const error = taskError || leadError
  if (isBrokerSchemaMissing(error)) return <main className="site-container py-10" id="main-content"><BrokerMigrationNotice /></main>
  if (error) return <main className="site-container py-10" id="main-content"><BrokerErrorNotice /></main>
  const leadNames = new Map<string, string>()
  const leadContactIds = (leads ?? []).map((lead) => lead.contact_id)
  if (canManage && leadContactIds.length) {
    const { data: contacts } = await supabase.from('crm_contacts').select('id, display_name').in('id', leadContactIds)
    for (const contact of contacts ?? []) leadNames.set(contact.id, contact.display_name)
  }

  return (
    <main className="site-container min-h-[72vh] py-8 sm:py-12" id="main-content">
      <div><p className="eyebrow">{organization.name} · CRM</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-ink">Задачи и напомняния</h1><p className="mt-2 text-sm text-muted-foreground">Подреди следващите действия и свържи задачите с CRM лийд.</p></div>
      <div className="mt-5"><BrokerStateNotice state={query.state} /></div>
      {canManage ? <form action={createBrokerTask} className="mt-7 grid gap-5 rounded-2xl border border-line bg-white p-5 sm:grid-cols-2"><input name="organization_id" type="hidden" value={organization.id} /><div className="sm:col-span-2"><Field><FieldLabel htmlFor="task-title">Задача</FieldLabel><Input id="task-title" maxLength={160} name="title" placeholder="Напр. Обади се за оглед" required /></Field></div><Field><FieldLabel htmlFor="task-lead">Свързан лийд <span className="font-normal text-muted-foreground">(по избор)</span></FieldLabel><select className="form-control" defaultValue="" id="task-lead" name="lead_id"><option value="">Без лийд</option>{(leads ?? []).map((lead) => <option key={lead.id} value={lead.id}>{leadNames.get(lead.contact_id) || `Лийд ${lead.id.slice(0, 8)}`}</option>)}</select></Field><Field><FieldLabel htmlFor="task-due">Краен срок <span className="font-normal text-muted-foreground">(по избор, местно време София)</span></FieldLabel><Input id="task-due" name="due_at" type="datetime-local" /></Field><div className="sm:col-span-2"><Field><FieldLabel htmlFor="task-description">Бележка</FieldLabel><Textarea id="task-description" maxLength={2000} name="description" rows={3} /></Field></div><div className="sm:col-span-2"><Button type="submit">Създай задача</Button></div></form> : null}
      <section aria-labelledby="tasks-heading" className="mt-9"><h2 className="text-xl font-semibold text-ink" id="tasks-heading">Екипни задачи</h2><div className="mt-4 flex flex-col gap-3">{tasks?.length ? tasks.map((task) => <article className="rounded-2xl border border-line bg-white p-5" key={task.id}><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold text-ink">{task.title}</h3>{task.description ? <p className="mt-2 whitespace-pre-line text-sm leading-6 text-muted-foreground">{task.description}</p> : null}<p className="mt-2 text-xs text-muted-foreground">{task.due_at ? `Срок: ${new Intl.DateTimeFormat('bg-BG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Sofia' }).format(new Date(task.due_at))}` : 'Без зададен срок'}</p></div><Badge variant={task.status === 'completed' ? 'secondary' : 'outline'}>{taskStatusLabel[task.status]}</Badge></div>{canManage ? <form action={updateBrokerTask} className="mt-4 flex flex-wrap items-center gap-2"><input name="organization_id" type="hidden" value={organization.id} /><input name="task_id" type="hidden" value={task.id} /><label className="sr-only" htmlFor={`task-status-${task.id}`}>Статус на задачата</label><select className="form-control max-w-56" defaultValue={task.status} id={`task-status-${task.id}`} name="status">{Object.entries(taskStatusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><Button size="sm" type="submit" variant="outline">Запази статуса</Button></form> : null}</article>) : <p className="rounded-2xl border border-dashed border-line p-6 text-sm text-muted-foreground">Задачите за екипа ще се появят тук.</p>}</div></section>
    </main>
  )
}
