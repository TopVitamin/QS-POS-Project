import type {
  AgentOrder,
  DateTimeText,
  Payment,
  PriceAdjustment,
  ReturnOrder,
  SaleLine,
  SaleOrder,
  Shift,
  Stocktake,
} from '../../types'
import { activePromotions, priceCart, type PricingAdjustment, type PricingCoupon } from '../../domain/pricing'
import { nextBillNo } from '../../domain/numbering'
import { allocateRefund, refundForLine } from '../../domain/refund'
import { shiftSummary } from '../../domain/summary'
import { RETURN_REASONS } from '../../config/labels'
import { formatMoney } from '../../utils/format'
import { createRng } from '../../utils/random'
import { addDays, atMinute, minutesOfDay, toBizDate, toDateTimeText } from '../../utils/time'
import * as hub from '../hub'
import * as pay from '../payment'
import { SCHEMA_VERSION, type DemoDb } from '../schema'
import { buildMembers, buildPromotions, CATEGORIES, COUPON_TEMPLATES, PRODUCTS } from './catalog'
import { EMPLOYEES, FRANCHISEES, NODES, STORES } from './org'

/**
 * 演示数据生成器：过去7天加今天到此刻。所有成交、退货、核销、收货、盘点都走同一套
 * 中枢模拟和价格计算，所以日结、交班、应缴、库存流水的数字能互相对上。
 * 固定随机种子，同一天生成的数据完全一样。
 */

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))

interface StorePlan {
  perDay: [number, number]
  /** 今天每隔多少分钟一单，0 表示今天还没开班 */
  todayEvery: number
  twoShifts: boolean
  cashiers: [string, string]
  guides: string[]
  manager: string
}

const PLAN: Record<string, StorePlan> = {
  s01: { perDay: [10, 14], todayEvery: 38, twoShifts: true, cashiers: ['QS1002', 'QS1001'], guides: ['QS1003', 'QS1002', 'QS1001'], manager: 'QS1001' },
  s02: { perDay: [6, 9], todayEvery: 70, twoShifts: false, cashiers: ['QS2001', 'QS2001'], guides: ['QS2001'], manager: 'QS2001' },
  s03: { perDay: [5, 8], todayEvery: 80, twoShifts: false, cashiers: ['JMA101', 'JMA101'], guides: ['JMA101'], manager: 'JMA101' },
  s04: { perDay: [4, 7], todayEvery: 0, twoShifts: false, cashiers: ['JMB101', 'JMB101'], guides: ['JMB101'], manager: 'JMB101' },
}

/**
 * 万象天地店这三个 SKU 的期末数是设计过的：
 * 氮化镓充电套装只剩2件且都被自提锁定（叙事里「最后2件」），140W无货，磁吸10000只剩1件。
 * 它们在种子里只出不进，第二遍生成时反推期初，让期末正好等于设计值。
 */
const S01_TARGET: Record<string, number> = { SP0401010001: 2, SP0101020003: 0, SP0301010002: 1 }
const OUT_ONLY = Object.keys(S01_TARGET)

const FLOAT = 50000
const ADJUST_REASONS = ['外包装轻微破损', '价签与系统价不一致', '展示样机']

const defaultOpening = (price: number) => (price <= 10000 ? 34 : price <= 20000 ? 22 : 12)

export function buildSeed(nowMs: number = Date.now()): DemoDb {
  return buildSeedWithReport(nowMs).db
}

/** errors 收集执行失败的种子任务，单测要求为空 */
export function buildSeedWithReport(nowMs: number = Date.now()): { db: DemoDb; errors: string[] } {
  const first = generate(nowMs, () => undefined)
  const sold: Record<string, number> = {}
  for (const l of first.db.ledger) {
    if (l.storeId === 's01' && OUT_ONLY.includes(l.sku) && l.change < 0) sold[l.sku] = (sold[l.sku] ?? 0) - l.change
  }
  return generate(nowMs, (storeId, sku) => (storeId === 's01' && sku in S01_TARGET ? S01_TARGET[sku] + (sold[sku] ?? 0) : undefined))
}

