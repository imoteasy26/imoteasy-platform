'use client'

import Image from 'next/image'
import { useState, useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'
import { deleteListingImage, registerListingImages, updateListingImageAltText } from '@/app/publish/actions'
import { LISTING_ALT_TEXT_MAX_LENGTH, listingAltTextIsRequired } from '@/lib/listing-alt-text'

type EditableImage = {
  id: string
  storage_path: string
  alt_text: string
  position: number
  is_cover: boolean
  signed_url: string
}

const maximumImages = 8
const maximumImageBytes = 8 * 1024 * 1024
const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp']

export function ListingImageManager({ listingId, listingStatus, ownerId, initialImages }: { listingId: string; listingStatus: string; ownerId: string; initialImages: EditableImage[] }) {
  const [images, setImages] = useState(initialImages)
  const [draftAlt, setDraftAlt] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()
  const altRequired = listingAltTextIsRequired(listingStatus)

  async function uploadFiles(files: File[]) {
    if (images.length + files.length > maximumImages) {
      setMessage(`Можеш да добавиш най-много ${maximumImages - images.length} снимки.`)
      return
    }
    if (files.some((file) => !allowedImageTypes.includes(file.type) || file.size > maximumImageBytes)) {
      setMessage('Използвай JPG, PNG или WebP до 8 MB на снимка.')
      return
    }

    setMessage('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || user.id !== ownerId) {
      setMessage('Сесията ти изтече. Влез отново и опитай пак.')
      return
    }

    const uploadedPaths: string[] = []
    for (const file of files) {
      const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
      const path = `${user.id}/${listingId}/${crypto.randomUUID()}.${extension}`
      const { error } = await supabase.storage.from('imoteasy-listings').upload(path, file, { contentType: file.type, upsert: false })
      if (error) {
        if (uploadedPaths.length) await supabase.storage.from('imoteasy-listings').remove(uploadedPaths)
        setMessage('Не успяхме да качим снимките. Опитай отново.')
        return
      }
      uploadedPaths.push(path)
    }

    startTransition(async () => {
      const result = await registerListingImages(listingId, uploadedPaths)
      if (!result.success) {
        await supabase.storage.from('imoteasy-listings').remove(uploadedPaths)
        setMessage(result.message)
        return
      }
      setImages((current) => [...current, ...result.images].sort((left, right) => left.position - right.position))
      setMessage('Снимките са качени.')
    })
  }

  function removeImage(image: EditableImage) {
    startTransition(async () => {
      const result = await deleteListingImage(listingId, image.id)
      if (!result.success) {
        setMessage(result.message)
        return
      }
      setImages((current) => {
        const remaining = current.filter((item) => item.id !== image.id)
        if (image.is_cover && remaining[0]) remaining[0] = { ...remaining[0], is_cover: true }
        return remaining
      })
      setMessage('Снимката е изтрита.')
    })
  }

  function saveAltText(image: EditableImage) {
    const nextValue = draftAlt[image.id] ?? image.alt_text
    startTransition(async () => {
      const result = await updateListingImageAltText(listingId, image.id, nextValue)
      if (!result.success) {
        setMessage(result.message)
        return
      }
      setImages((current) => current.map((item) => item.id === image.id ? { ...item, alt_text: result.altText } : item))
      setDraftAlt((current) => {
        const next = { ...current }
        delete next[image.id]
        return next
      })
      setMessage('Алтернативният текст е запазен.')
    })
  }

  return (
    <section aria-labelledby="listing-images-heading" className="rounded-2xl border border-line bg-white p-5 sm:p-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-ink" id="listing-images-heading">Снимки</h2>
        <p className="mt-1 text-sm text-muted-foreground">Първата снимка е основна. Можеш да добавяш или премахваш до {maximumImages} снимки и да редактираш алтернативния текст.</p>
      </div>
      <Field className="mt-5">
        <FieldLabel htmlFor="listing-image-upload">Добави снимки</FieldLabel>
        <input accept="image/jpeg,image/png,image/webp" className="form-control file:mr-3 file:rounded-lg file:border-0 file:bg-brand/10 file:px-3 file:py-2 file:font-semibold file:text-brand" disabled={isPending || images.length >= maximumImages} id="listing-image-upload" multiple onChange={(event) => { const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ''; void uploadFiles(files) }} type="file" />
        <FieldDescription>{images.length} от {maximumImages} снимки · JPG, PNG или WebP до 8 MB всяка.</FieldDescription>
      </Field>
      {images.length ? (
        <ul aria-label="Качени снимки" className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((image, index) => {
            const value = draftAlt[image.id] ?? image.alt_text
            const emptyPublished = altRequired && value.trim().length === 0
            return (
              <li className="overflow-hidden rounded-xl border border-line" key={image.id}>
                <div className="relative aspect-[1.35] bg-subtle">
                  {image.signed_url ? <Image alt={image.alt_text || `Снимка ${index + 1}`} className="object-cover" fill sizes="(max-width: 640px) 50vw, 33vw" src={image.signed_url} /> : <div aria-label="Снимката временно не е достъпна" className="grid size-full place-items-center text-xs text-muted-foreground" role="img">Снимката временно не е достъпна</div>}
                  <span className="absolute left-2 top-2 rounded-md bg-white/95 px-2 py-1 text-[10px] font-bold text-ink">{image.is_cover ? 'Основна снимка' : `Снимка ${index + 1}`}</span>
                </div>
                <div className="flex flex-col gap-2 p-2">
                  <Field>
                    <FieldLabel htmlFor={`listing-image-alt-${image.id}`}>Алтернативен текст</FieldLabel>
                    <Input
                      id={`listing-image-alt-${image.id}`}
                      maxLength={LISTING_ALT_TEXT_MAX_LENGTH}
                      onChange={(event) => setDraftAlt((current) => ({ ...current, [image.id]: event.target.value }))}
                      value={value}
                    />
                    {emptyPublished ? <FieldDescription className="text-destructive">Публикуваната обява трябва да има описание за тази снимка.</FieldDescription> : <FieldDescription>{value.length} от {LISTING_ALT_TEXT_MAX_LENGTH} символа</FieldDescription>}
                  </Field>
                  <div className="flex items-center justify-between gap-2">
                    <Button disabled={isPending || value === image.alt_text} onClick={() => saveAltText(image)} size="sm" type="button">Запази текста</Button>
                    <Button aria-label={`Изтрий снимка ${index + 1}`} disabled={isPending} onClick={() => removeImage(image)} size="sm" type="button" variant="outline"><Trash2 data-icon="inline-start" />Изтрий</Button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      ) : <p className="mt-5 rounded-xl border border-dashed border-line p-5 text-sm text-muted-foreground">Все още няма качени снимки.</p>}
      {message ? <p aria-live="polite" className={`mt-4 text-sm ${message.includes('Не успяхме') || message.includes('изтече') || message.includes('най-много') || message.includes('Използвай') || message.includes('трябва да има') || message.includes('не е') ? 'text-destructive' : 'text-brand'}`}>{message}</p> : null}
    </section>
  )
}
