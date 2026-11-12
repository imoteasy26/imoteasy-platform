'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { createOrganizationInvite, type InvitationActionState } from '@/app/broker/actions'

const initialState: InvitationActionState = {}

export function OrganizationInviteForm({ organizationId }: { organizationId: string }) {
  const [state, action, pending] = useActionState(createOrganizationInvite, initialState)

  return (
    <form action={action} className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-5">
      <input name="organization_id" type="hidden" value={organizationId} />
      <FieldGroup className="flex flex-col gap-3">
        <Field>
          <FieldLabel htmlFor="invite-email">Имейл на поканения</FieldLabel>
          <Input autoComplete="email" id="invite-email" maxLength={254} name="email" required type="email" />
        </Field>
        <Field>
          <FieldLabel htmlFor="invite-role">Роля в екипа</FieldLabel>
          <select className="form-control" defaultValue="broker" id="invite-role" name="role" required>
            <option value="broker">Брокер</option>
            <option value="assistant">Асистент</option>
            <option value="marketing_manager">Маркетинг мениджър</option>
            <option value="read_only">Само преглед</option>
            <option value="agency_admin">Администратор на агенцията</option>
          </select>
        </Field>
      </FieldGroup>
      <p className="text-xs leading-5 text-muted-foreground">Поканата е валидна 7 дни. Ролята се задава от администратора, а не от поканения.</p>
      {state.error ? <p className="text-sm text-destructive" role="alert">{state.error}</p> : null}
      {state.invitePath ? <div className="rounded-xl bg-subtle p-4" role="status"><p className="text-sm font-semibold text-ink">Сподели еднократния линк с поканения:</p><a className="mt-2 block break-all text-sm font-medium text-brand underline" href={state.invitePath}>{state.invitePath}</a></div> : null}
      <Button disabled={pending} type="submit">{pending ? 'Създаваме покана…' : 'Създай покана'}</Button>
    </form>
  )
}