function generate(
  nowMs: number,
  openingOverride: (storeId: string, sku: string) => number | undefined,
): { db: DemoDb; errors: string[] } {
  const today = toBizDate(nowMs)
  const nowMin = minutesOfDay(nowMs)
  const rng = createRng(20261015)
  const db: DemoDb = {
    schema: SCHEMA_VERSION,
    seedDate: today,
    seededAt: toDateTimeText(nowMs),
    stores: clone(STORES),
    franchisees: clone(FRANCHISEES),
    nodes: clone(NODES),
    employees: clone(EMPLOYEES),
    categories: clone(CATEGORIES),
    products: clone(PRODUCTS),
    promotions: buildPromotions(today),
    couponTemplates: clone(COUPON_TEMPLATES),
    members: buildMembers(today),
    stock: [],
    ledger: [],
    sales: [],
    returns: [],
    checkouts: [],
    pickups: [],
    verifications: [],
    agentOrders: [],
    replenishments: [],
    shipments: [],
    receipts: [],
    discrepancies: [],
    stocktakes: [],
    returnsToWarehouse: [],
    shifts: [],
    dailyCloses: [],
    dues: [],
    remittances: [],
    settlements: [],
    auditLogs: [],
    counters: {},
    hubProcessed: {},
    sim: { nextPayResult: 'success' },
  }
  for (const s of db.stores) {
    for (const p of db.products) {
      const onHand = openingOverride(s.id, p.sku) ?? defaultOpening(p.price)
      db.stock.push({ storeId: s.id, sku: p.sku, onHand, locked: 0, inTransit: 0 })
    }
  }

  // ---- 任务按时间排序后依次执行，单号就按时间先后递增 ----
  const tasks: { at: DateTimeText; seq: number; run: () => void }[] = []
  const schedule = (at: DateTimeText, run: () => void) => tasks.push({ at, seq: tasks.length, run })
  const day = (n: number) => addDays(today, n)
  const at = (n: number, min: number, sec = 0) => atMinute(day(n), min, sec)
  const hasToday = nowMin >= 120
  /** 今天的事件不能晚于此刻 */
  const todayAt = (min: number) => atMinute(today, Math.max(0, Math.min(min, nowMin - 2)))
  const product = (sku: string) => db.products.find((p) => p.sku === sku)!

  const openShifts: Record<string, Shift | undefined> = {}

  function openShift(storeId: string, registerNo: string, cashierJobNo: string, when: DateTimeText) {
    schedule(when, () => {
      const shift: Shift = {
        no: nextBillNo(db.counters, 'shift', when),
        storeId,
        registerNo,
        cashierJobNo,
        bizDate: when.slice(0, 10),
        openedAt: when,
        float: FLOAT,
        status: 'open',
      }
      db.shifts.push(shift)
      openShifts[storeId] = shift
    })
  }

  function closeShift(storeId: string, when: DateTimeText) {
    schedule(when, () => {
      const shift = openShifts[storeId]
      if (!shift) return
      const summary = shiftSummary(
        shift.float,
        db.sales.filter((s) => s.shiftNo === shift.no),
        db.returns.filter((r) => r.shiftNo === shift.no),
      )
      let diff = 0
      let note: string | undefined
      if (rng.chance(0.12)) {
        diff = rng.pick([-2000, -500, -100, 100, 1000])
        note = diff < 0 ? '找零时多找给顾客' : '顾客未取走找零'
      }
      Object.assign(shift, {
        status: 'closed',
        closedAt: when,
        summary,
        countedCash: summary.expectedCash + diff,
        cashDiff: diff,
        diffNote: note,
      })
      if (diff !== 0) {
        hub.audit(db, {
          action: '交班差异',
          at: when,
          operatorJobNo: shift.cashierJobNo,
          storeId,
          objectType: '班次',
          objectNo: shift.no,
          before: `应有现金${formatMoney(summary.expectedCash)}`,
          after: `实点${formatMoney(summary.expectedCash + diff)}，差异${formatMoney(diff, { sign: true })}`,
          reason: note,
        })
      }
      openShifts[storeId] = undefined
    })
  }

  function makePayments(amount: number, when: DateTimeText): Payment[] {
    if (amount > 10000 && rng.chance(0.06)) {
      const cashPart = Math.floor(amount / 2 / 1000) * 1000
      return [pay.charge(db, 'cash', cashPart, when, { tendered: cashPart }), pay.charge(db, 'wechat', amount - cashPart, when)]
    }
    const method = rng.weighted([
      ['wechat', 45],
      ['alipay', 28],
      ['unionpay', 12],
      ['cash', 15],
    ] as const)
    if (method === 'cash') {
      const tendered = rng.chance(0.3) ? amount : Math.ceil(amount / 5000) * 5000
      return [pay.charge(db, 'cash', amount, when, { tendered })]
    }
    return [pay.charge(db, method, amount, when)]
  }

  function sale(storeId: string, when: DateTimeText) {
    schedule(when, () => {
      const shift = openShifts[storeId]
      if (!shift) return
      const plan = PLAN[storeId]
      const store = db.stores.find((s) => s.id === storeId)!
      const n = rng.weighted([
        [1, 55],
        [2, 33],
        [3, 12],
      ] as const)
      const picks = rng.shuffle(db.products.filter((p) => p.status === 'active')).slice(0, n)
      const lines = picks
        .map((p) => ({
          lineNo: 0,
          sku: p.sku,
          categoryCode: p.categoryCode,
          unitPrice: p.price,
          qty: p.categoryCode.startsWith('02') && rng.chance(0.35) ? 2 : 1,
        }))
        .filter((l) => hub.checkAvailability(db, storeId, [{ sku: l.sku, name: '', qty: l.qty }]).ok)
      if (!lines.length) return
      lines.forEach((l, i) => (l.lineNo = i + 1))

      const members = db.members.filter((m) => m.storeId === storeId)
      const member = members.length && rng.chance(0.3) ? rng.pick(members) : undefined
      const promotions = activePromotions(db.promotions, storeId, when)
      // 每位会员至少留一张未用券，当天收银还能演示用券
      const unused = member?.coupons.filter((c) => c.status === 'unused') ?? []
      let coupon: PricingCoupon | undefined =
        unused.length > 1 && rng.chance(0.6) ? { couponId: unused[0].id, template: db.couponTemplates.find((t) => t.id === unused[0].templateId)! } : undefined
      let priced = priceCart({ lines, promotions, coupon })
      if (coupon && !priced.coupon?.applied) {
        coupon = undefined
        priced = priceCart({ lines, promotions })
      }

      let adjustment: PriceAdjustment | undefined
      if (store.mode === 'direct' && rng.chance(0.06)) {
        const target = rng.pick(priced.lines)
        const before = target.beforeManual
        const after = Math.floor((before * (100 - rng.int(3, 8))) / 10000) * 100
        if (after > 0 && after < before) {
          const adjustments: PricingAdjustment[] = [{ lineNo: target.lineNo, after }]
          priced = priceCart({ lines, promotions, coupon, adjustments })
          adjustment = {
            lineNo: target.lineNo,
            sku: lines.find((l) => l.lineNo === target.lineNo)!.sku,
            before,
            after,
            reason: rng.pick(ADJUST_REASONS),
            operatorJobNo: shift.cashierJobNo,
            authorizerJobNo: plan.manager,
            at: when,
          }
        }
      }

      const guide = rng.pick(plan.guides)
      const payments = makePayments(priced.totals.payable, when)
      const no = nextBillNo(db.counters, 'sale', when)
      const saleLines: SaleLine[] = priced.lines.map((pl) => {
        const l = lines.find((x) => x.lineNo === pl.lineNo)!
        const p = product(l.sku)
        return {
          lineNo: pl.lineNo,
          sku: p.sku,
          name: p.name,
          spec: p.spec,
          barcode: p.barcodes[0],
          qty: l.qty,
          unitPrice: p.price,
          listAmount: pl.listAmount,
          promoDiscount: pl.promoDiscount,
          orderDiscount: pl.orderDiscount,
          couponDiscount: pl.couponDiscount,
          manualDiscount: pl.manualDiscount,
          payable: pl.payable,
          promoIds: pl.promoIds,
          sns: p.snRequired ? Array.from({ length: l.qty }, () => `SN${p.sku.slice(-6)}${rng.digits(6)}`) : [],
          guideJobNo: guide,
          returnedQty: 0,
          refundedAmount: 0,
        }
      })
      const order: SaleOrder = {
        no,
        storeId,
        registerNo: shift.registerNo,
        shiftNo: shift.no,
        bizDate: when.slice(0, 10),
        createdAt: when,
        cashierJobNo: shift.cashierJobNo,
        guideJobNo: guide,
        memberId: member?.id,
        lines: saleLines,
        promotions: priced.promotions,
        couponIds: coupon ? [coupon.couponId] : [],
        adjustments: adjustment ? [adjustment] : [],
        totals: priced.totals,
        payments,
        status: 'paid',
        hubSync: { status: 'accepted', at: when, duplicateHits: 0 },
      }
      hub.postSale(db, order, when)
      db.sales.push(order)
      if (coupon && member) {
        const c = member.coupons.find((x) => x.id === coupon!.couponId)!
        c.status = 'used'
        c.usedOrderNo = no
      }
      if (adjustment) {
        hub.audit(db, {
          action: '改价',
          at: when,
          operatorJobNo: adjustment.operatorJobNo,
          authorizerJobNo: adjustment.authorizerJobNo,
          storeId,
          objectType: 'POS销售单',
          objectNo: no,
          before: `第${adjustment.lineNo}行 ${formatMoney(adjustment.before)}`,
          after: formatMoney(adjustment.after),
          reason: adjustment.reason,
        })
      }
    })
  }

  function returnOne(storeId: string, when: DateTimeText) {
    schedule(when, () => {
      const shift = openShifts[storeId]
      if (!shift) return
      const date = when.slice(0, 10)
      const candidates = db.sales.filter(
        (s) =>
          s.storeId === storeId &&
          s.bizDate === date &&
          s.status === 'paid' &&
          s.createdAt < when &&
          !(storeId === 's01' && s.lines.some((l) => OUT_ONLY.includes(l.sku))),
      )
      if (!candidates.length) return
      const sale = rng.pick(candidates)
      const line = rng.pick(sale.lines)
      const qty = line.qty > 1 && rng.chance(0.5) ? 1 : line.qty - line.returnedQty
      const refund = refundForLine(line, qty)
      const refunds = allocateRefund(sale.payments, refund).map((a) => {
        sale.payments.find((p) => p.id === a.paymentId)!.refunded += a.amount
        return pay.refund(db, a.method, a.amount, when)
      })
      const sns = line.sns.slice(line.returnedQty, line.returnedQty + qty)
      line.returnedQty += qty
      line.refundedAmount += refund
      sale.status = sale.lines.every((l) => l.returnedQty === l.qty) ? 'returned' : 'partially_returned'
      const ret: ReturnOrder = {
        no: nextBillNo(db.counters, 'return', when),
        storeId,
        registerNo: shift.registerNo,
        shiftNo: shift.no,
        originalSaleNo: sale.no,
        bizDate: date,
        createdAt: when,
        operatorJobNo: shift.cashierJobNo,
        guideJobNo: line.guideJobNo,
        reason: rng.pick(RETURN_REASONS.slice(0, 3)),
        lines: [{ lineNo: line.lineNo, sku: line.sku, name: line.name, spec: line.spec, qty, refund, sns }],
        refunds,
        total: refund,
        hubSync: { status: 'accepted', at: when, duplicateHits: 0 },
      }
      hub.postReturn(db, ret, when)
      db.returns.push(ret)
      hub.audit(db, {
        action: '退货',
        at: when,
        operatorJobNo: ret.operatorJobNo,
        storeId,
        objectType: '退货单',
        objectNo: ret.no,
        before: `原单${sale.no}`,
        after: `退${line.name}×${qty}，应退${formatMoney(refund)}`,
        reason: ret.reason,
      })
    })
  }

  // ---- 每家店每天的班次、成交、退货、日结 ----
  for (let n = -7; n <= -1; n++) {
    for (const store of db.stores) {
      const plan = PLAN[store.id]
      const count = rng.int(plan.perDay[0], plan.perDay[1])
      openShift(store.id, '01', plan.cashiers[0], at(n, 595))
      if (plan.twoShifts) {
        closeShift(store.id, at(n, 960))
        openShift(store.id, '02', plan.cashiers[1], at(n, 961))
      }
      for (let i = 0; i < count; i++) sale(store.id, at(n, rng.int(605, 1305), rng.int(0, 59)))
      if (rng.chance(0.55)) returnOne(store.id, at(n, rng.int(1000, 1310), rng.int(0, 59)))
      closeShift(store.id, at(n, 1325))
      schedule(at(n, 1335), () => hub.closeDay(db, store.id, day(n), plan.manager, at(n, 1335)))
    }
  }

  // 今天：万象天地店01号收银台李雨桐当班，科技园店、松山湖店也已开班，千灯湖店还没开班
  if (hasToday) {
    const open = Math.min(595, nowMin - 45)
    for (const store of db.stores) {
      const plan = PLAN[store.id]
      if (!plan.todayEvery || open < 0) continue
      openShift(store.id, '01', plan.cashiers[0], todayAt(open))
      const count = Math.max(0, Math.min(12, Math.floor((nowMin - open - 10) / plan.todayEvery)))
      for (let i = 0; i < count; i++) {
        const min = open + 10 + Math.floor(((nowMin - open - 15) * (i + 0.5)) / Math.max(count, 1))
        sale(store.id, todayAt(min))
      }
    }
  }

  // ---- 自提：历史核销、被拒记录、今天待核销的演示码 ----
  const customers = [
    { name: '何静怡', phone: '13900139001' },
    { name: '马俊', phone: '13900139002' },
    { name: '罗嘉欣', phone: '13900139003' },
    { name: '梁浩然', phone: '13900139004' },
    { name: '宋雨晴', phone: '13900139005' },
    { name: '唐子轩', phone: '13900139006' },
    { name: '韩梦瑶', phone: '13900139007' },
    { name: '曹宇航', phone: '13900139008' },
  ]
  const verifiedPickup = (storeId: string, created: DateTimeText, verified: DateTimeText, sku: string, operator: string) => {
    const code = String(rng.int(100000, 999999))
    schedule(created, () => {
      hub.createPickupOrder(db, { storeId, items: [{ sku, qty: 1 }], customer: rng.pick(customers), pickupCode: code }, created)
    })
    schedule(verified, () => {
      hub.verifyPickup(db, { storeId, code, operatorJobNo: operator }, verified)
    })
  }
  const pickupSkus = ['SP0101020001', 'SP0201010002', 'SP0302010001', 'SP0101010002', 'SP0402010001']
  for (let n = -7; n <= -1; n++) {
    verifiedPickup('s01', at(n - 1, 1260), at(n, rng.int(660, 1200)), rng.pick(pickupSkus), rng.pick(PLAN.s01.guides))
    if (n % 2 === 0) verifiedPickup('s03', at(n - 1, 1200), at(n, rng.int(700, 1150)), rng.pick(pickupSkus), 'JMA101')
  }
  schedule(at(-4, 830), () =>
    hub.recordRejection(db, { storeId: 's01', code: '000000', reason: 'not_found', operatorJobNo: 'QS1003' }, at(-4, 830)),
  )

  const pending = (storeId: string, code: string, when: DateTimeText, items: [string, number][], customer: (typeof customers)[number]) =>
    schedule(when, () => {
      hub.createPickupOrder(db, { storeId, items: items.map(([sku, qty]) => ({ sku, qty })), customer, pickupCode: code }, when)
    })
  // 两单各锁1件套装，万象天地店的套装就一件也卖不出去了
  pending('s01', '820145', at(-1, 1180), [['SP0401010001', 1]], customers[0])
  pending('s01', '820146', hasToday ? todayAt(552) : at(-1, 1300), [['SP0401010001', 1]], customers[1])
  pending('s01', '731590', at(-1, 1260), [['SP0101020001', 1], ['SP0201010001', 1]], customers[2])
  pending('s01', '640218', at(-1, 700), [['SP0201030001', 1]], customers[3])
  schedule(at(-1, 1050), () => hub.verifyPickup(db, { storeId: 's01', code: '640218', operatorJobNo: 'QS1003' }, at(-1, 1050)))
  pending('s01', '559302', at(-6, 600), [['SP0402010002', 1]], customers[4])
  schedule(at(-3, 600), () => hub.expirePickup(db, db.pickups.find((p) => p.pickupCode === '559302')!.omsNo))
  pending('s03', '918274', at(-1, 900), [['SP0301010001', 1]], customers[5])
  pending('s01', '370615', at(-2, 960), [['SP0101010001', 1]], customers[6])
  schedule(at(-1, 960), () => hub.invalidateLock(db, db.pickups.find((p) => p.pickupCode === '370615')!.omsNo))
  pending('s02', '462803', at(-1, 1230), [['SP0101020002', 1]], customers[7])
  // 顾客把松山湖店的提货码拿到万象天地店，被拒
  schedule(at(-1, 980), () =>
    hub.recordRejection(
      db,
      {
        storeId: 's01',
        code: '918274',
        reason: 'store_mismatch',
        omsNo: db.pickups.find((p) => p.pickupCode === '918274')?.omsNo,
        operatorJobNo: 'QS1002',
      },
      at(-1, 980),
    ),
  )
  // 过期的提货码被拒后，导购转代客下单
  schedule(at(-3, 905), () =>
    hub.recordRejection(
      db,
      {
        storeId: 's01',
        code: '559302',
        reason: 'expired',
        omsNo: db.pickups.find((p) => p.pickupCode === '559302')?.omsNo,
        operatorJobNo: 'QS1002',
      },
      at(-3, 905),
    ),
  )

  // ---- 代客单 ----
  const agent = (spec: {
    storeId: string
    at: DateTimeText
    source: AgentOrder['source']
    sourceRef?: string
    guide: string
    creator: string
    items: [string, number][]
    customer: (typeof customers)[number]
    note?: string
    route?: [DateTimeText, string]
    ship?: DateTimeText
    sign?: DateTimeText
  }) => {
    let no = ''
    schedule(spec.at, () => {
      const items = spec.items.map(([sku, qty]) => {
        const p = product(sku)
        return { sku, name: p.name, spec: p.spec, qty, unitPrice: p.price }
      })
      const order: AgentOrder = {
        no: nextBillNo(db.counters, 'agent', spec.at),
        storeId: spec.storeId,
        guideJobNo: spec.guide,
        creatorJobNo: spec.creator,
        source: spec.source,
        sourceRef: spec.sourceRef,
        customer: { ...spec.customer, address: '广东省深圳市南山区（演示地址）' },
        items,
        referenceAmount: items.reduce((s, i) => s + i.unitPrice * i.qty, 0),
        note: spec.note,
        createdAt: spec.at,
        status: 'submitted',
        oms: {},
      }
      hub.submitAgentOrder(db, order, spec.at)
      no = order.no
    })
    if (spec.route) schedule(spec.route[0], () => hub.routeAgentOrder(db, no, spec.route![0], spec.route![1]))
    if (spec.ship) schedule(spec.ship, () => hub.shipAgentOrder(db, no, spec.ship))
    if (spec.sign) schedule(spec.sign, () => hub.signAgentOrder(db, no, spec.sign))
  }
  agent({
    storeId: 's01',
    at: at(-5, 680),
    source: 'cashier',
    guide: 'QS1003',
    creator: 'QS1003',
    items: [['SP0101020003', 1]],
    customer: customers[3],
    route: [at(-5, 700), '深圳主仓'],
    ship: at(-5, 960),
    sign: at(-3, 840),
  })
  agent({
    storeId: 's01',
    at: at(-3, 910),
    source: 'pickup_rejected',
    sourceRef: '559302',
    guide: 'QS1002',
    creator: 'QS1002',
    items: [['SP0402010002', 1]],
    customer: customers[6],
    route: [at(-3, 930), '嘉兴区域仓'],
    ship: at(-2, 600),
  })
  agent({
    storeId: 's01',
    at: at(-1, 1110),
    source: 'mobile',
    guide: 'QS1001',
    creator: 'QS1001',
    items: [['SP0301010002', 2]],
    customer: customers[1],
    route: [at(-1, 1125), '深圳主仓'],
  })
  if (hasToday) {
    agent({
      storeId: 's01',
      at: todayAt(640),
      source: 'cashier',
      guide: 'QS1003',
      creator: 'QS1002',
      items: [['SP0101020003', 1], ['SP0201010002', 1]],
      customer: customers[4],
    })
  }
  agent({
    storeId: 's03',
    at: at(-2, 820),
    source: 'cashier',
    guide: 'JMA101',
    creator: 'JMA101',
    items: [['SP0101020002', 1]],
    customer: customers[5],
    route: [at(-2, 840), '深圳主仓'],
    ship: at(-2, 1080),
    sign: at(-1, 900),
  })

  // ---- 要货、发运、收货 ----
  const replenish = (spec: {
    storeId: string
    at: DateTimeText
    creator: string
    lines: [string, number][]
    note: string
    review?: [DateTimeText, boolean, string]
    ship?: DateTimeText
    receive?: [DateTimeText, string, Record<string, number>]
  }) => {
    let no = ''
    schedule(spec.at, () => {
      no = nextBillNo(db.counters, 'replenish', spec.at)
      db.replenishments.push({
        no,
        storeId: spec.storeId,
        createdAt: spec.at,
        creatorJobNo: spec.creator,
        lines: spec.lines.map(([sku, qty]) => ({ sku, name: product(sku).name, spec: product(sku).spec, qty })),
        note: spec.note,
        status: 'reviewing',
        hub: {},
      })
    })
    if (spec.review) schedule(spec.review[0], () => hub.reviewReplenishment(db, no, spec.review![1], spec.review![2], spec.review![0]))
    if (spec.ship) schedule(spec.ship, () => void hub.shipReplenishment(db, no, spec.ship))
    if (spec.receive) {
      const [when, operator, received] = spec.receive
      schedule(when, () => {
        const outboundNo = db.replenishments.find((r) => r.no === no)!.hub.outboundNo!
        const shipment = db.shipments.find((s) => s.outboundNo === outboundNo)!
        const all = Object.fromEntries(shipment.lines.map((l) => [l.sku, received[l.sku] ?? l.qty]))
        hub.postReceipt(db, { outboundNo, received: all, operatorJobNo: operator }, when)
      })
    }
  }
  replenish({
    storeId: 's01',
    at: at(-6, 630),
    creator: 'QS1001',
    lines: [['SP0201010001', 20], ['SP0101020001', 10], ['SP0301010001', 6]],
    note: '周末备货',
    review: [at(-6, 900), true, '同意'],
    ship: at(-5, 540),
    receive: [at(-4, 660), 'QS1001', { SP0101020001: 9 }],
  })
  replenish({
    storeId: 's01',
    at: at(-4, 840),
    creator: 'QS1001',
    lines: [['SP0402010001', 6]],
    note: '无线充电座补货',
    review: [at(-4, 1000), false, '演示：区域仓本周可调量不足，下周再提'],
  })
  replenish({
    storeId: 's01',
    at: at(-2, 660),
    creator: 'QS1001',
    lines: [['SP0101020002', 4], ['SP0201030001', 10], ['SP0301010002', 6]],
    note: '磁吸10000只剩1件',
    review: [at(-2, 960), true, '同意'],
    ship: at(-1, 600),
  })
  replenish({
    storeId: 's01',
    at: at(-1, 1020),
    creator: 'QS1001',
    lines: [['SP0302010002', 8], ['SP0102010001', 4]],
    note: '',
    review: [at(-1, 1200), true, '同意，明天发'],
  })
  replenish({
    storeId: 's01',
    at: hasToday ? todayAt(570) : at(-1, 1290),
    creator: 'QS1001',
    lines: [['SP0401010001', 10], ['SP0101020003', 4]],
    note: '套装被自提锁满，140W已无货',
  })
  replenish({
    storeId: 's02',
    at: at(-5, 640),
    creator: 'QS2001',
    lines: [['SP0201010002', 10], ['SP0101010001', 8]],
    note: '',
    review: [at(-5, 900), true, '同意'],
    ship: at(-4, 560),
    receive: [at(-3, 700), 'QS2001', {}],
  })
  replenish({
    storeId: 's03',
    at: at(-3, 650),
    creator: 'JMA101',
    lines: [['SP0301010001', 6], ['SP0201020001', 8]],
    note: '加盟店要货：区域仓调拨到代销仓，不产生货款',
    review: [at(-3, 960), true, '同意'],
    ship: at(-2, 600),
  })

  // ---- 盘点 ----
  const stocktake = (spec: {
    storeId: string
    at: DateTimeText
    creator: string
    skus: string[]
    diffs: Record<string, number>
    submit?: DateTimeText
    post?: [DateTimeText, string]
    joint?: boolean
    note?: string
  }) => {
    let st: Stocktake | undefined
    schedule(spec.at, () => {
      st = {
        no: nextBillNo(db.counters, 'stocktake', spec.at),
        storeId: spec.storeId,
        scope: 'partial',
        createdAt: spec.at,
        creatorJobNo: spec.creator,
        status: 'counting',
        lines: spec.skus.map((sku) => ({
          sku,
          name: product(sku).name,
          spec: product(sku).spec,
          bookQty: hub.stockRecord(db, spec.storeId, sku).onHand,
          countedQty: null,
        })),
        joint: !!spec.joint,
        note: spec.note,
      }
      db.stocktakes.push(st)
    })
    if (spec.submit) {
      schedule(spec.submit, () => {
        st!.lines.forEach((l) => (l.countedQty = l.bookQty + (spec.diffs[l.sku] ?? 0)))
        st!.status = 'submitted'
        st!.submittedAt = spec.submit
      })
    }
    if (spec.post) schedule(spec.post[0], () => void hub.postStocktake(db, st!.no, { operatorJobNo: st!.creatorJobNo, authorizerJobNo: spec.post![1] }, spec.post![0]))
  }
  stocktake({
    storeId: 's01',
    at: at(-5, 1340),
    creator: 'QS1001',
    skus: ['SP0201010001', 'SP0201010002', 'SP0201020001', 'SP0201030001'],
    diffs: { SP0201020001: -1 },
    submit: at(-5, 1360),
    post: [at(-5, 1370), 'QS1001'],
    note: '数据线抽盘',
  })
  stocktake({
    storeId: 's01',
    at: at(-1, 1340),
    creator: 'QS1001',
    skus: ['SP0101010001', 'SP0101010002', 'SP0102010001', 'SP0402010002'],
    diffs: { SP0101010002: -1, SP0402010002: 1 },
    submit: at(-1, 1365),
    note: '充电器抽盘',
  })
  stocktake({
    storeId: 's03',
    at: at(-4, 1340),
    creator: 'JMA101',
    skus: ['SP0301010001', 'SP0301010002', 'SP0302010001', 'SP0302010002'],
    diffs: { SP0302010002: -1 },
    submit: at(-4, 1360),
    post: [at(-4, 1375), 'JMA101'],
    joint: true,
    note: '共同盘点：强盛和加盟商双方在场。盘亏只记事实，不出赔偿金额',
  })

  // ---- 退仓 ----
  const rtw = (spec: { storeId: string; at: DateTimeText; creator: string; reason: string; lines: [string, number][]; approve?: DateTimeText; ship?: DateTimeText }) => {
    let no = ''
    schedule(spec.at, () => {
      no = nextBillNo(db.counters, 'returnWh', spec.at)
      db.returnsToWarehouse.push({
        no,
        storeId: spec.storeId,
        createdAt: spec.at,
        creatorJobNo: spec.creator,
        reason: spec.reason,
        lines: spec.lines.map(([sku, qty]) => ({ sku, name: product(sku).name, spec: product(sku).spec, qty })),
        status: 'submitted',
        hub: {},
      })
    })
    if (spec.approve) schedule(spec.approve, () => hub.approveRtw(db, no, spec.approve))
    if (spec.ship) schedule(spec.ship, () => hub.shipRtw(db, no, spec.ship))
  }
  rtw({ storeId: 's01', at: at(-3, 600), creator: 'QS1001', reason: '残次', lines: [['SP0402010002', 2]], approve: at(-3, 900), ship: at(-2, 600) })
  rtw({ storeId: 's01', at: at(-1, 990), creator: 'QS1001', reason: '滞销', lines: [['SP0102010001', 3]] })
  rtw({ storeId: 's03', at: at(-2, 660), creator: 'JMA101', reason: '包装破损', lines: [['SP0201020001', 2]], approve: at(-1, 600) })

  // ---- 加盟缴款和结算单 ----
  const remit = (franchiseeId: string, registrant: string, when: DateTimeText, dayRange: [number, number], confirmAt?: DateTimeText) => {
    let no = ''
    schedule(when, () => {
      const dates = Array.from({ length: dayRange[1] - dayRange[0] + 1 }, (_, i) => day(dayRange[0] + i))
      const dueNos = db.dues.filter((d) => d.franchiseeId === franchiseeId && dates.includes(d.bizDate)).map((d) => d.no)
      no = hub.registerRemittance(
        db,
        { franchiseeId, dueNos, method: '银行转账', voucherNo: `DEMO-YH-${when.slice(0, 10).replaceAll('-', '')}-${franchiseeId.toUpperCase()}`, registrantJobNo: registrant },
        when,
      ).no
    })
    if (confirmAt) schedule(confirmAt, () => hub.confirmRemittance(db, no, confirmAt))
  }
  remit('fa', 'JMA002', at(-3, 600), [-7, -5], at(-2, 900))
  remit('fa', 'JMA002', at(-1, 600), [-4, -3])
  remit('fb', 'JMB001', at(-3, 620), [-7, -5], at(-2, 920))
  remit('fb', 'JMB001', at(-1, 640), [-4, -3])
  schedule(at(-1, 1410), () => {
    for (const f of db.franchisees) db.settlements.push(hub.buildSettlement(db, f.id, day(-7), day(-1), at(-1, 1410)))
  })

  const errors: string[] = []
  tasks
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.seq - b.seq))
    .forEach((t) => {
      try {
        t.run()
      } catch (e) {
        errors.push(`${t.at} ${(e as Error).message}`)
      }
    })
  return { db, errors }
}
