const localDateTimePattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/

export function localDateTimeToUtc(value: string, timeZone = 'Europe/Sofia'): string | null {
  const match = localDateTimePattern.exec(value)
  if (!match) return null

  const [year, month, day, hour, minute] = match.slice(1).map(Number)
  const requestedAsUtc = Date.UTC(year, month - 1, day, hour, minute)
  const calendarCheck = new Date(requestedAsUtc)
  if (
    calendarCheck.getUTCFullYear() !== year ||
    calendarCheck.getUTCMonth() !== month - 1 ||
    calendarCheck.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59
  ) return null

  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
    let candidate = requestedAsUtc

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const parts = formatter.formatToParts(new Date(candidate))
      const localParts = Object.fromEntries(parts.map((part) => [part.type, part.value]))
      const representedAsUtc = Date.UTC(
        Number(localParts.year),
        Number(localParts.month) - 1,
        Number(localParts.day),
        Number(localParts.hour),
        Number(localParts.minute),
        Number(localParts.second),
      )
      const correction = requestedAsUtc - representedAsUtc
      if (correction === 0) return new Date(candidate).toISOString()
      candidate += correction
    }
  } catch {
    return null
  }

  return null
}
