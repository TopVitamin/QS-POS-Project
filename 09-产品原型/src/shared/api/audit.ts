import type { AuditAction, AuditLog, PickupOrder, ReturnOrder, SaleOrder } from '../types'
import {
  AGENT_STATUS,
  DUE_STATUS,
  HUB_SYNC,
  LEDGER_TYPE,
  PAY_METHOD,
  PAYMENT_STATUS,
  PICKUP_STATUS,
  SALE_STATUS,
  SHIFT_STATUS,
  VERIFY_REJECT,
  type LabelDef,
} from '../config/labels'
import type { DemoDb } from '../mock/schema'
import { codeName, formatMoney, maskCode, maskName, maskPhone, orEmpty } from '../utils/format'
import { byTimeDesc, fail, query } from './core'

// ---------- 操作日志 ----------

export interface LogFilter {
  storeIds?: string[]
  /** 不挂门店的日志（加盟结算异议）按加盟商过滤 */
  franchiseeIds?: string[]
  action?: AuditAction
  from?: string
  to?: string
  keyword?: string
}

function logInScope(db: DemoDb, log: AuditLog, f: LogFilter) {
  if (log.storeId) {
    if (!f.storeIds || f.storeIds.includes(log.storeId)) return true
    // 缴款按加盟商授权：财务的到店范围里没有加盟店，也要看得到被授权加盟商的缴款登记
    if (log.action !== '加盟缴款登记' || !f.franchiseeIds) return false
    const franchiseeId = db.stores.find((s) => s.id === log.storeId)?.franchiseeId
    return !!franchiseeId && f.franchiseeIds.includes(franchiseeId)
  }
  if (log.objectType === '加盟结算单') {
    const s = db.settlements.find((x) => x.no === log.objectNo)
    return !f.franchiseeIds || (!!s && f.franchiseeIds.includes(s.franchiseeId))
  }
  return !f.storeIds
}

export function logs(f: LogFilter = {}) {
  return query((db) => {
    const k = f.keyword?.trim()
    return db.auditLogs
      .filter(
        (l) =>
          logInScope(db, l, f) &&
          (!f.action || l.action === f.action) &&
          (!f.from || l.at.slice(0, 10) >= f.from) &&
          (!f.to || l.at.slice(0, 10) <= f.to) &&
          (!k || l.objectNo.includes(k) || l.operatorJobNo.includes(k) || (l.reason ?? '').includes(k) || (l.after ?? '').includes(k)),
      )
      .sort(byTimeDesc((l) => l.at))
  })
}

// ---------- 交易追溯：从一张单往下串到中枢结果，凭证在金蝶 ----------

export type TraceTone = 'brand' | 'ok' | 'warn' | 'bad' | 'muted'

export interface TraceField {
  label: string
  value: string
  mono?: boolean
}

export interface TraceNode {
  key: string
  /** 这一环在哪个系统 */
  layer: 'POS' | '支付通道' | '中枢' | 'OMS' | 'WMS' | '金蝶'
  title: string
  no?: string
  status?: LabelDef
  at?: string
  fields: TraceField[]
  tone: TraceTone
  /** 不在 POS 里，只灰显说明 */
  external?: boolean
  note?: string
}

export interface TraceResult {
  kind: 'sale' | 'return' | 'pickup' | 'agent'
  keyNo: string
  storeId: string
  headline: string
  nodes: TraceNode[]
  related: { label: string; no: string }[]
  logs: AuditLog[]
}

const who = (db: DemoDb, jobNo?: string) => {
  if (!jobNo) return '-'
  const e = db.employees.find((x) => x.jobNo === jobNo)
  return e ? `${e.jobNo} ${e.name}` : jobNo
}

const storeText = (db: DemoDb, storeId: string) => {
  const s = db.stores.find((x) => x.id === storeId)
  return s ? `${codeName(s.code, s.name)}（${s.mode === 'direct' ? '直营' : '加盟'}）` : storeId
}

