'use client'

import { useState, useTransition, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'

const recoveryEmailSchema = z.object({ email: z.string().trim().email('Въведи валиден имейл адрес.').max(254) })
const passwordSchema = z.object({
  password: z.string().min(8, 'Паролата трябва да е поне 8 символа.').max(72),
  confirmPassword: z.string().min(8, 'Потвърди паролата си.'),
}).refine((values) => values.password === values.confirmPassword, {
  path: ['confirmPassword'],
  message: 'Паролите не съвпадат.',
})

export function PasswordRecoveryForm({ mode, expired = false }: { mode: 'request' | 'update'; expired?: boolean }) {
  const [message, setMessage] = useState(expired ? 'Връзката е изтекла или не е валидна. Поискай нова.' : '')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = Object.fromEntries(new FormData(event.currentTarget))
    const supabase = createClient()

    if (mode === 'request') {
      const parsed = recoveryEmailSchema.safeParse(values)
      if (!parsed.success) {
        setMessage(parsed.error.issues[0]?.message ?? 'Въведи валиден имейл адрес.')
        return
      }

      setMessage('')
      startTransition(async () => {
        const redirectUrl = new URL(process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ?? `${window.location.origin}/auth/callback`)
        redirectUrl.searchParams.set('next', '/auth/update-password')
        const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, { redirectTo: redirectUrl.toString() })
        if (error?.status === 429) {
          setMessage('Твърде много опити. Изчакай малко и опитай отново.')
          return
        }
        setMessage('Ако има профил с този имейл, ще получиш връзка за смяна на паролата.')
      })
      return
    }

    const parsed = passwordSchema.safeParse(values)
    if (!parsed.success) {
      setMessage(parsed.error.issues[0]?.message ?? 'Провери въведените данни.')
      return
    }

    setMessage('')
    startTransition(async () => {
      const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
      if (error) {
        if (error.status === 429) setMessage('Твърде много опити. Изчакай малко и опитай отново.')
        else if (error.code === 'weak_password') setMessage('Избери по-силна парола с поне 8 символа.')
        else setMessage('Не успяхме да сменим паролата. Поискай нова връзка и опитай отново.')
        return
      }
      router.replace('/dashboard?passwordUpdated=1')
      router.refresh()
    })
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={submit}>
      <FieldGroup className="flex flex-col gap-4">
        {mode === 'request' ? <Field><FieldLabel htmlFor="recovery-email">Имейл</FieldLabel><Input autoComplete="email" id="recovery-email" maxLength={254} name="email" required type="email" /><FieldDescription>Ще изпратим връзка, ако този имейл е свързан с профил.</FieldDescription></Field> : <>
          <Field><FieldLabel htmlFor="new-password">Нова парола</FieldLabel><Input autoComplete="new-password" id="new-password" maxLength={72} minLength={8} name="password" required type="password" /><FieldDescription>Използвай поне 8 символа.</FieldDescription></Field>
          <Field><FieldLabel htmlFor="confirm-password">Повтори паролата</FieldLabel><Input autoComplete="new-password" id="confirm-password" maxLength={72} minLength={8} name="confirmPassword" required type="password" /></Field>
        </>}
      </FieldGroup>
      {message ? <p aria-live="polite" className="rounded-xl bg-subtle px-4 py-3 text-sm leading-6 text-ink">{message}</p> : null}
      <Button className="min-h-12 w-full rounded-xl" disabled={isPending} type="submit">{isPending ? 'Момент…' : mode === 'request' ? 'Изпрати връзка' : 'Смени паролата'}</Button>
      <p className="text-center text-sm text-muted-foreground"><Link className="font-semibold text-brand hover:underline" href="/auth/sign-in">Назад към входа</Link></p>
    </form>
  )
}
