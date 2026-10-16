import type { Shift } from '../types'
import { nextBillNo } from '../domain/numbering'
import { checkDailyClose, checkHandover } from '../domain/rules'
import { dailySummary, shiftSummary } from '../domain/summary'
import * as hub from '../mock/hub'
import type { DemoDb } from '../mock/schema'
import { formatMoney } from '../utils/format'
import { nowText, todayBizDate } from '../utils/time'
import { byTimeDesc, command, fail, inStores, query, requirePerm, storeOf } from './core'

export function openShiftOn(storeId: string, registerNo: string) {
  return query((db) => db.shifts.find((s) => s.storeId === storeId && s.registerNo === registerNo && s.status === 'open') ?? null)
}

export function openShiftOf(jobNo: string) {
  return query((db) => db.shifts.find((s) => s.cashierJobNo === jobNo && s.status === 'open') ?? null)
}

export function get(no: string) {
  return query((db) => db.shifts.find((s) => s.no === no) ?? null)
}

export function open(input: { storeId: string; registerNo: string; cashierJobNo: string; float: number }) {
  return command((db) => {
    requirePerm(db, input.cashierJobNo, 'shift.handover', input.storeId)
    const store = storeOf(db, input.storeId)
    if (!store.registers.some((r) => r.no === input.registerNo)) fail('收银台不存在')
    const onRegister = db.shifts.find((s) => s.storeId === input.storeId && s.registerNo === input.registerNo && s.status === 'open')
    if (onRegister) fail('这台收银机已经有人开班，先交班')
    const mine = db.shifts.find((s) => s.cashierJobNo === input.cashierJobNo && s.status === 'open')
    if (mine) fail('你在另一台收银机还有没交班的班次')
    if (!Number.isInteger(input.float) || input.float < 0) fail('备用金不对')
    const today = todayBizDate()
    if (db.dailyCloses.some((d) => d.storeId === input.storeId && d.bizDate === today)) fail('今天已经日结封账，不能再开班', '重开日结要另行授权，原型未开放')
    const at = nowText()
    const shift: Shift = {
      no: nextBillNo(db.counters, 'shift', at),
      storeId: input.storeId,
      registerNo: input.registerNo,
      cashierJobNo: input.cashierJobNo,
      bizDate: today,
      openedAt: at,
      float: input.float,
      status: 'open',
    }
    db.shifts.push(shift)
    return shift
  })
}

function liveSummary(db: DemoDb, shift: Shift) {
  const sales = db.sales.filter((s) => s.shiftNo === shift.no)
  const returns = db.returns.filter((r) => r.shiftNo === shift.no)
  const openCheckouts = db.checkouts.filter((c) => c.shiftNo === shift.no && c.status === 'open')
  return {
    summary: shiftSummary(shift.float, sales, returns),
    sales,
    returns,
    openCheckouts,
    pendingPayments: openCheckouts.reduce((n, c) => n + c.payments.filter((p) => p.status === 'pending').length, 0),
  }
}

export function report(no: string) {
  return query((db) => {
    const shift = db.shifts.find((s) => s.no === no)
    if (!shift) fail('找不到班次')
    return { shift, ...liveSummary(db, shift) }
  })
}

/** 交班：有结果不明的支付先查单；差异必须写说明（阈值见【待确认-10】） */
export function handover(input: { shiftNo: string; countedCash: number | null; note: string; operatorJobNo: string }) {
  return command((db) => {
    const shift = db.shifts.find((s) => s.no === input.shiftNo)
    if (!shift || shift.status !== 'open') fail('班次已经交过了')
    requirePerm(db, input.operatorJobNo, 'shift.handover', shift.storeId)
    if (shift.cashierJobNo !== input.operatorJobNo) fail('不能封别人的班', '《8.角色权限原则》：导购不封别人的班')
    const live = liveSummary(db, shift)
    if (live.openCheckouts.some((c) => c.payments.some((p) => p.status === 'success'))) fail('还有一笔收了一部分款的结算，先完成或撤销')
    const check = checkHandover({
      pendingPayments: live.pendingPayments,
      expectedCash: live.summary.expectedCash,
      countedCash: input.countedCash,
      note: input.note,
    })
    if (!check.ok) fail(check.message!, check.basis)
    const at = nowText()
    live.openCheckouts.forEach((c) => {
      c.status = 'cancelled'
      c.cancelledAt = at
      c.cancelReason = '交班时清理未收款的结算'
    })
    Object.assign(shift, {
      status: 'closed',
      closedAt: at,
      summary: live.summary,
      countedCash: input.countedCash,
      cashDiff: check.diff,
      diffNote: input.note.trim() || undefined,
    })
    if (check.diff) {
      hub.audit(db, {
        action: '交班差异',
        at,
        operatorJobNo: input.operatorJobNo,
        storeId: shift.storeId,
        objectType: '班次',
        objectNo: shift.no,
        before: `应有现金${formatMoney(live.summary.expectedCash)}`,
        after: `实点${formatMoney(input.countedCash)}，差异${formatMoney(check.diff, { sign: true })}`,
        reason: input.note.trim(),
      })
    }
    return shift
  })
}