function shiftNode(db: DemoDb, shiftNo: string): TraceNode {
  const shift = db.shifts.find((s) => s.no === shiftNo)
  if (!shift) return { key: 'shift', layer: 'POS', title: '班次', no: shiftNo, fields: [], tone: 'muted', note: '找不到班次' }
  return {
    key: 'shift',
    layer: 'POS',
    title: '班次',
    no: shift.no,
    status: SHIFT_STATUS[shift.status],
    at: shift.openedAt,
    tone: shift.status === 'closed' ? 'ok' : 'warn',
    fields: [
      { label: '收银台', value: `${shift.registerNo}号` },
      { label: '收银员', value: who(db, shift.cashierJobNo) },
      { label: '开班', value: shift.openedAt },
      { label: '交班', value: orEmpty(shift.closedAt) },
      { label: '现金差异', value: shift.status === 'closed' ? formatMoney(shift.cashDiff ?? 0, { sign: true }) : '-' },
    ],
  }
}

function closeNodes(db: DemoDb, storeId: string, bizDate: string, dailyCloseNo?: string): TraceNode[] {
  const close = db.dailyCloses.find((d) => d.no === dailyCloseNo) ?? db.dailyCloses.find((d) => d.storeId === storeId && d.bizDate === bizDate)
  const nodes: TraceNode[] = [
    close
      ? {
          key: 'daily',
          layer: 'POS',
          title: '日结',
          no: close.no,
          status: { label: '已封账', tone: 'success' },
          at: close.closedAt,
          tone: 'ok',
          fields: [
            { label: '营业日', value: close.bizDate },
            { label: '封账人', value: who(db, close.closerJobNo) },
            { label: '当日成交净额', value: formatMoney(close.summary.net) },
          ],
        }
      : {
          key: 'daily',
          layer: 'POS',
          title: '日结',
          status: { label: '未封账', tone: 'warning' },
          tone: 'warn',
          fields: [{ label: '营业日', value: bizDate }],
          note: '这一营业日还没有封账',
        },
  ]
  const due = close?.franchiseDueNo ? db.dues.find((d) => d.no === close.franchiseDueNo) : undefined
  if (due) {
    const rem = due.remittanceNo ? db.remittances.find((r) => r.no === due.remittanceNo) : undefined
    nodes.push({
      key: 'due',
      layer: '中枢',
      title: '加盟应缴营业款',
      no: due.no,
      status: DUE_STATUS[due.status],
      at: due.generatedAt,
      tone: due.status === 'confirmed' ? 'ok' : 'warn',
      fields: [
        { label: '营业日', value: due.bizDate },
        { label: '应缴合计', value: formatMoney(due.total) },
        { label: '缴款凭证号', value: orEmpty(rem?.voucherNo), mono: true },
      ],
      note: '中枢按营业日生成，按支付方式分开；POS只读',
    })
  }
  nodes.push({
    key: 'voucher',
    layer: '金蝶',
    title: '财务凭证',
    tone: 'muted',
    external: true,
    fields: [],
    note: '凭证在金蝶，POS不生成凭证，日结也不是凭证',
  })
  return nodes
}

function paymentNode(payments: SaleOrder['payments'], title: string, key: string): TraceNode {
  return {
    key,
    layer: '支付通道',
    title,
    tone: payments.every((p) => p.status === 'success') ? 'ok' : 'warn',
    fields: payments.length
      ? payments.map((p) => ({
          label: `${PAY_METHOD[p.method].label} · ${PAYMENT_STATUS[p.status].label}`,
          value: `${formatMoney(p.amount)}　${p.channelTxnNo ?? '现金无通道流水号'}${p.queriedAt ? '　查单确认' : ''}${p.refunded ? `　已退${formatMoney(p.refunded)}` : ''}`,
          mono: true,
        }))
      : [{ label: '流水', value: '-' }],
    note: '通道流水号原样保存，以通道结果为准',
  }
}

function hubNode(db: DemoDb, doc: SaleOrder | ReturnOrder): TraceNode {
  const ledger = db.ledger.filter((l) => l.refNo === doc.no)
  return {
    key: 'hub',
    layer: '中枢',
    title: '中枢回传结果',
    no: doc.hubSync.resultNo,
    status: HUB_SYNC[doc.hubSync.status],
    at: doc.hubSync.at,
    tone: doc.hubSync.status === 'accepted' ? 'ok' : 'bad',
    fields: [
      { label: '重复回传', value: doc.hubSync.duplicateHits ? `被去重${doc.hubSync.duplicateHits}次，未再扣减` : '无' },
      ...ledger.map((l) => {
        const p = db.products.find((x) => x.sku === l.sku)
        return { label: `${LEDGER_TYPE[l.type]} ${l.sku}`, value: `${p?.name ?? ''} ${l.change > 0 ? '+' : ''}${l.change}，结存${l.balanceAfter}` }
      }),
    ],
    note: '中枢按来源单号去重，库存以中枢接受的结果为准',
  }
}

