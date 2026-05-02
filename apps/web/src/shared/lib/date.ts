const shortDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
})

const detailedFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export function formatShortDate(value: string | Date | null | undefined) {
  if (!value) {
    return 'Not scheduled'
  }
  return shortDateFormatter.format(typeof value === 'string' ? new Date(value) : value)
}

export function formatDetailedDate(value: string | Date | null | undefined) {
  if (!value) {
    return 'No timestamp'
  }
  return detailedFormatter.format(typeof value === 'string' ? new Date(value) : value)
}

export function formatDuration(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const seconds = safe % 60
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':')
}

export function formatMinutes(totalMinutes: number) {
  if (totalMinutes < 60) {
    return `${totalMinutes}m`
  }
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
}

export function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`
}

export function dateInputValue(value: Date) {
  return value.toISOString().slice(0, 10)
}

export function toDateTimeLocalValue(value: string | null | undefined) {
  if (!value) {
    return ''
  }
  const date = new Date(value)
  const offset = date.getTimezoneOffset()
  const adjusted = new Date(date.getTime() - offset * 60 * 1000)
  return adjusted.toISOString().slice(0, 16)
}

export function toIsoOrNull(value: string) {
  if (!value) {
    return null
  }
  return new Date(value).toISOString()
}

export function getWindowRange(days: number) {
  const end = new Date()
  const start = new Date()
  start.setDate(end.getDate() - days + 1)
  return {
    start: dateInputValue(start),
    end: dateInputValue(end),
  }
}
