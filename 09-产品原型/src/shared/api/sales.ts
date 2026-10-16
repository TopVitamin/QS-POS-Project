import type { Checkout, PayMethod, Payment, PriceAdjustment, ReturnOrder, SaleLine, SaleOrder } from '../types'
import { canAuthorizeFor } from '../config/permissions'
import { activePromotions, priceCart, type PricingCoupon, type PricingResult } from '../domain/pricing'
import { nextBillNo } from '../domain/numbering'
import { allocateRefund, refundForLine } from '../domain/refund'
import { BASIS, canAdjustPrice, checkReturnable } from '../domain/rules'
import * as hub from '../mock/hub'
import * as payment from '../mock/payment'
import type { DemoDb } from '../mock/schema'
import { formatMoney } from '../utils/format'
import { uid } from '../utils/random'
import { nowText } from '../utils/time'
import { byTimeDesc, command, fail, inStores, productOf, query, requirePerm, storeOf } from './core'

export interface CartLineDraft {
  lineNo: number
  sku: string
  qty: number
  sns: string[]
  guideJobNo: string
}

export interface SaleDraft {
  storeId: string
  registerNo: string
  shiftNo: string
  cashierJobNo: string
  guideJobNo: string
  memberId?: string
  couponId?: string
  lines: CartLineDraft[]
  adjustments: PriceAdjustment[]
}

/** 收银台本地试算和成交复核用同一个入口，保证两边算法一致 */
export function priceDraft(db: Pick<DemoDb, 'products' | 'promotions' | 'members' | 'couponTemplates'>, draft: SaleDraft, at = nowText()): PricingResult {
  const lines = draft.lines.map((l) => {
    const p = db.products.find((x) => x.sku === l.sku)!
    return { lineNo: l.lineNo, sku: l.sku, categoryCode: p.categoryCode, qty: l.qty, unitPrice: p.price }
  })
  let coupon: PricingCoupon | null = null
  if (draft.couponId && draft.memberId) {
    const m = db.members.find((x) => x.id === draft.memberId)
    const c = m?.coupons.find((x) => x.id === draft.couponId && x.status === 'unused')
    const t = c && db.couponTemplates.find((x) => x.id === c.templateId)
    if (c && t) coupon = { couponId: c.id, template: t }
  }
  return priceCart({
    lines,
    promotions: activePromotions(db.promotions, draft.storeId, at),
    coupon,
    adjustments: draft.adjustments.map((a) => ({ lineNo: a.lineNo, after: a.after })),
  })
}

function openShiftOf(db: DemoDb, draft: Pick<SaleDraft, 'shiftNo' | 'storeId' | 'registerNo' | 'cashierJobNo'>) {
  const shift = db.shifts.find((s) => s.no === draft.shiftNo)
  if (!shift || shift.status !== 'open') fail('班次已交班或不存在，请重新登录开班')
  if (shift.storeId !== draft.storeId || shift.registerNo !== draft.registerNo) fail('班次和收银台不一致')
  if (shift.cashierJobNo !== draft.cashierJobNo) fail('只能在本人的班次里收款')
  return shift
}

function validateDraft(db: DemoDb, draft: SaleDraft) {
  const store = storeOf(db, draft.storeId)
  if (!draft.lines.length) fail('购物车是空的')
  for (const l of draft.lines) {
    const p = productOf(db, l.sku)
    if (!Number.isInteger(l.qty) || l.qty <= 0) fail(`${p.name}数量不对`)
    if (p.snRequired && l.sns.filter(Boolean).length !== l.qty) fail(`${p.name}需要逐件采集序列号`, '哪些品类强制采集见【待确认-11】')
    if (!db.employees.some((e) => e.jobNo === l.guideJobNo && e.duties.includes('guide'))) fail('请选择导购工号')
  }
  if (draft.memberId) {
    const m = db.members.find((x) => x.id === draft.memberId)
    if (!m || m.storeId !== draft.storeId) fail('只能识别本店会员', '会员是否跨店共享见【待确认-37】')
  }
  if (draft.adjustments.length) {
    const rule = canAdjustPrice(store)
    if (!rule.ok) fail(rule.message!, rule.basis)
    for (const a of draft.adjustments) {
      const authorizer = db.employees.find((e) => e.jobNo === a.authorizerJobNo)
      if (!canAuthorizeFor(authorizer, draft.storeId, db.stores)) fail('改价的授权人无效', '授权层级见【待确认-51】')
      if (!a.reason.trim()) fail('改价必须写原因', BASIS.price)
    }
  }
}

