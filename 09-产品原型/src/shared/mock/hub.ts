import type {
  AgentOrder,
  AuditLog,
  BizDate,
  DailyClose,
  DateTimeText,
  FranchiseDue,
  FranchiseSettlement,
  GoodsReceipt,
  HubSync,
  InboundShipment,
  LedgerType,
  PickupOrder,
  Remittance,
  ReturnOrder,
  SaleOrder,
  SettlementLine,
  StockRecord,
  Stocktake,
  VerificationRecord,
  VerifyRejectReason,
} from '../types'
import { nextBillNo, nextHubNo } from '../domain/numbering'
import { BASIS, checkDailyClose, checkSellable, judgePickup, receiptDiffs, stocktakeDiffs, type Demand } from '../domain/rules'
import { dailySummary, dueByMethod } from '../domain/summary'
import { VERIFY_REJECT } from '../config/labels'
import { compactDate, nowText } from '../utils/time'
import { uid } from '../utils/random'
import type { DemoDb } from './schema'

/**
 * 中枢模拟：锁库、扣减、去重、路由、要货审核和发运、收货入账、盘点调账、应缴生成、缴款核对。
 * 页面不能直接调这里，只能经过 shared/api。
 */

export class HubRejection extends Error {
  constructor(
    message: string,
    public basis?: string,
    public detail?: unknown,
  ) {
    super(message)
    this.name = 'HubRejection'
  }
}

export function stockRecord(db: DemoDb, storeId: string, sku: string): StockRecord {
  let r = db.stock.find((s) => s.storeId === storeId && s.sku === sku)
  if (!r) {
    r = { storeId, sku, onHand: 0, locked: 0, inTransit: 0 }
    db.stock.push(r)
  }
  return r
}

function move(db: DemoDb, storeId: string, sku: string, type: LedgerType, change: number, refNo: string, at: DateTimeText) {
  const r = stockRecord(db, storeId, sku)
  r.onHand += change
  db.ledger.push({ id: uid('lg'), storeId, sku, type, change, balanceAfter: r.onHand, refNo, at })
}

export function audit(db: DemoDb, entry: Omit<AuditLog, 'id' | 'at'> & { at?: DateTimeText }) {
  db.auditLogs.push({ ...entry, id: uid('log'), at: entry.at ?? nowText() })
}

function resultNo(db: DemoDb, at: DateTimeText) {
  return nextHubNo(db.counters, 'result', at)
}

// ---------- 可用量 ----------

export function checkAvailability(db: DemoDb, storeId: string, demand: Demand[]) {
  return checkSellable(demand, (sku) => db.stock.find((s) => s.storeId === storeId && s.sku === sku))
}

// ---------- 成交和退货回传（按来源单号去重） ----------

export function postSale(db: DemoDb, sale: SaleOrder, at: DateTimeText = nowText()): HubSync {
  const key = `sale:${sale.no}`
  if (db.hubProcessed[key]) {
    sale.hubSync.duplicateHits += 1
    return sale.hubSync
  }
  const check = checkAvailability(
    db,
    sale.storeId,
    sale.lines.map((l) => ({ sku: l.sku, name: l.name, qty: l.qty })),
  )
  if (!check.ok) throw new HubRejection(`中枢拒绝：${check.message}`, check.basis, check.shortages)
  for (const l of sale.lines) move(db, sale.storeId, l.sku, 'sale', -l.qty, sale.no, at)
  const no = resultNo(db, at)
  db.hubProcessed[key] = no
  sale.hubSync = { status: 'accepted', resultNo: no, at, duplicateHits: 0 }
  return sale.hubSync
}

export function postReturn(db: DemoDb, ret: ReturnOrder, at: DateTimeText = nowText()): HubSync {
  const key = `return:${ret.no}`
  if (db.hubProcessed[key]) {
    ret.hubSync.duplicateHits += 1
    return ret.hubSync
  }
  for (const l of ret.lines) move(db, ret.storeId, l.sku, 'return', l.qty, ret.no, at)
  const no = resultNo(db, at)
  db.hubProcessed[key] = no
  ret.hubSync = { status: 'accepted', resultNo: no, at, duplicateHits: 0 }
  return ret.hubSync
}

