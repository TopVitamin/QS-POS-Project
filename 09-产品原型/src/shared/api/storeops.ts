import type { Replenishment, ReturnToWarehouse, Stocktake } from '../types'
import { canAuthorizeFor } from '../config/permissions'
import { nextBillNo } from '../domain/numbering'
import { stocktakeDiffs } from '../domain/rules'
import * as hub from '../mock/hub'
import { nowText } from '../utils/time'
import { byTimeDesc, command, fail, inStores, productOf, query, requirePerm, storeOf } from './core'

type QtyInput = { sku: string; qty: number }[]

function toLines(db: Parameters<typeof productOf>[0], items: QtyInput) {
  const lines = items
    .filter((i) => i.qty > 0)
    .map((i) => {
      const p = productOf(db, i.sku)
      return { sku: p.sku, name: p.name, spec: p.spec, qty: Math.floor(i.qty) }
    })
  if (!lines.length) fail('请至少选一个商品')
  return lines
}

// ---------- 要货：申请，审核和调拨指令在中枢（【待确认-48】） ----------

export function createReplenishment(input: { storeId: string; creatorJobNo: string; items: QtyInput; note: string }) {
  return command((db) => {
    requirePerm(db, input.creatorJobNo, 'storeops.manage', input.storeId)
    const at = nowText()
    const r: Replenishment = {
      no: nextBillNo(db.counters, 'replenish', at),
      storeId: input.storeId,
      createdAt: at,
      creatorJobNo: input.creatorJobNo,
      lines: toLines(db, input.items),
      note: input.note.trim(),
      status: 'reviewing',
      hub: {},
    }
    db.replenishments.push(r)
    return r
  })
}

export function replenishments(f: { storeIds?: string[]; status?: Replenishment['status'] } = {}) {
  return query((db) => db.replenishments.filter((r) => inStores(f.storeIds)(r) && (!f.status || r.status === f.status)).sort(byTimeDesc((r) => r.createdAt)))
}

// ---------- 收货：按来源出库单逐行录入实收 ----------

export function shipments(f: { storeIds?: string[]; status?: 'in_transit' | 'received' } = {}) {
  return query((db) => db.shipments.filter((s) => inStores(f.storeIds)(s) && (!f.status || s.status === f.status)).sort(byTimeDesc((s) => s.shippedAt)))
}

export function shipment(outboundNo: string) {
  return query((db) => {
    const s = db.shipments.find((x) => x.outboundNo === outboundNo)
    if (!s) fail('找不到出库单')
    return {
      shipment: s,
      receipt: db.receipts.find((r) => r.outboundNo === outboundNo),
      discrepancy: db.discrepancies.find((d) => d.outboundNo === outboundNo),
    }
  })
}

export function receive(input: { outboundNo: string; received: Record<string, number | null>; operatorJobNo: string }) {
  return command((db) => {
    const s = db.shipments.find((x) => x.outboundNo === input.outboundNo)
    if (!s) fail('找不到出库单')
    requirePerm(db, input.operatorJobNo, 'storeops.manage', s.storeId)
    const missing = s.lines.filter((l) => input.received[l.sku] === null || input.received[l.sku] === undefined)
    if (missing.length) fail(`还有${missing.length}行没录实收`, '实收不预填出库数，必须逐行点数后录入（《4.全局业务规则》§四）')
    const received = Object.fromEntries(s.lines.map((l) => [l.sku, Number(input.received[l.sku])]))
    const receipt = hub.postReceipt(db, { outboundNo: s.outboundNo, received, operatorJobNo: input.operatorJobNo })
    return { receipt, discrepancy: db.discrepancies.find((d) => d.no === receipt.discrepancyNo) }
  })
}

export function receipts(f: { storeIds?: string[] } = {}) {
  return query((db) => db.receipts.filter(inStores(f.storeIds)).sort(byTimeDesc((r) => r.receivedAt)))
}

export function discrepancies(f: { storeIds?: string[] } = {}) {
  return query((db) => db.discrepancies.filter(inStores(f.storeIds)).sort(byTimeDesc((d) => d.createdAt)))
}

// ---------- 盘点：差异授权前不改可用 ----------

