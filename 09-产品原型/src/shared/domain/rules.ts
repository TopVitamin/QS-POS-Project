import type {
  Cents,
  PickupOrder,
  ReceiptLine,
  SaleOrder,
  Shift,
  StockRecord,
  StocktakeLine,
  Store,
  VerifyRejectReason,
} from '../types'

/** 规则检查的结果都带依据，页面直接把依据显示给店员 */
export interface RuleResult {
  ok: boolean
  message?: string
  basis?: string
}

export const BASIS = {
  sellable: '《4.全局业务规则》§二：开单保存时，本次数量不得大于该店当前可用；中枢拒绝后不能改成本地已售',
  pickupLock: '《4.全局业务规则》§二：没有锁定成功的记录，不核销出库',
  pickupOnce: '《4.全局业务规则》§二：同一提货码已经核销的，再次扫描不得再次扣减',
  pickupStore: '《4.全局业务规则》§二：中枢锁的是自提门店那本库存，换一家店出库会扣错账',
  paymentPending: '《4.全局业务规则》§三：支付结果不明按通道查单，不能在POS里手工改成成功',
  price: '《4.全局业务规则》§五：被授权的改价记下操作者、原价、新价和原因',
  franchisePrice: '《4.全局业务规则》§五：加盟店默认使用强盛的零售价，能否在价格带内调整见【待确认-34】',
  shift: '《4.全局业务规则》§六：交班差异留下，不在交班时改写销售单',
  dailyClose: '《4.全局业务规则》§六：日结封账之后，这一营业日的成交不靠修改原单来轧差',
  receipt: '《4.全局业务规则》§四：数量不一致时另记差异，不把实收改成与出库相同来做平',
  stocktake: '《4.全局业务规则》§二：盘点差异在授权之前不改变可售数量，授权之后由中枢调整',
  returns: '《4.全局业务规则》§二：本店售出的退货回到本店微仓或代销仓',
  crossStore: '跨店退见【待确认-27】，原型不开放',
  agent: '《3.上下游链路》§五：代客单是申请，POS不指定仓库和承运商',
} as const

/** 可用 = 账面 − 锁定。在途不算可用 */
export function availableOf(r: Pick<StockRecord, 'onHand' | 'locked'> | undefined | null): number {
  if (!r) return 0
  return Math.max(0, r.onHand - r.locked)
}

export interface Demand {
  sku: string
  name: string
  qty: number
}

export interface Shortage extends Demand {
  available: number
}

/** 同一 SKU 多行先合并再比 */
export function mergeDemand(lines: Demand[]): Demand[] {
  const map = new Map<string, Demand>()
  for (const l of lines) {
    const cur = map.get(l.sku)
    if (cur) cur.qty += l.qty
    else map.set(l.sku, { ...l })
  }
  return [...map.values()]
}

export function checkSellable(lines: Demand[], stockOf: (sku: string) => StockRecord | undefined) {
  const shortages: Shortage[] = []
  for (const d of mergeDemand(lines)) {
    const available = availableOf(stockOf(d.sku))
    if (d.qty > available) shortages.push({ ...d, available })
  }
  return {
    ok: shortages.length === 0,
    shortages,
    message: shortages.length ? `${shortages.map((s) => `${s.name}可用${s.available}件`).join('，')}，不能超出可用量卖` : undefined,
    basis: BASIS.sellable,
  }
}

/** 核销核验的顺序：不存在 → 门店不一致 → 已核销 → 已过期 → 锁定无效 */
export function judgePickup(
  order: PickupOrder | undefined,
  storeId: string,
): { ok: true } | { ok: false; reason: VerifyRejectReason; basis: string } {
  if (!order) return { ok: false, reason: 'not_found', basis: BASIS.pickupLock }
  if (order.storeId !== storeId) return { ok: false, reason: 'store_mismatch', basis: BASIS.pickupStore }
  if (order.status === 'verified') return { ok: false, reason: 'already_verified', basis: BASIS.pickupOnce }
  if (order.status === 'expired') return { ok: false, reason: 'expired', basis: '提货截止规则见【待确认-04】，原型只认中枢给的过期状态' }
  if (order.lock.status !== 'locked') return { ok: false, reason: 'lock_invalid', basis: BASIS.pickupLock }
  return { ok: true }
}

export function canAdjustPrice(store: Pick<Store, 'mode'>): RuleResult {
  if (store.mode === 'franchise') {
    return { ok: false, message: '加盟店不开放改价', basis: BASIS.franchisePrice }
  }
  return { ok: true, basis: BASIS.price }
}

export interface HandoverCheck {
  ok: boolean
  diff: Cents | null
  needNote: boolean
  message?: string
  basis: string
}

/** 交班：有结果不明的支付先查单；实点和应有不等时必须写说明（不设阈值，见【待确认-10】） */
export function checkHandover(input: {
  pendingPayments: number
  expectedCash: Cents
  countedCash: Cents | null
  note: string
}): HandoverCheck {
  if (input.pendingPayments > 0) {
    return {
      ok: false,
      diff: null,
      needNote: false,
      message: `还有${input.pendingPayments}笔支付结果不明，先查单再交班`,
      basis: BASIS.paymentPending,
    }
  }
  if (input.countedCash === null) {
    return { ok: false, diff: null, needNote: false, message: '请录入实点现金', basis: BASIS.shift }
  }
  const diff = input.countedCash - input.expectedCash
  const needNote = diff !== 0
  if (needNote && !input.note.trim()) {
    return { ok: false, diff, needNote, message: '现金有差异，必须写差异说明', basis: BASIS.shift }
  }
  return { ok: true, diff, needNote, basis: BASIS.shift }
}

/** 日结前置条件：本营业日的班次都已交班，没有结果不明的支付（执行人和条件见【待确认-55】） */
export function checkDailyClose(input: { shifts: Shift[]; alreadyClosed: boolean; pendingCheckouts: number }) {
  const openShifts = input.shifts.filter((s) => s.status === 'open')
  if (input.alreadyClosed) {
    return { ok: false, openShifts, message: '这一营业日已经封账，重开要另行授权，原型未开放', basis: BASIS.dailyClose }
  }
  if (openShifts.length) {
    return { ok: false, openShifts, message: `还有${openShifts.length}个班次没有交班`, basis: '日结前置条件见【待确认-55】，原型要求班次都已交班' }
  }
  if (input.pendingCheckouts > 0) {
    return { ok: false, openShifts, message: `还有${input.pendingCheckouts}笔结算没有完成`, basis: BASIS.paymentPending }
  }
  return { ok: true, openShifts, basis: BASIS.dailyClose }
}

export function checkReturnable(sale: SaleOrder, storeId: string): RuleResult {
  if (sale.storeId !== storeId) return { ok: false, message: '不是本店的销售单', basis: BASIS.crossStore }
  if (sale.status === 'returned') return { ok: false, message: '这张单已经全部退完', basis: BASIS.returns }
  if (sale.hubSync.status !== 'accepted') return { ok: false, message: '中枢没有接受这张单', basis: BASIS.sellable }
  return { ok: true, basis: BASIS.returns }
}

export function receiptDiffs(lines: ReceiptLine[]) {
  return lines.map((l) => ({ ...l, diff: l.receivedQty - l.shippedQty })).filter((l) => l.diff !== 0)
}

export function stocktakeDiffs(lines: StocktakeLine[]) {
  return lines
    .filter((l) => l.countedQty !== null)
    .map((l) => ({ ...l, diff: (l.countedQty as number) - l.bookQty }))
    .filter((l) => l.diff !== 0)
}
