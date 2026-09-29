const WEI = 10n ** 18n

/** wei -> "1.2345" GEN (up to `digits` decimals, trailing zeros trimmed). */
export function fmtGen(wei: bigint, digits = 3): string {
  const scale = 10n ** BigInt(digits)
  const scaled = (wei * scale) / WEI
  const whole = scaled / scale
  const frac = (scaled % scale).toString().padStart(digits, '0').replace(/0+$/, '')
  return frac ? `${whole.toLocaleString('en-US')}.${frac}` : whole.toLocaleString('en-US')
}

export function fmtUsd(cents: number, compact = false): string {
  const dollars = cents / 100
  if (compact && Math.abs(dollars) >= 10_000) return `$${(dollars / 1000).toFixed(1)}k`
  return dollars.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: dollars % 1 ? 2 : 0 })
}

export const shortHash = (h: string, head = 6, tail = 4) =>
  h && h.length > head + tail + 2 ? `${h.slice(0, head)}…${h.slice(-tail)}` : h

export const shortAddr = (a: string) => shortHash(a, 6, 4)

export function timeAgo(unixSeconds: number, now = Date.now()): string {
  if (!unixSeconds) return '—'
  const s = Math.max(0, Math.floor(now / 1000 - unixSeconds))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export const bpsToPct = (bps: number) => `${(bps / 100).toFixed(2)}%`

/** Seconds -> "2d 4h", "3h 12m" or "5m". */
export function fmtCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${Math.max(1, m)}m`
}