/** 演示「重复回传」：同一来源单号再送一次，中枢只计数，不再扣减 */
export function resubmit(db: DemoDb, kind: 'sale' | 'return', no: string, operatorJobNo: string, at: DateTimeText = nowText()) {
  const doc = kind === 'sale' ? db.sales.find((s) => s.no === no) : db.returns.find((r) => r.no === no)
  if (!doc) throw new HubRejection('找不到这张单')
  const before = db.ledger.filter((l) => l.refNo === no).length
  if (kind === 'sale') postSale(db, doc as SaleOrder, at)
  else postReturn(db, doc as ReturnOrder, at)
  const after = db.ledger.filter((l) => l.refNo === no).length
  audit(db, {
    action: '重复回传',
    at,
    operatorJobNo,
    storeId: doc.storeId,
    objectType: kind === 'sale' ? 'POS销售单' : '退货单',
    objectNo: no,
    after: `中枢按来源单号去重，返回原结果单号${doc.hubSync.resultNo}，第${doc.hubSync.duplicateHits}次重复`,
  })
  return { resultNo: doc.hubSync.resultNo, duplicateHits: doc.hubSync.duplicateHits, ledgerAdded: after - before }
}

// ---------- 自提：先锁后码，核销一次 ----------

function newPickupCode(db: DemoDb): string {
  for (let i = 0; i < 50; i++) {
    const code = String(100000 + Math.floor(Math.random() * 900000))
    if (!db.pickups.some((p) => p.pickupCode === code)) return code
  }
  return String(Date.now()).slice(-6)
}

export function createPickupOrder(
  db: DemoDb,
  input: {
    storeId: string
    items: { sku: string; qty: number }[]
    customer: { name: string; phone: string }
    /** 种子数据用固定码，方便演示 */
    pickupCode?: string
  },
  at: DateTimeText = nowText(),
): PickupOrder {
  const store = db.stores.find((s) => s.id === input.storeId)
  if (!store) throw new HubRejection('门店不存在')
  if (store.pausedForRouting) throw new HubRejection(`${store.name}已临时停接自提和代发，中枢不会把订单路由过去`)
  const items = input.items
    .filter((i) => i.qty > 0)
    .map((i) => {
      const p = db.products.find((x) => x.sku === i.sku)!
      return { sku: p.sku, name: p.name, spec: p.spec, qty: i.qty }
    })
  if (!items.length) throw new HubRejection('请选择商品')
  const check = checkAvailability(db, store.id, items)
  if (!check.ok) throw new HubRejection(`锁定失败，不出提货码：${check.message}`, BASIS.pickupLock, check.shortages)
  for (const it of items) stockRecord(db, store.id, it.sku).locked += it.qty
  const order: PickupOrder = {
    omsNo: nextHubNo(db.counters, 'oms', at),
    channelOrderNo: `XCX${at.replace(/\D/g, '')}${String(db.pickups.length + 1).padStart(3, '0')}`,
    channel: 'miniapp',
    storeId: store.id,
    pickupCode: input.pickupCode ?? newPickupCode(db),
    lock: { status: 'locked', lockNo: nextHubNo(db.counters, 'lock', at), lockedAt: at },
    items,
    customer: input.customer,
    paidAmount: items.reduce((s, it) => s + db.products.find((p) => p.sku === it.sku)!.price * it.qty, 0),
    createdAt: at,
    status: 'pending',
  }
  db.pickups.push(order)
  return order
}

function releaseLock(db: DemoDb, order: PickupOrder) {
  if (order.lock.status !== 'locked') return
  for (const it of order.items) {
    const r = stockRecord(db, order.storeId, it.sku)
    r.locked = Math.max(0, r.locked - it.qty)
  }
  order.lock.status = 'released'
}

