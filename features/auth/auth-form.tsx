'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'

const authSchema = z.object({
  displayName: z.string().max(100).optional(),
  email: z.string().trim().email('Въведи валиден имейл адрес.').max(254),
  password: z.string().min(8, 'Паролата трябва да е поне 8 символа.').max(72),
})
type AuthValues = z.infer<typeof authSchema>

export function AuthForm({ mode, next = '/dashboard' }: { mode: 'sign-in' | 'sign-up'; next?: string }) {
  const [message, setMessage] = useState('')
  const router = useRouter()
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<AuthValues>({
    resolver: zodResolver(authSchema),
    defaultValues: { displayName: '', email: '', password: '' },
  })
  const destination = next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard'

  async function submit(values: AuthValues) {
    setMessage('')
    const supabase = createClient()
    if (mode === 'sign-up') {
      const { error } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
        options: {
          emailRedirectTo: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ?? `${window.location.origin}/auth/callback`,
          data: { display_name: values.displayName?.trim() ?? '' },
        },
      })
      if (error) {
        if (error.status === 429) setMessage('Твърде много опити. Изчакай малко и опитай отново.')
        else if (error.code === 'weak_password') setMessage('Избери по-силна парола с поне 8 символа.')
        else setMessage('Не успяхме да създадем профила. Провери данните и опитай отново.')
        return
      }
      setMessage('Провери пощата си за връзка за потвърждение на профила.')
      return
    }

    const { error } = await supabase.auth.signInWithPassword({ email: values.email, password: values.password })
    if (error) {
      if (error.code === 'email_not_confirmed') setMessage('Потвърди имейла си от връзката, изпратена на пощата ти.')
      else if (error.status === 429) setMessage('Твърде много опити. Изчакай малко и опитай отново.')
      else if (['invalid_credentials', 'user_not_found', 'invalid_login_credentials'].includes(error.code ?? '')) setMessage('Имейлът или паролата са невалидни.')
      else setMessage('Възникна неочаквана грешка. Опитай отново след малко.')
      return
    }

    router.push(destination)
    router.refresh()
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={handleSubmit(submit)}>
      <FieldGroup className="flex flex-col gap-4">
        {mode === 'sign-up' ? <Field data-invalid={Boolean(errors.displayName)}><FieldLabel htmlFor="displayName">Име</FieldLabel><Input autoComplete="name" id="displayName" placeholder="Например, Мария Иванова" {...register('displayName', { required: 'Въведи името си.' })} aria-invalid={Boolean(errors.displayName)} />{errors.displayName ? <FieldError>{errors.displayName.message}</FieldError> : null}</Field> : null}
        <Field data-invalid={Boolean(errors.email)}><FieldLabel htmlFor="email">Имейл</FieldLabel><Input autoComplete="email" id="email" placeholder="name@example.com" type="email" {...register('email')} aria-invalid={Boolean(errors.email)} />{errors.email ? <FieldError>{errors.email.message}</FieldError> : <FieldDescription>Използвай имейл, до който имаш достъп.</FieldDescription>}</Field>
        <Field data-invalid={Boolean(errors.password)}><FieldLabel htmlFor="password">Парола</FieldLabel><Input autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'} id="password" placeholder="Минимум 8 символа" type="password" {...register('password')} aria-invalid={Boolean(errors.password)} />{errors.password ? <FieldError>{errors.password.message}</FieldError> : null}</Field>
      </FieldGroup>
      {message ? <p aria-live="polite" className="rounded-xl bg-subtle px-4 py-3 text-sm leading-6 text-ink">{message}</p> : null}
      <Button className="min-h-12 w-full rounded-xl" disabled={isSubmitting} type="submit">{isSubmitting ? 'Момент…' : mode === 'sign-up' ? 'Създай профил' : 'Влез в профила'}</Button>
      <p className="text-center text-sm text-muted-foreground">{mode === 'sign-up' ? 'Вече имаш профил?' : 'Нямаш профил?'}{' '}<Link className="font-semibold text-brand hover:underline" href={mode === 'sign-up' ? '/auth/sign-in' : '/auth/sign-up'}>{mode === 'sign-up' ? 'Вход' : 'Регистрация'}</Link></p>
    </form>
  )
}
