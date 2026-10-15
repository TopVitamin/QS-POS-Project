import { describe, expect, it } from 'vitest'
import { formatBillNo, isPosBillNo, nextBillNo, nextHubNo } from './numbering'

describe('单号', () => {
  it('格式是 {前缀}-{YYYYMMDD}-{序号}', () => {
    expect(formatBillNo('MDXS', '2026-10-15', 1)).toBe('MDXS-20261015-0001')
    expect(formatBillNo('MDXS', '2026-10-15 09:30:00', 12)).toBe('MDXS-20261015-0012')
  })

  it('超过9999扩成5位', () => {
    expect(formatBillNo('MDXS', '2026-10-15', 10000)).toBe('MDXS-20261015-10000')
  })

  it('同类型同一天递增，换天或换类型重新从0001起', () => {
    const counters: Record<string, number> = {}
    expect(nextBillNo(counters, 'sale', '2026-10-15')).toBe('MDXS-20261015-0001')
    expect(nextBillNo(counters, 'sale', '2026-10-15')).toBe('MDXS-20261015-0002')
    expect(nextBillNo(counters, 'return', '2026-10-15')).toBe('MDTH-20261015-0001')
    expect(nextBillNo(counters, 'sale', '2026-10-16')).toBe('MDXS-20261016-0001')
  })

  it('中枢号和POS单号格式不同，计数互不影响', () => {
    const counters: Record<string, number> = {}
    expect(nextHubNo(counters, 'result', '2026-10-15')).toBe('HUB20261015000001')
    expect(nextHubNo(counters, 'oms', '2026-10-15')).toBe('HUBOMS20261015000001')
    expect(isPosBillNo('MDXS-20261015-0001')).toBe(true)
    expect(isPosBillNo('HUB20261015000001')).toBe(false)
  })
})