export function createStocktake(input: { storeId: string; creatorJobNo: string; scope: 'full' | 'partial'; skus?: string[]; note?: string }) {
  return command((db) => {
    requirePerm(db, input.creatorJobNo, 'stocktake.manage', input.storeId)
    const store = storeOf(db, input.storeId)
    if (db.stocktakes.some((s) => s.storeId === input.storeId && s.status === 'counting')) fail('本店还有一张盘点中的单，先提交那一张')
    const skus = input.scope === 'full' ? db.products.map((p) => p.sku) : (input.skus ?? [])
    if (!skus.length) fail('抽盘请至少选一个商品')
    const at = nowText()
    const st: Stocktake = {
      no: nextBillNo(db.counters, 'stocktake', at),
      storeId: input.storeId,
      scope: input.scope,
      createdAt: at,
      creatorJobNo: input.creatorJobNo,
      status: 'counting',
      lines: skus.map((sku) => {
        const p = productOf(db, sku)
        return { sku, name: p.name, spec: p.spec, bookQty: hub.stockRecord(db, input.storeId, sku).onHand, countedQty: null }
      }),
      joint: store.mode === 'franchise',
      note: input.note?.trim() || undefined,
    }
    db.stocktakes.push(st)
    return st
  })
}

export function saveCounts(input: { no: string; counts: Record<string, number | null>; operatorJobNo: string }) {
  return command((db) => {
    const st = db.stocktakes.find((s) => s.no === input.no)
    if (!st || st.status !== 'counting') fail('只有盘点中的单能录入')
    requirePerm(db, input.operatorJobNo, 'stocktake.manage', st.storeId)
    for (const l of st.lines) {
      if (l.sku in input.counts) {
        const v = input.counts[l.sku]
        l.countedQty = v === null || v === undefined || Number.isNaN(v) ? null : Math.max(0, Math.floor(v))
      }
    }
    return st
  })
}

export function submitStocktake(input: { no: string; operatorJobNo: string }) {
  return command((db) => {
    const st = db.stocktakes.find((s) => s.no === input.no)
    if (!st || st.status !== 'counting') fail('只有盘点中的单能提交')
    requirePerm(db, input.operatorJobNo, 'stocktake.manage', st.storeId)
    const missing = st.lines.filter((l) => l.countedQty === null).length
    if (missing) fail(`还有${missing}行没录实盘数`)
    st.status = 'submitted'
    st.submittedAt = nowText()
    return { stocktake: st, diffs: stocktakeDiffs(st.lines) }
  })
}

/** 差异过账：授权人确认后中枢调账 */
export function postStocktake(input: { no: string; operatorJobNo: string; authorizer: { jobNo: string; pin: string } }) {
  return command((db) => {
    const st = db.stocktakes.find((s) => s.no === input.no)
    if (!st) fail('找不到盘点单')
    requirePerm(db, input.operatorJobNo, 'stocktake.post', st.storeId)
    const a = db.employees.find((e) => e.jobNo.toUpperCase() === input.authorizer.jobNo.trim().toUpperCase())
    if (!a || a.pin !== input.authorizer.pin) fail('授权人工号或PIN不对')
    if (!canAuthorizeFor(a, st.storeId, db.stores)) fail(`${a.name}不能为这家店授权`, '授权层级见【待确认-51】')
    return hub.postStocktake(db, st.no, { operatorJobNo: input.operatorJobNo, authorizerJobNo: a.jobNo })
  })
}

export function stocktakes(f: { storeIds?: string[]; status?: Stocktake['status'] } = {}) {
  return query((db) => db.stocktakes.filter((s) => inStores(f.storeIds)(s) && (!f.status || s.status === f.status)).sort(byTimeDesc((s) => s.createdAt)))
}

export function stocktake(no: string) {
  return query((db) => {
    const st = db.stocktakes.find((s) => s.no === no)
    if (!st) fail('找不到盘点单')
    return { stocktake: st, diffs: stocktakeDiffs(st.lines) }
  })
}

// ---------- 退仓 ----------

export function createRtw(input: { storeId: string; creatorJobNo: string; reason: string; items: QtyInput }) {
  return command((db) => {
    requirePerm(db, input.creatorJobNo, 'storeops.manage', input.storeId)
    if (!input.reason) fail('请选择退仓原因')
    const lines = toLines(db, input.items)
    const check = hub.checkAvailability(db, input.storeId, lines)
    if (!check.ok) fail(`本店可用不够退：${check.message}`, check.basis)
    const at = nowText()
    const r: ReturnToWarehouse = {
      no: nextBillNo(db.counters, 'returnWh', at),
      storeId: input.storeId,
      createdAt: at,
      creatorJobNo: input.creatorJobNo,
      reason: input.reason,
      lines,
      status: 'submitted',
      hub: {},
    }
    db.returnsToWarehouse.push(r)
    return r
  })
}

export function rtws(f: { storeIds?: string[] } = {}) {
  return query((db) => db.returnsToWarehouse.filter(inStores(f.storeIds)).sort(byTimeDesc((r) => r.createdAt)))
}