function traceSale(db: DemoDb, sale: SaleOrder): TraceResult {
  const returns = db.returns.filter((r) => r.originalSaleNo === sale.no)
  const member = sale.memberId ? db.members.find((m) => m.id === sale.memberId) : undefined
  const nodes: TraceNode[] = [
    {
      key: 'sale',
      layer: 'POS',
      title: 'POS销售单',
      no: sale.no,
      status: SALE_STATUS[sale.status],
      at: sale.createdAt,
      tone: 'brand',
      fields: [
        { label: '门店', value: storeText(db, sale.storeId) },
        { label: '收银台', value: `${sale.registerNo}号` },
        { label: '收银员', value: who(db, sale.cashierJobNo) },
        { label: '导购', value: [...new Set(sale.lines.map((l) => l.guideJobNo))].map((j) => who(db, j)).join('、') },
        { label: '商品', value: sale.lines.map((l) => `${l.name}×${l.qty}`).join('、') },
        { label: '原价合计', value: formatMoney(sale.totals.list) },
        { label: '优惠合计', value: formatMoney(sale.totals.list - sale.totals.payable) },
        { label: '实收', value: formatMoney(sale.totals.payable) },
        { label: '会员', value: member ? `${maskName(member.name)} ${maskPhone(member.phone)}` : '-' },
        { label: '改价', value: sale.adjustments.length ? `${sale.adjustments.length}行，授权人${sale.adjustments.map((a) => who(db, a.authorizerJobNo)).join('、')}` : '无' },
      ],
    },
    paymentNode(sale.payments, '支付流水', 'payments'),
    hubNode(db, sale),
    shiftNode(db, sale.shiftNo),
    ...closeNodes(db, sale.storeId, sale.bizDate, sale.dailyCloseNo),
  ]
  return {
    kind: 'sale',
    keyNo: sale.no,
    storeId: sale.storeId,
    headline: `${storeText(db, sale.storeId)}　${sale.createdAt}　实收${formatMoney(sale.totals.payable)}`,
    nodes,
    related: returns.map((r) => ({ label: `退货单 ${formatMoney(r.total)}`, no: r.no })),
    logs: db.auditLogs.filter((l) => l.objectNo === sale.no || returns.some((r) => r.no === l.objectNo)),
  }
}

function traceReturn(db: DemoDb, ret: ReturnOrder): TraceResult {
  const sale = db.sales.find((s) => s.no === ret.originalSaleNo)
  const nodes: TraceNode[] = [
    {
      key: 'return',
      layer: 'POS',
      title: '退货单',
      no: ret.no,
      at: ret.createdAt,
      tone: 'brand',
      fields: [
        { label: '门店', value: storeText(db, ret.storeId) },
        { label: '原销售单', value: ret.originalSaleNo, mono: true },
        { label: '经办', value: who(db, ret.operatorJobNo) },
        { label: '原因', value: ret.reason },
        { label: '退货商品', value: ret.lines.map((l) => `${l.name}×${l.qty}`).join('、') },
        { label: '应退合计', value: formatMoney(ret.total) },
      ],
    },
    paymentNode(ret.refunds, '原路退款流水', 'refunds'),
    hubNode(db, ret),
    shiftNode(db, ret.shiftNo),
    ...closeNodes(db, ret.storeId, ret.bizDate, ret.dailyCloseNo),
  ]
  return {
    kind: 'return',
    keyNo: ret.no,
    storeId: ret.storeId,
    headline: `${storeText(db, ret.storeId)}　${ret.createdAt}　应退${formatMoney(ret.total)}`,
    nodes,
    related: sale ? [{ label: '原销售单', no: sale.no }] : [],
    logs: db.auditLogs.filter((l) => l.objectNo === ret.no),
  }
}

/** 追溯页在管理端：待核销的码还能用，只露前3位 */
const codeText = (order: PickupOrder) => (order.status === 'pending' ? maskCode(order.pickupCode) : order.pickupCode)