/** 点「结算」：中枢确认可用量，通过后才进入支付 */
export function startCheckout(draft: SaleDraft) {
  return command((db) => {
    requirePerm(db, draft.cashierJobNo, 'payment.collect', draft.storeId)
    openShiftOf(db, draft)
    validateDraft(db, draft)
    const priced = priceDraft(db, draft)
    if (priced.totals.payable <= 0) fail('应付为0，原型不支持零元单')
    const demand = draft.lines.map((l) => ({ sku: l.sku, name: productOf(db, l.sku).name, qty: l.qty }))
    const check = hub.checkAvailability(db, draft.storeId, demand)
    if (!check.ok) fail(`中枢拒绝：${check.message}`, check.basis, check.shortages)

    const existing = db.checkouts.find((c) => c.status === 'open' && c.storeId === draft.storeId && c.registerNo === draft.registerNo)
    if (existing) {
      if (existing.payments.some((p) => p.status !== 'failed')) fail('这台收银机还有一笔没收完的结算，先完成或撤销那一笔')
      existing.status = 'cancelled'
      existing.cancelledAt = nowText()
      existing.cancelReason = '重新结算'
    }
    const checkout: Checkout = {
      id: uid('co'),
      storeId: draft.storeId,
      registerNo: draft.registerNo,
      shiftNo: draft.shiftNo,
      cashierJobNo: draft.cashierJobNo,
      createdAt: nowText(),
      payable: priced.totals.payable,
      payments: [],
      refunds: [],
      status: 'open',
    }
    db.checkouts.push(checkout)
    return { checkout, pricing: priced }
  })
}

function openCheckout(db: DemoDb, id: string) {
  const c = db.checkouts.find((x) => x.id === id)
  if (!c || c.status !== 'open') fail('这笔结算已经结束')
  return c
}

const paidOf = (c: Checkout) => c.payments.filter((p) => p.status === 'success').reduce((s, p) => s + p.amount, 0)

export function pay(input: { checkoutId: string; method: PayMethod; amount: number; tendered?: number; operatorJobNo: string }) {
  return command((db) => {
    const c = openCheckout(db, input.checkoutId)
    requirePerm(db, input.operatorJobNo, 'payment.collect', c.storeId)
    if (c.payments.some((p) => p.status === 'pending')) fail('有一笔支付结果不明，先查单', BASIS.paymentPending)
    const remaining = c.payable - paidOf(c)
    if (remaining <= 0) fail('已经收齐了')
    if (!Number.isInteger(input.amount) || input.amount <= 0) fail('金额不对')
    if (input.method !== 'cash' && input.amount > remaining) fail('非现金不能超过待收金额')
    const amount = Math.min(input.amount, remaining)
    const at = nowText()
    const p = payment.charge(db, input.method, amount, at, input.method === 'cash' ? { tendered: input.tendered ?? input.amount } : undefined)
    c.payments.push(p)
    return { checkout: c, payment: p }
  })
}

export function queryPayment(input: { checkoutId: string; paymentId: string; operatorJobNo: string }) {
  return command((db) => {
    const c = openCheckout(db, input.checkoutId)
    const p = c.payments.find((x) => x.id === input.paymentId)
    if (!p) fail('找不到这笔支付')
    if (p.status !== 'pending') return { checkout: c, payment: p }
    payment.query(db, p, nowText())
    hub.audit(db, {
      action: '支付查单',
      operatorJobNo: input.operatorJobNo,
      storeId: c.storeId,
      objectType: '支付流水',
      objectNo: p.channelTxnNo ?? p.id,
      before: '结果不明',
      after: `通道返回成功 ${formatMoney(p.amount)}`,
    })
    return { checkout: c, payment: p }
  })
}

