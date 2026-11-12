'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, ArrowRight, Check, ImagePlus, Trash2 } from 'lucide-react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { LocationPicker } from '@/features/listings/location-picker'
import { formatPrice, propertyTypeLabels, transactionLabels } from '@/lib/format'
import { createClient } from '@/lib/supabase/client'
import { listingSchema, type ListingFormValues } from './listing-schema'
import { registerListingImages, saveListingDraft, submitListingForReview } from '@/app/publish/actions'

const stepFields: (keyof ListingFormValues)[][] = [
  ['title', 'description', 'property_type', 'transaction_type', 'price_eur', 'area_sqm'],
  ['city', 'neighborhood', 'rooms', 'bedrooms', 'floor', 'total_floors', 'construction_type', 'condition', 'furnishing', 'exact_address', 'latitude', 'longitude'],
]
const maxImages = 8
const maxImageBytes = 8 * 1024 * 1024

function LocalPhoto({ file, index, onRemove, onMoveUp, onMoveDown, isCover, isLast, locked }: { file: File; index: number; onRemove: () => void; onMoveUp: () => void; onMoveDown: () => void; isCover: boolean; isLast: boolean; locked: boolean }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [file])
  return (
    <li className="overflow-hidden rounded-xl border border-line bg-white">
      <div className="relative aspect-[1.35] bg-subtle">{url ? <img alt={`Снимка ${index + 1}: ${file.name}`} className="size-full object-cover" src={url} /> : null}<span className="absolute left-2 top-2 rounded-md bg-white/95 px-2 py-1 text-[10px] font-bold text-ink">{isCover ? 'Основна снимка' : `Снимка ${index + 1}`}</span></div>
      <div className="flex items-center justify-between gap-1 p-2"><span className="truncate text-xs text-muted-foreground">{file.name}</span><div className="flex shrink-0 gap-1"><button aria-label={`Премести снимка ${index + 1} нагоре`} className="rounded p-1 text-muted-foreground hover:bg-subtle disabled:opacity-40" disabled={locked || index === 0} onClick={onMoveUp} type="button">↑</button><button aria-label={`Премести снимка ${index + 1} надолу`} className="rounded p-1 text-muted-foreground hover:bg-subtle disabled:opacity-40" disabled={locked || isLast} onClick={onMoveDown} type="button">↓</button><button aria-label={`Премахни снимка ${index + 1}`} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" disabled={locked} onClick={onRemove} type="button"><Trash2 aria-hidden size={14} /></button></div></div>
    </li>
  )
}

