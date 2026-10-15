import type { AgentOrder, PickupOrder, VerifyRejectReason } from '../types'
import { VERIFY_REJECT } from '../config/labels'
import { nextBillNo } from '../domain/numbering'
import { BASIS } from '../domain/rules'
import * as hub from '../mock/hub'
import { nowText } from '../utils/time'
import { byTimeDesc, command, fail, inStores, productOf, query, requirePerm } from './core'

export type JudgeResult =
  | { ok: true; order: PickupOrder }
  | { ok: false; reason: VerifyRejectReason; label: string; detail: string; basis?: string; order?: Pick<PickupOrder, 'omsNo' | 'storeId' | 'items' | 'status'> }

/**
 * 输入提货码，由中枢核验。被拒当场留记录；通过的还要店员核对商品后点确认，才真正核销。
 */
export function judge(input: { storeId: string; code: string; operatorJobNo: string }) {
  return command<JudgeResult>((db) => {
    requirePerm(db, input.operatorJobNo, 'pickup.verify', input.storeId)
    const code = input.code.trim()
    if (!code) fail('请输入提货码')
    const { order, verdict } = hub.judgeCode(db, input.storeId, code)
    if (verdict.ok && order) return { ok: true, order }
    const reason = verdict.ok ? 'not_found' : verdict.reason
    hub.recordRejection(db, { storeId: input.storeId, code, reason, omsNo: order?.omsNo, operatorJobNo: input.operatorJobNo })
    return {
      ok: false,
      reason,
      ...VERIFY_REJECT[reason],
      basis: verdict.ok ? undefined : verdict.basis,
      order: order ? { omsNo: order.omsNo, storeId: order.storeId, items: order.items, status: order.status } : undefined,
    }
  })
}

export function confirm(input: { storeId: string; code: string; operatorJobNo: string }) {
  return command((db) => {
    requirePerm(db, input.operatorJobNo, 'pickup.verify', input.storeId)
    const rec = hub.verifyPickup(db, { storeId: input.storeId, code: input.code.trim(), operatorJobNo: input.operatorJobNo })
    return { record: rec, order: db.pickups.find((p) => p.omsNo === rec.omsNo)! }
  })
}

export function pickups(f: { storeIds?: string[]; status?: PickupOrder['status'] } = {}) {
  return query((db) => db.pickups.filter((p) => inStores(f.storeIds)(p) && (!f.status || p.status === f.status)).sort(byTimeDesc((p) => p.createdAt)))
}

export function verifications(f: { storeIds?: string[]; bizDate?: string; result?: 'success' | 'rejected' } = {}) {
  return query((db) =>
    db.verifications
      .filter((v) => inStores(f.storeIds)(v) && (!f.bizDate || v.at.startsWith(f.bizDate)) && (!f.result || v.result === f.result))
      .sort(byTimeDesc((v) => v.at)),
  )
}

/**
 * 代客下单：申请，不是发货指令。POS不选仓、不选承运商，也不收款（【待确认-06】）。
 * 导购工号记在单上，作为业绩归属的主键。
 */
export function createAgentOrder(input: {
  storeId: string
  guideJobNo: string
  creatorJobNo: string
  source: AgentOrder['source']
  sourceRef?: string
  customer: { name: string; phone: string; address: string }
  items: { sku: string; qty: number }[]
  note?: string
}) {
  return command((db) => {
    requirePerm(db, input.creatorJobNo, 'agent.create', input.storeId)
    const guide = db.employees.find((e) => e.jobNo === input.guideJobNo)
    if (!guide || !guide.duties.includes('guide') || !guide.storeIds.includes(input.storeId)) fail('请选择本店导购工号')
    const name = input.customer.name.trim()
    const phone = input.customer.phone.trim()
    const address = input.customer.address.trim()
    if (!name) fail('请填写收货人')
    if (!/^1\d{10}$/.test(phone)) fail('请填写11位手机号')
    if (address.length < 6) fail('请填写完整的收货地址')
    const items = input.items
      .filter((i) => i.qty > 0)
      .map((i) => {
        const p = productOf(db, i.sku)
        return { sku: p.sku, name: p.name, spec: p.spec, qty: i.qty, unitPrice: p.price }
      })
    if (!items.length) fail('请选择商品')
    const at = nowText()
    const order: AgentOrder = {
      no: nextBillNo(db.counters, 'agent', at),
      storeId: input.storeId,
      guideJobNo: input.guideJobNo,
      creatorJobNo: input.creatorJobNo,
      source: input.source,
      sourceRef: input.sourceRef,
      customer: { name, phone, address },
      items,
      referenceAmount: items.reduce((s, i) => s + i.unitPrice * i.qty, 0),
      note: input.note?.trim() || undefined,
      createdAt: at,
      status: 'submitted',
      oms: {},
    }
    hub.submitAgentOrder(db, order, at)
    return order
  })
}

export function agentOrders(f: { storeIds?: string[]; status?: AgentOrder['status']; bizDate?: string; guideJobNo?: string } = {}) {
  return query((db) =>
    db.agentOrders
      .filter(
        (o) =>
          inStores(f.storeIds)(o) &&
          (!f.status || o.status === f.status) &&
          (!f.bizDate || o.createdAt.startsWith(f.bizDate)) &&
          (!f.guideJobNo || o.guideJobNo === f.guideJobNo),
      )
      .sort(byTimeDesc((o) => o.createdAt)),
  )
}

export const AGENT_BASIS = BASIS.agent