/** 中途取消：已经成功的部分原路退回，并留痕 */
export function cancelCheckout(input: { checkoutId: string; operatorJobNo: string; reason: string }) {
  return command((db) => {
    const c = openCheckout(db, input.checkoutId)
    if (c.payments.some((p) => p.status === 'pending')) fail('有一笔支付结果不明，先查单，确定结果后才能撤销', BASIS.paymentPending)
    const at = nowText()
    const ok = c.payments.filter((p) => p.status === 'success')
    for (const p of [...ok].reverse()) {
      c.refunds.push(payment.refund(db, p.method, p.amount, at))
      p.refunded = p.amount
    }
    c.status = 'cancelled'
    c.cancelledAt = at
    c.cancelReason = input.reason
    if (ok.length) {
      hub.audit(db, {
        action: '撤销收款',
        at,
        operatorJobNo: input.operatorJobNo,
        storeId: c.storeId,
        objectType: '结算',
        objectNo: c.id,
        before: `已收${formatMoney(paidOf(c))}`,
        after: `原路退回${ok.length}笔`,
        reason: input.reason,
      })
    }
    return c
  })
}

/** 收齐款：生成销售单并回传中枢。中枢拒绝时不生成销售单，结算保持未完成 */
export function completeCheckout(input: { checkoutId: string; draft: SaleDraft }) {
  return command((db) => {
    const c = openCheckout(db, input.checkoutId)
    const draft = input.draft
    if (c.payments.some((p) => p.status === 'pending')) fail('有一笔支付结果不明，先查单', BASIS.paymentPending)
    if (paidOf(c) !== c.payable) fail('还没有收齐')
    validateDraft(db, draft)
    const at = nowText()
    const priced = priceDraft(db, draft, at)
    if (priced.totals.payable !== c.payable) fail('价格或促销已经变化，请撤销后重新结算')
    const no = nextBillNo(db.counters, 'sale', at)
    const lines: SaleLine[] = priced.lines.map((pl) => {
      const d = draft.lines.find((x) => x.lineNo === pl.lineNo)!
      const p = productOf(db, d.sku)
      return {
        lineNo: pl.lineNo,
        sku: p.sku,
        name: p.name,
        spec: p.spec,
        barcode: p.barcodes[0],
        qty: d.qty,
        unitPrice: p.price,
        listAmount: pl.listAmount,
        promoDiscount: pl.promoDiscount,
        orderDiscount: pl.orderDiscount,
        couponDiscount: pl.couponDiscount,
        manualDiscount: pl.manualDiscount,
        payable: pl.payable,
        promoIds: pl.promoIds,
        sns: d.sns,
        guideJobNo: d.guideJobNo,
        returnedQty: 0,
        refundedAmount: 0,
      }
    })
    const adjustments = draft.adjustments.map((a) => {
      const pl = priced.lines.find((x) => x.lineNo === a.lineNo)!
      return { ...a, before: pl.beforeManual, after: pl.payable, at }
    })
    const sale: SaleOrder = {
      no,
      storeId: c.storeId,
      registerNo: c.registerNo,
      shiftNo: c.shiftNo,
      bizDate: at.slice(0, 10),
      createdAt: at,
      cashierJobNo: c.cashierJobNo,
      guideJobNo: draft.guideJobNo,
      memberId: draft.memberId,
      lines,
      promotions: priced.promotions,
      couponIds: priced.coupon?.applied ? [priced.coupon.couponId] : [],
      adjustments,
      totals: priced.totals,
      payments: c.payments.filter((p) => p.status === 'success'),
      status: 'paid',
      hubSync: { status: 'accepted', at, duplicateHits: 0 },
    }
    hub.postSale(db, sale, at)
    db.sales.push(sale)
    c.status = 'completed'
    c.saleNo = no
    if (sale.couponIds.length) {
      const m = db.members.find((x) => x.id === draft.memberId)
      const coupon = m?.coupons.find((x) => x.id === sale.couponIds[0])
      if (coupon) {
        coupon.status = 'used'
        coupon.usedOrderNo = no
      }
    }
    for (const a of adjustments) {
      hub.audit(db, {
        action: '改价',
        at,
        operatorJobNo: a.operatorJobNo,
        authorizerJobNo: a.authorizerJobNo,
        storeId: c.storeId,
        objectType: 'POS销售单',
        objectNo: no,
        before: `第${a.lineNo}行 ${formatMoney(a.before)}`,
        after: formatMoney(a.after),
        reason: a.reason,
      })
    }
    return sale
  })
}