/** 中枢判过期：释放锁定 */
export function expirePickup(db: DemoDb, omsNo: string) {
  const order = db.pickups.find((p) => p.omsNo === omsNo)
  if (!order || order.status !== 'pending') throw new HubRejection('只有待核销的提货单能判过期')
  releaseLock(db, order)
  order.status = 'expired'
}

/** 演示「锁定无效」：中枢那边锁定已经失效，但履约单投影还在待核销 */
export function invalidateLock(db: DemoDb, omsNo: string) {
  const order = db.pickups.find((p) => p.omsNo === omsNo)
  if (!order || order.status !== 'pending') throw new HubRejection('只有待核销的提货单能演示锁定失效')
  releaseLock(db, order)
}

export function judgeCode(db: DemoDb, storeId: string, code: string) {
  const order = db.pickups.find((p) => p.pickupCode === code.trim())
  return { order, verdict: judgePickup(order, storeId) }
}

export function recordRejection(
  db: DemoDb,
  input: { storeId: string; code: string; reason: VerifyRejectReason; omsNo?: string; operatorJobNo: string },
  at: DateTimeText = nowText(),
): VerificationRecord {
  const rec: VerificationRecord = {
    id: uid('vr'),
    omsNo: input.omsNo,
    pickupCode: input.code,
    storeId: input.storeId,
    result: 'rejected',
    reason: input.reason,
    operatorJobNo: input.operatorJobNo,
    at,
  }
  db.verifications.push(rec)
  audit(db, {
    action: '核销拒绝',
    at,
    operatorJobNo: input.operatorJobNo,
    storeId: input.storeId,
    objectType: '提货码',
    objectNo: input.code,
    reason: VERIFY_REJECT[input.reason].label,
  })
  return rec
}

export function verifyPickup(
  db: DemoDb,
  input: { storeId: string; code: string; operatorJobNo: string },
  at: DateTimeText = nowText(),
): VerificationRecord {
  const { order, verdict } = judgeCode(db, input.storeId, input.code)
  if (!verdict.ok || !order) {
    const reason = verdict.ok ? 'not_found' : verdict.reason
    recordRejection(db, { ...input, reason, omsNo: order?.omsNo }, at)
    throw new HubRejection(VERIFY_REJECT[reason].label, verdict.ok ? undefined : verdict.basis)
  }
  const no = nextBillNo(db.counters, 'verification', at)
  for (const it of order.items) {
    const r = stockRecord(db, order.storeId, it.sku)
    r.locked = Math.max(0, r.locked - it.qty)
    move(db, order.storeId, it.sku, 'pickup', -it.qty, no, at)
  }
  order.lock.status = 'released'
  order.status = 'verified'
  order.verifiedAt = at
  order.verificationNo = no
  order.verifierJobNo = input.operatorJobNo
  order.hubResultNo = resultNo(db, at)
  const rec: VerificationRecord = {
    id: uid('vr'),
    no,
    omsNo: order.omsNo,
    pickupCode: order.pickupCode,
    storeId: order.storeId,
    result: 'success',
    operatorJobNo: input.operatorJobNo,
    at,
  }
  db.verifications.push(rec)
  audit(db, {
    action: '核销成功',
    at,
    operatorJobNo: input.operatorJobNo,
    storeId: order.storeId,
    objectType: '自提履约单',
    objectNo: order.omsNo,
    before: '待核销',
    after: `已核销，核销单${no}`,
  })
  return rec
}

// ---------- 代客单：OMS 路由，POS 不选仓不选承运商 ----------

export function submitAgentOrder(db: DemoDb, order: AgentOrder, at: DateTimeText = nowText()) {
  order.status = 'submitted'
  order.oms = { omsNo: nextHubNo(db.counters, 'oms', at) }
  db.agentOrders.push(order)
  audit(db, {
    action: '代客下单',
    at,
    operatorJobNo: order.creatorJobNo,
    storeId: order.storeId,
    objectType: '代客单',
    objectNo: order.no,
    after: `提交OMS，导购${order.guideJobNo}`,
  })
}

function agentOrder(db: DemoDb, no: string) {
  const o = db.agentOrders.find((x) => x.no === no)
  if (!o) throw new HubRejection('找不到代客单')
  return o
}