function tracePickup(db: DemoDb, order: PickupOrder): TraceResult {
  const store = db.stores.find((s) => s.id === order.storeId)
  const records = db.verifications.filter((v) => v.pickupCode === order.pickupCode || v.omsNo === order.omsNo)
  const ledger = order.verificationNo ? db.ledger.filter((l) => l.refNo === order.verificationNo) : []
  const nodes: TraceNode[] = [
    {
      key: 'oms',
      layer: 'OMS',
      title: '自提履约单（OMS下发）',
      no: order.omsNo,
      status: PICKUP_STATUS[order.status],
      at: order.createdAt,
      tone: 'brand',
      fields: [
        { label: '自提门店', value: storeText(db, order.storeId) },
        { label: '小程序订单号', value: order.channelOrderNo, mono: true },
        { label: '商品', value: order.items.map((i) => `${i.name}×${i.qty}`).join('、') },
        { label: '线上已付', value: formatMoney(order.paidAmount) },
        { label: '顾客', value: `${maskName(order.customer.name)} ${maskPhone(order.customer.phone)}` },
      ],
      note: '线上已付款，门店不再收钱，也不进门店成交净额',
    },
    {
      key: 'lock',
      layer: '中枢',
      title: '锁定',
      no: order.lock.lockNo,
      status: order.lock.status === 'locked' ? { label: '锁定有效', tone: 'info' } : { label: '已释放', tone: 'default' },
      at: order.lock.lockedAt,
      tone: order.lock.status === 'locked' ? 'warn' : 'muted',
      fields: [{ label: '锁的库存', value: store ? codeName(store.warehouse.code, store.warehouse.name) : '-' }],
      note: '先锁后出码；锁定成功才有提货码',
    },
    {
      key: 'verify',
      layer: 'POS',
      title: '核销记录',
      tone: records.some((r) => r.result === 'success') ? 'ok' : records.length ? 'bad' : 'muted',
      fields: records.length
        ? records.map((r) => ({
            label: `${r.at.slice(5, 16)} ${r.result === 'success' ? '核销成功' : '被拒'}`,
            value: r.result === 'success' ? `${r.no}　${who(db, r.operatorJobNo)}` : `${VERIFY_REJECT[r.reason!].label}　${who(db, r.operatorJobNo)}`,
          }))
        : [{ label: '记录', value: '还没有人扫过这张码' }],
      note: '成功和被拒都留记录；同一提货码只能核销一次',
    },
    {
      key: 'hub',
      layer: '中枢',
      title: '中枢扣减',
      no: order.hubResultNo,
      status: order.hubResultNo ? { label: '已扣减并释放锁定', tone: 'success' } : undefined,
      at: order.verifiedAt,
      tone: order.hubResultNo ? 'ok' : 'muted',
      fields: ledger.length
        ? ledger.map((l) => ({ label: `${LEDGER_TYPE[l.type]} ${l.sku}`, value: `${l.change}，结存${l.balanceAfter}` }))
        : [{ label: '扣减', value: '未核销，不扣减' }],
    },
  ]
  if (store?.mode === 'franchise') {
    nodes.push({
      key: 'commission',
      layer: '中枢',
      title: '履约佣金',
      tone: 'muted',
      fields: [],
      note: '加盟店核销计件，佣金规则见【待确认-20】，不出金额',
    })
  }
  nodes.push({
    key: 'voucher',
    layer: '金蝶',
    title: '财务凭证',
    tone: 'muted',
    external: true,
    fields: [],
    note: '核销是否另生零金额销售单见【待确认-14】，凭证在金蝶',
  })
  return {
    kind: 'pickup',
    keyNo: order.omsNo,
    storeId: order.storeId,
    headline: `提货码${codeText(order)}　${storeText(db, order.storeId)}　${PICKUP_STATUS[order.status].label}`,
    nodes,
    related: [],
    logs: db.auditLogs.filter((l) => l.objectNo === order.omsNo || l.objectNo === order.pickupCode),
  }
}

