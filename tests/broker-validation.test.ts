import { describe, expect, it } from 'vitest'
import { localDateTimeToUtc } from '@/lib/broker-validation'

describe('localDateTimeToUtc', () => {
  it('converts Sofia summer time to UTC', () => {
    expect(localDateTimeToUtc('2026-06-01T10:00')).toBe('2026-06-01T07:00:00.000Z')
  })

  it('converts Sofia winter time to UTC', () => {
    expect(localDateTimeToUtc('2026-01-15T10:00')).toBe('2026-01-15T08:00:00.000Z')
  })

  it('rejects invalid calendar values and daylight-saving gaps', () => {
    expect(localDateTimeToUtc('2026-02-30T10:00')).toBeNull()
    expect(localDateTimeToUtc('2026-03-29T03:30')).toBeNull()
  })
})