export function openCheckouts(storeId: string, registerNo?: string) {
  return query((db) => db.checkouts.filter((c) => c.status === 'open' && c.storeId === storeId && (!registerNo || c.registerNo === registerNo)))
}

export interface SaleFilter {
  storeIds?: string[]
  bizDate?: string
  from?: string
  to?: string
  shiftNo?: string
  keyword?: string
  guideJobNo?: string
  status?: SaleOrder['status']
}

const matchSale = (f: SaleFilter) => (s: SaleOrder) =>
  inStores(f.storeIds)(s) &&
  (!f.bizDate || s.bizDate === f.bizDate) &&
  (!f.from || s.bizDate >= f.from) &&
  (!f.to || s.bizDate <= f.to) &&
  (!f.shiftNo || s.shiftNo === f.shiftNo) &&
  (!f.status || s.status === f.status) &&
  (!f.guideJobNo || s.lines.some((l) => l.guideJobNo === f.guideJobNo)) &&
  (!f.keyword || s.no.includes(f.keyword.trim()) || s.lines.some((l) => l.name.includes(f.keyword!.trim()) || l.sku.includes(f.keyword!.trim())))

export function list(f: SaleFilter = {}) {
  return query((db) => db.sales.filter(matchSale(f)).sort(byTimeDesc((s) => s.createdAt)))
}

export function get(no: string) {
  return query((db) => {
    const sale = db.sales.find((s) => s.no === no.trim())
    if (!sale) fail(`找不到销售单${no}`)
    const member = sale.memberId ? db.members.find((m) => m.id === sale.memberId) : undefined
    return {
      sale,
      returns: db.returns.filter((r) => r.originalSaleNo === sale.no),
      shift: db.shifts.find((s) => s.no === sale.shiftNo),
      dailyClose: db.dailyCloses.find((d) => d.no === sale.dailyCloseNo),
      member: member ? { id: member.id, name: member.name, phone: member.phone } : undefined,
      ledger: db.ledger.filter((l) => l.refNo === sale.no),
      logs: db.auditLogs.filter((l) => l.objectNo === sale.no),
    }
  })
}

/** 演示重复回传：中枢按来源单号去重 */
export function resubmit(no: string, operatorJobNo: string) {
  return command((db) => hub.resubmit(db, 'sale', no, operatorJobNo))
}

export function createReturn(input: {
  storeId: string
  registerNo: string
  shiftNo: string
  operatorJobNo: string
  saleNo: string
  reason: string
  lines: { lineNo: number; qty: number; sns: string[] }[]
}) {
  return command((db) => {
    requirePerm(db, input.operatorJobNo, 'return.create', input.storeId)
    const shift = openShiftOf(db, { ...input, cashierJobNo: input.operatorJobNo })
    const sale = db.sales.find((s) => s.no === input.saleNo.trim())
    if (!sale) fail('找不到原销售单，无原单退货原型未开放', '无原单退货要另行授权，层级见【待确认-51】')
    const rule = checkReturnable(sale, input.storeId)
    if (!rule.ok) fail(rule.message!, rule.basis)
    if (!input.reason.trim()) fail('请选择退货原因')
    const picked = input.lines.filter((l) => l.qty > 0)
    if (!picked.length) fail('请选择要退的行和数量')
    const at = nowText()
    const retLines = picked.map((l) => {
      const line = sale.lines.find((x) => x.lineNo === l.lineNo)
      if (!line) fail('原单没有这一行')
      const refund = refundForLine(line, l.qty)
      if (line.sns.length) {
        const available = line.sns.slice(line.returnedQty)
        if (l.sns.length !== l.qty || l.sns.some((sn) => !available.includes(sn))) fail(`${line.name}请核对要退的序列号`, '序列号规则见【待确认-11】')
      }
      return { line, qty: l.qty, refund, sns: l.sns }
    })
    const total = retLines.reduce((s, l) => s + l.refund, 0)
    const refunds: Payment[] = allocateRefund(sale.payments, total).map((a) => {
      sale.payments.find((p) => p.id === a.paymentId)!.refunded += a.amount
      return payment.refund(db, a.method, a.amount, at)
    })
    for (const l of retLines) {
      l.line.returnedQty += l.qty
      l.line.refundedAmount += l.refund
    }
    sale.status = sale.lines.every((l) => l.returnedQty === l.qty) ? 'returned' : 'partially_returned'
    const ret: ReturnOrder = {
      no: nextBillNo(db.counters, 'return', at),
      storeId: input.storeId,
      registerNo: input.registerNo,
      shiftNo: shift.no,
      originalSaleNo: sale.no,
      bizDate: at.slice(0, 10),
      createdAt: at,
      operatorJobNo: input.operatorJobNo,
      guideJobNo: retLines[0].line.guideJobNo,
      reason: input.reason,
      lines: retLines.map((l) => ({ lineNo: l.line.lineNo, sku: l.line.sku, name: l.line.name, spec: l.line.spec, qty: l.qty, refund: l.refund, sns: l.sns })),
      refunds,
      total,
      hubSync: { status: 'accepted', at, duplicateHits: 0 },
    }
    hub.postReturn(db, ret, at)
    db.returns.push(ret)
    hub.audit(db, {
      action: '退货',
      at,
      operatorJobNo: input.operatorJobNo,
      storeId: input.storeId,
      objectType: '退货单',
      objectNo: ret.no,
      before: `原单${sale.no}`,
      after: `${ret.lines.map((l) => `${l.name}×${l.qty}`).join('、')}，应退${formatMoney(total)}`,
      reason: input.reason,
    })
    return ret
  })
}