function traceAgent(db: DemoDb, no: string): TraceResult {
  const o = db.agentOrders.find((x) => x.no === no)!
  const source = o.source === 'pickup_rejected' ? db.pickups.find((p) => p.pickupCode === o.sourceRef) : undefined
  const sourceCode = source ? codeText(source) : maskCode(o.sourceRef)
  const nodes: TraceNode[] = [
    {
      key: 'agent',
      layer: 'POS',
      title: '代客单',
      no: o.no,
      status: AGENT_STATUS[o.status],
      at: o.createdAt,
      tone: 'brand',
      fields: [
        { label: '发起门店', value: storeText(db, o.storeId) },
        { label: '导购', value: who(db, o.guideJobNo) },
        { label: '来源', value: o.source === 'pickup_rejected' ? `核销被拒转代发（提货码${sourceCode}）` : o.source === 'mobile' ? '移动端' : '收银端' },
        { label: '商品', value: o.items.map((i) => `${i.name}×${i.qty}`).join('、') },
        { label: '参考金额', value: formatMoney(o.referenceAmount) },
      ],
      note: '代客单是申请，不是发货指令；POS不收款（【待确认-06】）',
    },
    {
      key: 'route',
      layer: 'OMS',
      title: 'OMS路由',
      no: o.oms.omsNo,
      at: o.oms.routedAt,
      tone: o.oms.nodeName ? 'ok' : 'warn',
      fields: [{ label: '履约节点', value: orEmpty(o.oms.nodeName) }],
      note: 'POS不选仓、不选承运商，只展示OMS给的结果',
    },
    {
      key: 'ship',
      layer: 'WMS',
      title: '拣发和配送',
      at: o.oms.shippedAt,
      tone: o.status === 'signed' ? 'ok' : o.oms.shippedAt ? 'warn' : 'muted',
      fields: [
        { label: '承运商', value: orEmpty(o.oms.carrier) },
        { label: '运单号', value: orEmpty(o.oms.trackingNo), mono: true },
        { label: '签收', value: orEmpty(o.oms.signedAt) },
      ],
      note: '扣减发生在被路由选中的节点，不扣本店库存',
    },
  ]
  return {
    kind: 'agent',
    keyNo: o.no,
    storeId: o.storeId,
    headline: `${storeText(db, o.storeId)}　${o.createdAt}　${AGENT_STATUS[o.status].label}`,
    nodes,
    related: source ? [{ label: `来源提货单（码${sourceCode}）`, no: source.omsNo }] : [],
    logs: db.auditLogs.filter((l) => l.objectNo === o.no),
  }
}

/** 输入销售单号、退货单号、提货码、OMS单号或代客单号 */
export function trace(input: { q: string; storeIds?: string[] }) {
  return query((db) => {
    const q = input.q.trim().toUpperCase()
    if (!q) fail('请输入单号或提货码')
    let result: TraceResult | undefined
    const sale = db.sales.find((s) => s.no === q)
    const ret = db.returns.find((r) => r.no === q)
    const pickup =
      db.pickups.find((p) => p.pickupCode === q || p.omsNo === q || p.channelOrderNo === q || p.verificationNo === q) ??
      db.pickups.find((p) => db.verifications.some((v) => v.no === q && v.omsNo === p.omsNo))
    const agent = db.agentOrders.find((o) => o.no === q || o.oms.omsNo === q)
    if (sale) result = traceSale(db, sale)
    else if (ret) result = traceReturn(db, ret)
    else if (pickup) result = tracePickup(db, pickup)
    else if (agent) result = traceAgent(db, agent.no)
    if (!result) fail('没有找到这个单号或提货码')
    if (input.storeIds && !input.storeIds.includes(result.storeId)) fail('这张单不在你的数据范围内', '《8.角色权限原则》§二：员工只看授权范围内的店')
    return result
  })
}

/** 追溯页的示例单号：每类取一张，方便演示 */
export function traceSamples(storeIds?: string[]) {
  return query((db) => {
    const ok = (storeId: string) => !storeIds || storeIds.includes(storeId)
    const samples: { label: string; q: string }[] = []
    const sale = [...db.sales].reverse().find((s) => ok(s.storeId) && s.dailyCloseNo)
    if (sale) samples.push({ label: '已封账的销售单', q: sale.no })
    const returned = [...db.returns].reverse().find((r) => ok(r.storeId))
    if (returned) samples.push({ label: '退货单', q: returned.no })
    const picked = db.pickups.find((p) => ok(p.storeId) && p.status === 'verified')
    if (picked) samples.push({ label: '已核销的提货码', q: picked.pickupCode })
    const agent = db.agentOrders.find((o) => ok(o.storeId) && o.status === 'shipped')
    if (agent) samples.push({ label: '已发货的代客单', q: agent.no })
    return samples
  })
}