export function routeAgentOrder(db: DemoDb, no: string, at: DateTimeText = nowText(), nodeName = '深圳主仓') {
  const o = agentOrder(db, no)
  if (o.status !== 'submitted') throw new HubRejection('只有已提交的代客单能路由')
  o.status = 'routed'
  o.oms.nodeName = nodeName
  o.oms.routedAt = at
}

export function shipAgentOrder(db: DemoDb, no: string, at: DateTimeText = nowText()) {
  const o = agentOrder(db, no)
  if (o.status !== 'routed') throw new HubRejection('只有已路由的代客单能发货')
  const key = `SF#${compactDate(at)}`
  const seq = (db.counters[key] ?? 0) + 1
  db.counters[key] = seq
  o.status = 'shipped'
  o.oms.carrier = '顺丰'
  o.oms.trackingNo = `SF${compactDate(at)}${String(seq).padStart(5, '0')}`
  o.oms.shippedAt = at
}

export function signAgentOrder(db: DemoDb, no: string, at: DateTimeText = nowText()) {
  const o = agentOrder(db, no)
  if (o.status !== 'shipped') throw new HubRejection('只有已发货的代客单能签收')
  o.status = 'signed'
  o.oms.signedAt = at
}

// ---------- 要货、发运、收货 ----------

export function reviewReplenishment(db: DemoDb, no: string, approve: boolean, note: string, at: DateTimeText = nowText()) {
  const r = db.replenishments.find((x) => x.no === no)
  if (!r || r.status !== 'reviewing') throw new HubRejection('只有审核中的要货单能审核')
  r.status = approve ? 'approved' : 'rejected'
  r.hub.reviewedAt = at
  r.hub.reviewNote = note
  if (approve) r.hub.sourceNodeName = '深圳主仓'
}

export function shipReplenishment(db: DemoDb, no: string, at: DateTimeText = nowText()): InboundShipment {
  const r = db.replenishments.find((x) => x.no === no)
  if (!r || r.status !== 'approved') throw new HubRejection('只有已审核的要货单能发运')
  const outboundNo = nextHubNo(db.counters, 'outbound', at)
  const shipment: InboundShipment = {
    outboundNo,
    storeId: r.storeId,
    sourceNodeName: r.hub.sourceNodeName ?? '深圳主仓',
    replenishmentNo: r.no,
    lines: r.lines.map((l) => ({ ...l })),
    shippedAt: at,
    status: 'in_transit',
  }
  for (const l of shipment.lines) stockRecord(db, r.storeId, l.sku).inTransit += l.qty
  db.shipments.push(shipment)
  r.status = 'shipped'
  r.hub.outboundNo = outboundNo
  r.hub.shippedAt = at
  return shipment
}

