// 復習・スタンプで使う「日付」（YYYY-MM-DD）。日付は端末の日付で数える（GAME_SPEC 7-6）。

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** 日時（ISO形式）を、端末のタイムゾーンでの日付にする */
export function localDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function toUtcMs(date: string): number {
  const m = DATE_PATTERN.exec(date)
  if (m === null) return Number.NaN
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

/** 日付として読めるか（YYYY-MM-DD） */
export function isDateString(v: unknown): v is string {
  return typeof v === 'string' && DATE_PATTERN.test(v) && !Number.isNaN(toUtcMs(v))
}

/** 日付に日数を足す */
export function addDays(date: string, days: number): string {
  const ms = toUtcMs(date)
  if (Number.isNaN(ms)) return date
  return new Date(ms + days * 86_400_000).toISOString().slice(0, 10)
}

/** from から to までの日数（to が後なら正） */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / 86_400_000)
}
