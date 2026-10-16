import type { BizDate, DateTimeText } from '../types'

/** 一律按北京时间，和浏览器所在时区无关 */
const BEIJING_OFFSET_MS = 8 * 3600 * 1000

const pad = (n: number, len = 2) => String(n).padStart(len, '0')

function beijingParts(ms: number) {
  const d = new Date(ms + BEIJING_OFFSET_MS)
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth() + 1,
    d: d.getUTCDate(),
    hh: d.getUTCHours(),
    mm: d.getUTCMinutes(),
    ss: d.getUTCSeconds(),
  }
}

export function toDateTimeText(ms: number): DateTimeText {
  const p = beijingParts(ms)
  return `${p.y}-${pad(p.m)}-${pad(p.d)} ${pad(p.hh)}:${pad(p.mm)}:${pad(p.ss)}`
}

export function toBizDate(ms: number): BizDate {
  const p = beijingParts(ms)
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`
}

export function nowText(): DateTimeText {
  return toDateTimeText(Date.now())
}

/** 营业日按自然日切日，见【待确认-10】 */
export function todayBizDate(): BizDate {
  return toBizDate(Date.now())
}

/** 'YYYY-MM-DD HH:mm:ss'（北京时间）转毫秒 */
export function parseDateTime(text: DateTimeText): number {
  const [date, time = '00:00:00'] = text.split(' ')
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm, ss] = time.split(':').map(Number)
  return Date.UTC(y, m - 1, d, hh, mm, ss || 0) - BEIJING_OFFSET_MS
}

export function addDays(date: BizDate, days: number): BizDate {
  return toBizDate(parseDateTime(`${date} 12:00:00`) + days * 86400000)
}

/** 某营业日的某个时刻，minutes 为当天第几分钟 */
export function atMinute(date: BizDate, minutes: number, seconds = 0): DateTimeText {
  return `${date} ${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}:${pad(seconds)}`
}

/** 北京时间当天已过去的分钟数 */
export function minutesOfDay(ms: number = Date.now()): number {
  const p = beijingParts(ms)
  return p.hh * 60 + p.mm
}

export function compactDate(date: BizDate | DateTimeText): string {
  return date.slice(0, 10).replaceAll('-', '')
}

export function timeOf(text: DateTimeText | undefined | null): string {
  return text ? text.slice(11, 16) : '-'
}

export function shortDate(date: BizDate | DateTimeText | undefined | null): string {
  return date ? date.slice(5, 10) : '-'
}

export function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export const WEEKDAY = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

export function weekdayOf(date: BizDate): string {
  return WEEKDAY[new Date(parseDateTime(`${date} 12:00:00`) + BEIJING_OFFSET_MS).getUTCDay()]
}