export function postReceipt(
  db: DemoDb,
  input: { outboundNo: string; received: Record<string, number>; operatorJobNo: string },
  at: DateTimeText = nowText(),
): GoodsReceipt {
  const shipment = db.shipments.find((s) => s.outboundNo === input.outboundNo)
  if (!shipment) throw new HubRejection('找不到来源出库单，收货必须指回出库单', BASIS.receipt)
  if (shipment.status === 'received') throw new HubRejection('这张出库单已经收过货')
  const no = nextBillNo(db.counters, 'receipt', at)
  const lines = shipment.lines.map((l) => ({
    sku: l.sku,
    name: l.name,
    spec: l.spec,
    shippedQty: l.qty,
    receivedQty: Math.max(0, Math.floor(input.received[l.sku] ?? 0)),
  }))
  for (const l of lines) {
    const r = stockRecord(db, shipment.storeId, l.sku)
    r.inTransit = Math.max(0, r.inTransit - l.shippedQty)
    if (l.receivedQty > 0) move(db, shipment.storeId, l.sku, 'receipt', l.receivedQty, no, at)
  }
  const receipt: GoodsReceipt = {
    no,
    storeId: shipment.storeId,
    outboundNo: shipment.outboundNo,
    receivedAt: at,
    operatorJobNo: input.operatorJobNo,
    lines,
    hubResultNo: resultNo(db, at),
  }
  const diffs = receiptDiffs(lines)
  if (diffs.length) {
    const dno = nextBillNo(db.counters, 'discrepancy', at)
    db.discrepancies.push({
      no: dno,
      storeId: shipment.storeId,
      receiptNo: no,
      outboundNo: shipment.outboundNo,
      lines: diffs,
      createdAt: at,
      operatorJobNo: input.operatorJobNo,
      status: 'submitted',
    })
    receipt.discrepancyNo = dno
    audit(db, {
      action: '收货差异',
      at,
      operatorJobNo: input.operatorJobNo,
      storeId: shipment.storeId,
      objectType: '差异单',
      objectNo: dno,
      before: diffs.map((d) => `${d.name} 出库${d.shippedQty}`).join('；'),
      after: diffs.map((d) => `实收${d.receivedQty}（${d.diff > 0 ? '+' : ''}${d.diff}）`).join('；'),
    })
  }
  db.receipts.push(receipt)
  shipment.status = 'received'
  shipment.receiptNo = no
  const rep = db.replenishments.find((r) => r.no === shipment.replenishmentNo)
  if (rep) rep.status = 'received'
  return receipt
}

// ---------- 盘点：授权后中枢调账 ----------

export function postStocktake(
  db: DemoDb,
  no: string,
  { operatorJobNo, authorizerJobNo }: { operatorJobNo: string; authorizerJobNo: string },
  at: DateTimeText = nowText(),
): Stocktake {
  const st = db.stocktakes.find((s) => s.no === no)
  if (!st || st.status !== 'submitted') throw new HubRejection('只有已提交的盘点单能过账')
  const diffs = stocktakeDiffs(st.lines)
  for (const d of diffs) move(db, st.storeId, d.sku, 'stocktake', d.diff, st.no, at)
  st.status = 'adjusted'
  st.authorizerJobNo = authorizerJobNo
  st.authorizedAt = at
  st.hubResultNo = resultNo(db, at)
  audit(db, {
    action: '盘点审核',
    at,
    operatorJobNo,
    authorizerJobNo,
    storeId: st.storeId,
    objectType: '盘点单',
    objectNo: st.no,
    before: diffs.map((d) => `${d.name} 账面${d.bookQty}`).join('；') || '无差异',
    after: diffs.map((d) => `实盘${d.countedQty}（${d.diff > 0 ? '+' : ''}${d.diff}）`).join('；') || '无差异',
  })
  return st
}

// ---------- 退仓 ----------

export function approveRtw(db: DemoDb, no: string, at: DateTimeText = nowText()) {
  const r = db.returnsToWarehouse.find((x) => x.no === no)
  if (!r || r.status !== 'submitted') throw new HubRejection('只有已提交的退仓单能同意')
  r.status = 'approved'
  r.hub.approvedAt = at
  r.hub.targetNodeName = '深圳主仓'
}

export function shipRtw(db: DemoDb, no: string, at: DateTimeText = nowText()) {
  const r = db.returnsToWarehouse.find((x) => x.no === no)
  if (!r || r.status !== 'approved') throw new HubRejection('只有中枢已同意的退仓单能交运')
  const check = checkAvailability(db, r.storeId, r.lines)
  if (!check.ok) throw new HubRejection(`本店可用不够退仓：${check.message}`, check.basis)
  for (const l of r.lines) move(db, r.storeId, l.sku, 'return_wh', -l.qty, r.no, at)
  r.status = 'shipped'
  r.hub.shippedAt = at
}

// ---------- 日结和加盟应缴 ----------

