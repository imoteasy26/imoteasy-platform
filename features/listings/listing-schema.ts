import { z } from 'zod'

const optionalNumber = (schema: z.ZodNumber) => z.preprocess((value) => value === '' || value === null || value === undefined || (typeof value === 'number' && Number.isNaN(value)) ? undefined : Number(value), schema.optional())

export const listingSchema = z.object({
  title: z.string().trim().min(10, 'Заглавието трябва да е поне 10 символа.').max(120),
  description: z.string().trim().min(30, 'Добави поне 30 символа описание.').max(10000),
  property_type: z.enum(['apartment', 'house', 'land', 'office', 'shop', 'warehouse', 'other']),
  transaction_type: z.enum(['sale', 'rent']),
  city: z.string().trim().min(2, 'Въведи град.').max(100),
  neighborhood: z.string().trim().max(100).optional(),
  price_eur: z.coerce.number().positive('Цената трябва да е над 0.').max(1_000_000_000),
  area_sqm: z.coerce.number().positive('Площта трябва да е над 0.').max(1_000_000),
  rooms: optionalNumber(z.number().int().min(0).max(30)),
  bedrooms: optionalNumber(z.number().int().min(0).max(30)),
  floor: optionalNumber(z.number().int().min(-5).max(200)),
  total_floors: optionalNumber(z.number().int().min(1).max(200)),
  construction_type: z.string().trim().max(80).optional(),
  condition: z.string().trim().max(80).optional(),
  furnishing: z.string().trim().max(80).optional(),
  exact_address: z.string().trim().max(500).optional(),
  latitude: optionalNumber(z.number().min(-90).max(90)),
  longitude: optionalNumber(z.number().min(-180).max(180)),
}).refine((data) => (data.latitude === undefined) === (data.longitude === undefined), {
  message: 'Маркирай и двете координати или остави локацията празна.', path: ['latitude'],
})

export type ListingFormValues = z.infer<typeof listingSchema>