export function list(f: { storeIds?: string[]; bizDate?: string; status?: Shift['status'] } = {}) {
  return query((db) =>
    db.shifts
      .filter((s) => inStores(f.storeIds)(s) && (!f.bizDate || s.bizDate === f.bizDate) && (!f.status || s.status === f.status))
      .map((s) => (s.status === 'open' ? { ...s, summary: liveSummary(db, s).summary } : s))
      .sort(byTimeDesc((s) => s.openedAt)),
  )
}

function dayFacts(db: DemoDb, storeId: string, bizDate: string) {
  const sales = db.sales.filter((s) => s.storeId === storeId && s.bizDate === bizDate)
  const returns = db.returns.filter((r) => r.storeId === storeId && r.bizDate === bizDate)
  const pickups = db.verifications.filter((v) => v.storeId === storeId && v.result === 'success' && v.at.startsWith(bizDate)).length
  const agents = db.agentOrders.filter((o) => o.storeId === storeId && o.createdAt.startsWith(bizDate)).length
  return dailySummary(sales, returns, pickups, agents)
}

/** 日结预检：班次是否都交了，按支付方式的汇总 */
export function closePreview(storeId: string, bizDate: string) {
  return query((db) => {
    const shifts = db.shifts.filter((s) => s.storeId === storeId && s.bizDate === bizDate)
    const close = db.dailyCloses.find((d) => d.storeId === storeId && d.bizDate === bizDate)
    const check = checkDailyClose({
      shifts,
      alreadyClosed: !!close,
      pendingCheckouts: db.checkouts.filter((c) => c.storeId === storeId && c.status === 'open' && c.createdAt.startsWith(bizDate)).length,
    })
    return {
      store: storeOf(db, storeId),
      shifts: shifts.map((s) => (s.status === 'open' ? { ...s, summary: liveSummary(db, s).summary } : s)),
      close: close ?? null,
      due: close?.franchiseDueNo ? db.dues.find((d) => d.no === close.franchiseDueNo) ?? null : null,
      summary: close ? close.summary : dayFacts(db, storeId, bizDate),
      check,
    }
  })
}

export function closeDay(input: { storeId: string; bizDate: string; closerJobNo: string }) {
  return command((db) => {
    requirePerm(db, input.closerJobNo, 'daily.close', input.storeId)
    return hub.closeDay(db, input.storeId, input.bizDate, input.closerJobNo)
  })
}

export function closes(f: { storeIds?: string[]; from?: string; to?: string } = {}) {
  return query((db) =>
    db.dailyCloses
      .filter((d) => inStores(f.storeIds)(d) && (!f.from || d.bizDate >= f.from) && (!f.to || d.bizDate <= f.to))
      .sort(byTimeDesc((d) => d.bizDate + d.storeId)),
  )
}

/** 门店日报：当日实时汇总 + 是否已封账 */
export function dailyReport(storeId: string, bizDate: string) {
  return query((db) => {
    const close = db.dailyCloses.find((d) => d.storeId === storeId && d.bizDate === bizDate)
    return {
      summary: close ? close.summary : dayFacts(db, storeId, bizDate),
      close: close ?? null,
      shifts: db.shifts.filter((s) => s.storeId === storeId && s.bizDate === bizDate),
    }
  })
}