export function closeDay(db: DemoDb, storeId: string, bizDate: BizDate, closerJobNo: string, at: DateTimeText = nowText()): DailyClose {
  const store = db.stores.find((s) => s.id === storeId)
  if (!store) throw new HubRejection('门店不存在')
  const shifts = db.shifts.filter((s) => s.storeId === storeId && s.bizDate === bizDate)
  const check = checkDailyClose({
    shifts,
    alreadyClosed: db.dailyCloses.some((d) => d.storeId === storeId && d.bizDate === bizDate),
    pendingCheckouts: db.checkouts.filter((c) => c.storeId === storeId && c.status === 'open' && c.createdAt.startsWith(bizDate)).length,
  })
  if (!check.ok) throw new HubRejection(check.message!, check.basis, check.openShifts)
  const sales = db.sales.filter((s) => s.storeId === storeId && s.bizDate === bizDate)
  const returns = db.returns.filter((r) => r.storeId === storeId && r.bizDate === bizDate)
  const pickups = db.verifications.filter((v) => v.storeId === storeId && v.result === 'success' && v.at.startsWith(bizDate)).length
  const agents = db.agentOrders.filter((o) => o.storeId === storeId && o.createdAt.startsWith(bizDate)).length
  const close: DailyClose = {
    no: nextBillNo(db.counters, 'dailyClose', at),
    storeId,
    bizDate,
    closedAt: at,
    closerJobNo,
    shiftNos: shifts.map((s) => s.no),
    summary: dailySummary(sales, returns, pickups, agents),
  }
  sales.forEach((s) => (s.dailyCloseNo = close.no))
  returns.forEach((r) => (r.dailyCloseNo = close.no))
  db.dailyCloses.push(close)
  audit(db, {
    action: '日结封账',
    at,
    operatorJobNo: closerJobNo,
    storeId,
    objectType: '日结单',
    objectNo: close.no,
    after: `营业日${bizDate}封账，成交净额${(close.summary.net / 100).toFixed(2)}元`,
  })
  if (store.mode === 'franchise' && store.franchiseeId) generateDue(db, close, store.franchiseeId, at)
  return close
}

/** 加盟店日结后，中枢按营业日生成应缴营业款 */
export function generateDue(db: DemoDb, close: DailyClose, franchiseeId: string, at: DateTimeText): FranchiseDue {
  const { byMethod, total } = dueByMethod(close.summary.byMethod)
  const due: FranchiseDue = {
    no: nextBillNo(db.counters, 'due', at),
    storeId: close.storeId,
    franchiseeId,
    bizDate: close.bizDate,
    dailyCloseNo: close.no,
    byMethod,
    total,
    generatedAt: at,
    status: 'unpaid',
  }
  db.dues.push(due)
  close.franchiseDueNo = due.no
  return due
}

export function registerRemittance(
  db: DemoDb,
  input: { franchiseeId: string; dueNos: string[]; method: string; voucherNo: string; registrantJobNo: string; note?: string },
  at: DateTimeText = nowText(),
): Remittance {
  const dues = db.dues.filter((d) => input.dueNos.includes(d.no))
  if (!dues.length) throw new HubRejection('请选择要登记的应缴')
  if (dues.some((d) => d.franchiseeId !== input.franchiseeId)) throw new HubRejection('只能登记本加盟商的应缴')
  if (dues.some((d) => d.status !== 'unpaid')) throw new HubRejection('选中的应缴里有已经登记过的')
  if (!input.voucherNo.trim()) throw new HubRejection('请填写凭证号')
  const rem: Remittance = {
    no: uid('remit'),
    franchiseeId: input.franchiseeId,
    dueNos: dues.map((d) => d.no),
    amount: dues.reduce((s, d) => s + d.total, 0),
    method: input.method,
    voucherNo: input.voucherNo.trim(),
    registeredAt: at,
    registrantJobNo: input.registrantJobNo,
    status: 'pending',
    note: input.note,
  }
  dues.forEach((d) => {
    d.status = 'registered'
    d.remittanceNo = rem.no
  })
  db.remittances.push(rem)
  audit(db, {
    action: '加盟缴款登记',
    at,
    operatorJobNo: input.registrantJobNo,
    storeId: dues[0].storeId,
    objectType: '缴款登记',
    objectNo: rem.voucherNo,
    after: `登记${dues.length}笔应缴，合计${(rem.amount / 100).toFixed(2)}元`,
  })
  return rem
}