export interface ReturnFilter {
  storeIds?: string[]
  bizDate?: string
  shiftNo?: string
  keyword?: string
}

export function listReturns(f: ReturnFilter = {}) {
  return query((db) =>
    db.returns
      .filter(
        (r) =>
          inStores(f.storeIds)(r) &&
          (!f.bizDate || r.bizDate === f.bizDate) &&
          (!f.shiftNo || r.shiftNo === f.shiftNo) &&
          (!f.keyword || r.no.includes(f.keyword.trim()) || r.originalSaleNo.includes(f.keyword.trim())),
      )
      .sort(byTimeDesc((r) => r.createdAt)),
  )
}

export function getReturn(no: string) {
  return query((db) => {
    const ret = db.returns.find((r) => r.no === no)
    if (!ret) fail('找不到退货单')
    return { ret, sale: db.sales.find((s) => s.no === ret.originalSaleNo) }
  })
}

export interface PaymentRow {
  id: string
  kind: 'sale' | 'refund' | 'unfinished'
  docNo: string
  storeId: string
  method: PayMethod
  amount: number
  status: Payment['status']
  channelTxnNo?: string
  createdAt: string
  queriedAt?: string
  note?: string
}

/** 支付流水：成交收款、退货退款、没有成单的结算（失败、撤销退回）都列出来 */
export function payments(f: { storeIds?: string[]; bizDate?: string; method?: PayMethod; status?: Payment['status'] } = {}) {
  return query((db) => {
    const rows: PaymentRow[] = []
    for (const s of db.sales) {
      for (const p of s.payments) rows.push({ ...p, kind: 'sale', docNo: s.no, storeId: s.storeId })
    }
    for (const r of db.returns) {
      for (const p of r.refunds) rows.push({ ...p, kind: 'refund', docNo: r.no, storeId: r.storeId })
    }
    for (const c of db.checkouts.filter((x) => x.status !== 'completed')) {
      for (const p of c.payments) rows.push({ ...p, kind: 'unfinished', docNo: '-', storeId: c.storeId, note: c.status === 'cancelled' ? `结算已撤销：${c.cancelReason ?? ''}` : '结算未完成' })
      for (const p of c.refunds) rows.push({ ...p, kind: 'refund', docNo: '-', storeId: c.storeId, note: '撤销收款原路退回' })
    }
    return rows
      .filter(
        (r) =>
          inStores(f.storeIds)(r) &&
          (!f.bizDate || r.createdAt.startsWith(f.bizDate)) &&
          (!f.method || r.method === f.method) &&
          (!f.status || r.status === f.status),
      )
      .sort(byTimeDesc((r) => r.createdAt))
  })
}