export function PublishWizard({ organizationId }: { organizationId?: string }) {
  const [step, setStep] = useState(0)
  const [photos, setPhotos] = useState<File[]>([])
  const [draftId, setDraftId] = useState<string | null>(null)
  const [photosSaved, setPhotosSaved] = useState(false)
  const [formMessage, setFormMessage] = useState('')
  const router = useRouter()
  const form = useForm<z.input<typeof listingSchema>, unknown, ListingFormValues>({
    resolver: zodResolver(listingSchema),
    defaultValues: { title: '', description: '', property_type: 'apartment', transaction_type: 'sale', city: '', neighborhood: '', construction_type: '', condition: '', furnishing: '', exact_address: '', latitude: undefined, longitude: undefined },
  })
  const values = useWatch({ control: form.control })

  async function nextStep() {
    setFormMessage('')
    const valid = await form.trigger(stepFields[step] ?? [])
    if (!valid) return
    if (step === 2 && photos.length === 0) {
      setFormMessage('Добави поне една снимка, за да изпратиш обявата.')
      return
    }
    setStep((current) => Math.min(current + 1, 3))
  }

  function addPhotos(fileList: FileList | null) {
    if (!fileList) return
    const selected = Array.from(fileList)
    if (photosSaved) {
      setFormMessage('Снимките вече са запазени за тази обява.')
      return
    }
    if (selected.length > maxImages - photos.length) {
      setFormMessage(`Можеш да добавиш най-много ${maxImages - photos.length} снимки.`)
      return
    }
    const invalid = selected.some((file) => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > maxImageBytes)
    if (invalid) {
      setFormMessage('Използвай JPG, PNG или WebP до 8 MB на снимка.')
      return
    }
    setFormMessage('')
    setPhotos((current) => [...current, ...selected])
  }

  async function submit(values: ListingFormValues) {
    setFormMessage('')
    if (photos.length === 0) {
      setStep(2)
      setFormMessage('Добави поне една снимка, за да изпратиш обявата.')
      return
    }

    const savedDraft = await saveListingDraft(draftId, values, organizationId)
    if (!savedDraft.success) {
      setFormMessage(savedDraft.message)
      return
    }
    const currentDraftId = savedDraft.listingId
    setDraftId(currentDraftId)

    if (!photosSaved) {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || user.id !== savedDraft.userId) {
        router.push('/auth/sign-in?next=%2Fpublish')
        return
      }

      const uploadedPaths: string[] = []
      for (const file of photos) {
        const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
        const path = `${user.id}/${currentDraftId}/${crypto.randomUUID()}.${extension}`
        const { error } = await supabase.storage.from('imoteasy-listings').upload(path, file, { contentType: file.type, upsert: false })
        if (error) {
          if (uploadedPaths.length) await supabase.storage.from('imoteasy-listings').remove(uploadedPaths)
          setFormMessage('Не успяхме да качим снимките. Черновата е запазена; опитай отново.')
          return
        }
        uploadedPaths.push(path)
      }

      const imageResult = await registerListingImages(currentDraftId, uploadedPaths)
      if (!imageResult.success) {
        await supabase.storage.from('imoteasy-listings').remove(uploadedPaths)
        setFormMessage(imageResult.message)
        return
      }
      setPhotosSaved(true)
    }

    const submission = await submitListingForReview(currentDraftId)
    if (!submission.success) {
      setFormMessage(submission.message)
      return
    }
    router.push('/dashboard?submitted=1')
    router.refresh()
  }

  const point = typeof values.latitude === 'number' && Number.isFinite(values.latitude) && typeof values.longitude === 'number' && Number.isFinite(values.longitude) ? [values.latitude, values.longitude] as [number, number] : null
  const propertyNames = { apartment: 'Апартамент', house: 'Къща', land: 'Парцел', office: 'Офис', shop: 'Магазин', warehouse: 'Склад', other: 'Друг имот' } as const

  return (
    <div className="mx-auto max-w-4xl">
      <ol aria-label="Стъпки за публикуване" className="mb-8 grid grid-cols-4 gap-2">{['Имот', 'Локация', 'Снимки', 'Преглед'].map((label, index) => <li aria-current={step === index ? 'step' : undefined} className={`border-t-2 pt-2 text-xs font-semibold sm:text-sm ${step >= index ? 'border-brand text-brand' : 'border-line text-muted-foreground'}`} key={label}><span className="mr-1.5">{String(index + 1).padStart(2, '0')}</span>{label}</li>)}</ol>
      <form className="rounded-[1.5rem] border border-line bg-white p-5 shadow-sm sm:p-8" onSubmit={form.handleSubmit(submit)}>
        {step === 0 ? <div><h2 className="text-2xl font-semibold tracking-tight text-ink">Разкажи ни за имота</h2><p className="mb-6 mt-2 text-sm text-muted-foreground">Основните детайли помагат на хората да открият обявата.</p><FieldGroup className="grid gap-4 md:grid-cols-2">
          <Field className="md:col-span-2" data-invalid={Boolean(form.formState.errors.title)}><FieldLabel htmlFor="title">Заглавие</FieldLabel><Input id="title" maxLength={120} placeholder="Светъл тристаен апартамент с тераса" {...form.register('title')} aria-invalid={Boolean(form.formState.errors.title)} />{form.formState.errors.title ? <FieldError>{form.formState.errors.title.message}</FieldError> : null}</Field>
          <Field data-invalid={Boolean(form.formState.errors.transaction_type)}><FieldLabel htmlFor="transaction_type">Тип сделка</FieldLabel><select className="form-control" id="transaction_type" {...form.register('transaction_type')}><option value="sale">Продажба</option><option value="rent">Наем</option></select></Field>
          <Field><FieldLabel htmlFor="property_type">Тип имот</FieldLabel><select className="form-control" id="property_type" {...form.register('property_type')}><option value="apartment">Апартамент</option><option value="house">Къща</option><option value="land">Парцел</option><option value="office">Офис</option><option value="shop">Магазин</option><option value="warehouse">Склад</option><option value="other">Друг</option></select></Field>
          <Field data-invalid={Boolean(form.formState.errors.price_eur)}><FieldLabel htmlFor="price_eur">Цена (€)</FieldLabel><Input id="price_eur" min="1" step="1" type="number" {...form.register('price_eur')} aria-invalid={Boolean(form.formState.errors.price_eur)} />{form.formState.errors.price_eur ? <FieldError>{form.formState.errors.price_eur.message}</FieldError> : null}</Field>
          <Field data-invalid={Boolean(form.formState.errors.area_sqm)}><FieldLabel htmlFor="area_sqm">Площ (м²)</FieldLabel><Input id="area_sqm" min="1" step="0.1" type="number" {...form.register('area_sqm')} aria-invalid={Boolean(form.formState.errors.area_sqm)} />{form.formState.errors.area_sqm ? <FieldError>{form.formState.errors.area_sqm.message}</FieldError> : null}</Field>
          <Field className="md:col-span-2" data-invalid={Boolean(form.formState.errors.description)}><FieldLabel htmlFor="description">Описание</FieldLabel><Textarea id="description" maxLength={10000} minLength={30} placeholder="Опиши разпределението, светлината, близките удобства и какво прави имота специален…" rows={6} {...form.register('description')} aria-invalid={Boolean(form.formState.errors.description)} />{form.formState.errors.description ? <FieldError>{form.formState.errors.description.message}</FieldError> : <FieldDescription>Без телефони и имейли в описанието — те се споделят лично.</FieldDescription>}</Field>
        </FieldGroup></div> : null}
        {step === 1 ? <div><h2 className="text-2xl font-semibold tracking-tight text-ink">Място и характеристики</h2><p className="mb-6 mt-2 text-sm text-muted-foreground">Точният адрес остава личен, освен ако не решиш да го споделиш при разговор.</p><FieldGroup className="grid gap-4 md:grid-cols-2">
          <Field data-invalid={Boolean(form.formState.errors.city)}><FieldLabel htmlFor="city">Град</FieldLabel><Input autoComplete="address-level2" id="city" maxLength={100} placeholder="София" {...form.register('city')} aria-invalid={Boolean(form.formState.errors.city)} />{form.formState.errors.city ? <FieldError>{form.formState.errors.city.message}</FieldError> : null}</Field>
          <Field><FieldLabel htmlFor="neighborhood">Квартал</FieldLabel><Input id="neighborhood" maxLength={100} placeholder="Лозенец" {...form.register('neighborhood')} /></Field>
          <Field><FieldLabel htmlFor="rooms">Стаи</FieldLabel><Input id="rooms" max="30" min="0" type="number" {...form.register('rooms', { setValueAs: (value) => value === '' ? undefined : Number(value) })} /></Field>
          <Field><FieldLabel htmlFor="bedrooms">Спални</FieldLabel><Input id="bedrooms" max="30" min="0" type="number" {...form.register('bedrooms', { setValueAs: (value) => value === '' ? undefined : Number(value) })} /></Field>
          <Field><FieldLabel htmlFor="floor">Етаж</FieldLabel><Input id="floor" max="200" min="-5" type="number" {...form.register('floor', { setValueAs: (value) => value === '' ? undefined : Number(value) })} /></Field>
          <Field><FieldLabel htmlFor="total_floors">Етажи в сградата</FieldLabel><Input id="total_floors" max="200" min="1" type="number" {...form.register('total_floors', { setValueAs: (value) => value === '' ? undefined : Number(value) })} /></Field>
          <Field><FieldLabel htmlFor="construction_type">Строителство</FieldLabel><Input id="construction_type" placeholder="Тухла, панел…" {...form.register('construction_type')} /></Field>
          <Field><FieldLabel htmlFor="condition">Състояние</FieldLabel><Input id="condition" placeholder="Ново, за ремонт…" {...form.register('condition')} /></Field>
          <Field><FieldLabel htmlFor="furnishing">Обзавеждане</FieldLabel><Input id="furnishing" placeholder="Обзаведен, необзаведен…" {...form.register('furnishing')} /></Field>
          <Field className="md:col-span-2"><FieldLabel htmlFor="exact_address">Точен адрес <span className="font-normal text-muted-foreground">(личен, по избор)</span></FieldLabel><Input autoComplete="street-address" id="exact_address" maxLength={500} placeholder="Улица и номер" {...form.register('exact_address')} /><FieldDescription>Съхранява се отделно и се вижда само от теб и администратор.</FieldDescription></Field>
          <div className="md:col-span-2"><LocationPicker onPick={([lat, lng]) => { form.setValue('latitude', lat, { shouldValidate: true }); form.setValue('longitude', lng, { shouldValidate: true }) }} point={point} />{form.formState.errors.latitude ? <p className="mt-2 text-sm text-destructive">{form.formState.errors.latitude.message}</p> : null}</div>
        </FieldGroup></div> : null}
        {step === 2 ? <div><h2 className="text-2xl font-semibold tracking-tight text-ink">Снимки</h2><p className="mb-6 mt-2 text-sm text-muted-foreground">Добави до {maxImages} снимки. Първата е основна. JPG, PNG или WebP до 8 MB всяка.{photosSaved ? ' Снимките вече са качени за тази чернова.' : ''}</p><label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-brand/40 bg-brand/[0.035] p-6 text-center transition hover:bg-brand/[0.07]"><ImagePlus aria-hidden className="text-brand" size={28} /><span className="mt-3 font-semibold text-ink">Избери снимки от устройството</span><span className="mt-1 text-xs text-muted-foreground">{photos.length} от {maxImages} избрани</span><input accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={photosSaved} multiple onChange={(event) => { addPhotos(event.currentTarget.files); event.currentTarget.value = '' }} type="file" /></label>{photos.length ? <ul aria-label="Избрани снимки" className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">{photos.map((file, index) => <LocalPhoto file={file} index={index} isCover={index === 0} isLast={index === photos.length - 1} key={`${file.name}-${file.lastModified}-${index}`} locked={photosSaved} onMoveDown={() => setPhotos((items) => { if (index >= items.length - 1) return items; const next = [...items]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; return next })} onMoveUp={() => setPhotos((items) => { if (index <= 0) return items; const next = [...items]; [next[index], next[index - 1]] = [next[index - 1], next[index]]; return next })} onRemove={() => setPhotos((items) => items.filter((_, itemIndex) => itemIndex !== index))} />)}</ul> : null}</div> : null}
        {step === 3 ? <div><h2 className="text-2xl font-semibold tracking-tight text-ink">Провери преди изпращане</h2><p className="mb-6 mt-2 text-sm text-muted-foreground">Обявата ще се появи публично след одобрение.</p><div className="grid gap-3 rounded-2xl bg-paper p-5 sm:grid-cols-2"><div><p className="text-xs text-muted-foreground">Заглавие</p><p className="mt-1 font-semibold text-ink">{values.title || '—'}</p></div><div><p className="text-xs text-muted-foreground">Тип и сделка</p><p className="mt-1 font-semibold text-ink">{values.property_type ? propertyNames[values.property_type] : '—'} · {values.transaction_type ? transactionLabels[values.transaction_type] : '—'}</p></div><div><p className="text-xs text-muted-foreground">Локация</p><p className="mt-1 font-semibold text-ink">{[values.neighborhood, values.city].filter(Boolean).join(', ') || '—'}</p></div><div><p className="text-xs text-muted-foreground">Цена и площ</p><p className="mt-1 font-semibold text-ink">{values.price_eur ? formatPrice(Number(values.price_eur)) : '—'} · {values.area_sqm ? `${values.area_sqm} м²` : '—'}</p></div><div className="sm:col-span-2"><p className="text-xs text-muted-foreground">Снимки</p><p className="mt-1 font-semibold text-ink">{photos.length} {photos.length === 1 ? 'снимка' : 'снимки'}</p></div></div><p className="mt-4 rounded-xl border border-line p-4 text-sm leading-6 text-muted-foreground">Обявата се изпраща като „За одобрение“. Точният адрес остава личен и не се показва на публичната страница.</p></div> : null}
        {formMessage ? <p aria-live="polite" className="mt-5 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{formMessage}</p> : null}
        <div className="mt-8 flex flex-col-reverse justify-between gap-3 border-t border-line pt-5 sm:flex-row">{step > 0 ? <Button onClick={() => { setFormMessage(''); setStep((current) => current - 1) }} type="button" variant="outline"><ArrowLeft data-icon="inline-start" />Назад</Button> : <span />}{step < 3 ? <Button className="sm:min-w-40" onClick={nextStep} type="button">Продължи<ArrowRight data-icon="inline-end" /></Button> : <Button className="sm:min-w-52" disabled={form.formState.isSubmitting} type="submit">{form.formState.isSubmitting ? 'Изпращане…' : 'Изпрати за преглед'}{!form.formState.isSubmitting ? <Check data-icon="inline-end" /> : null}</Button>}</div>
      </form>
    </div>
  )
}