export function confirmRemittance(db: DemoDb, no: string, at: DateTimeText = nowText()) {
  const rem = db.remittances.find((r) => r.no === no)
  if (!rem || rem.status !== 'pending') throw new HubRejection('只有待核对的缴款能核对')
  rem.status = 'confirmed'
  rem.confirmedAt = at
  db.dues.filter((d) => rem.dueNos.includes(d.no)).forEach((d) => (d.status = 'confirmed'))
}

/** 加盟结算单：只汇总已封账的应缴和已核对的缴款，规则未定的项不出金额 */
export function buildSettlementLines(db: DemoDb, franchiseeId: string, start: BizDate, end: BizDate): SettlementLine[] {
  const dues = db.dues.filter((d) => d.franchiseeId === franchiseeId && d.bizDate >= start && d.bizDate <= end)
  const total = dues.reduce((s, d) => s + d.total, 0)
  const confirmed = dues.filter((d) => d.status === 'confirmed').reduce((s, d) => s + d.total, 0)
  const storeIds = db.franchisees.find((f) => f.id === franchiseeId)?.storeIds ?? []
  const inPeriod = (t: string) => t.slice(0, 10) >= start && t.slice(0, 10) <= end
  const pickups = db.verifications.filter((v) => storeIds.includes(v.storeId) && v.result === 'success' && inPeriod(v.at)).length
  const agents = db.agentOrders.filter((o) => storeIds.includes(o.storeId) && inPeriod(o.createdAt)).length
  return [
    { key: 'dues', label: '应缴营业款合计', amount: total, note: `${dues.length}个营业日，中枢按日结生成，按支付方式分开` },
    { key: 'confirmed', label: '已缴款并经中枢核对', amount: confirmed, note: '取缴款登记里中枢已核对的部分' },
    { key: 'outstanding', label: '未缴或待核对', amount: total - confirmed, note: '上缴时限和逾期处理见【待确认-17】', pending: ['待确认-17'] },
    { key: 'share', label: '分成', amount: null, note: '分成口径和比例未定，不出金额', pending: ['待确认-18'] },
    {
      key: 'commission',
      label: '履约佣金',
      amount: null,
      // 履约佣金只算自提核销和门店代发（《11.术语表》）；发起代客单记业绩，跨店时怎么分在【待确认-20】里
      note: `本期核销自提${pickups}单；门店代发原型未做；另发起代客单${agents}单，记业绩，是否分佣未定。佣金规则未定，不出金额`,
      pending: ['待确认-20'],
    },
    { key: 'loss', label: '盘亏赔偿', amount: null, note: '损耗率、计价和判责未定，不自动生成赔偿金额', pending: ['待确认-23'] },
    { key: 'deposit', label: '保证金', amount: null, note: '保证金规则未定', pending: ['待确认-33'] },
    { key: 'other', label: '其他扣项', amount: null, note: '结算周期、确认时限和其他扣项未定', pending: ['待确认-19'] },
  ]
}

export function buildSettlement(db: DemoDb, franchiseeId: string, start: BizDate, end: BizDate, at: DateTimeText): FranchiseSettlement {
  return {
    no: nextBillNo(db.counters, 'settlement', at),
    franchiseeId,
    periodStart: start,
    periodEnd: end,
    generatedAt: at,
    lines: buildSettlementLines(db, franchiseeId, start, end),
    status: 'issued',
    disputes: [],
  }
}

export function disputeSettlement(db: DemoDb, no: string, byJobNo: string, note: string, at: DateTimeText = nowText()) {
  const s = db.settlements.find((x) => x.no === no)
  if (!s) throw new HubRejection('找不到结算单')
  if (!note.trim()) throw new HubRejection('请写明异议内容')
  s.status = 'disputed'
  s.disputes.push({ at, byJobNo, note: note.trim() })
  audit(db, {
    action: '结算异议',
    at,
    operatorJobNo: byJobNo,
    objectType: '加盟结算单',
    objectNo: no,
    after: note.trim(),
  })
}