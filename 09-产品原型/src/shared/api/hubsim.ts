import * as hub from '../mock/hub'
import type { PayOutcome } from '../mock/schema'
import { addDays, nowText, todayBizDate } from '../utils/time'
import { byTimeDesc, command, fail, query } from './core'

/**
 * 中枢模拟器：演示工具，把中枢、OMS、WMS 和支付通道那一侧的动作做成按钮。
 * 不属于 POS，不计入权限。
 */

export function overview() {
  return query((db) => ({
    sim: db.sim,
    stores: db.stores,
    pickups: db.pickups.filter((p) => p.status === 'pending').sort(byTimeDesc((p) => p.createdAt)),
    agentOrders: db.agentOrders.filter((o) => o.status !== 'signed' && o.status !== 'cancelled').sort(byTimeDesc((o) => o.createdAt)),
    replenishments: db.replenishments.filter((r) => r.status === 'reviewing' || r.status === 'approved').sort(byTimeDesc((r) => r.createdAt)),
    transfers: db.transfers.filter((t) => t.status === 'reviewing' || t.status === 'approved').sort(byTimeDesc((t) => t.createdAt)),
    rtws: db.returnsToWarehouse.filter((r) => r.status !== 'shipped').sort(byTimeDesc((r) => r.createdAt)),
    remittances: db.remittances.filter((r) => r.status === 'pending').sort(byTimeDesc((r) => r.registeredAt)),
    discrepancies: db.discrepancies.filter((d) => d.status === 'submitted').sort(byTimeDesc((d) => d.createdAt)),
    franchisees: db.franchisees,
    nodes: db.nodes,
    counts: {
      sales: db.sales.length,
      ledger: db.ledger.length,
      logs: db.auditLogs.length,
      hubProcessed: Object.keys(db.hubProcessed).length,
    },
    seededAt: db.seededAt,
  }))
}

export function setNextPayResult(outcome: PayOutcome) {
  return command((db) => {
    db.sim.nextPayResult = outcome
    return db.sim
  })
}

export function sim() {
  return query((db) => db.sim)
}

/** 小程序顾客下单选自提门店：中枢先锁定，锁定成功才出提货码 */
export function createPickup(input: { storeId: string; items: { sku: string; qty: number }[]; customer: { name: string; phone: string } }) {
  return command((db) => hub.createPickupOrder(db, input))
}

export function expirePickup(omsNo: string) {
  return command((db) => hub.expirePickup(db, omsNo))
}

export function invalidateLock(omsNo: string) {
  return command((db) => hub.invalidateLock(db, omsNo))
}

export function toggleRoutingPause(storeId: string) {
  return command((db) => {
    const s = db.stores.find((x) => x.id === storeId)
    if (!s) fail('门店不存在')
    s.pausedForRouting = !s.pausedForRouting
    return s
  })
}

export function reviewReplenishment(no: string, approve: boolean, note: string) {
  return command((db) => hub.reviewReplenishment(db, no, approve, note || (approve ? '演示：中枢审核通过' : '演示：中枢驳回')))
}

export function shipReplenishment(no: string) {
  return command((db) => hub.shipReplenishment(db, no))
}

export function reviewTransfer(no: string, approve: boolean, note: string) {
  return command((db) => hub.reviewTransfer(db, no, approve, note || (approve ? '演示：中枢审核通过' : '演示：中枢驳回')))
}

export function shipTransfer(no: string) {
  return command((db) => hub.shipTransfer(db, no))
}

export function routeAgent(no: string, nodeName: string) {
  return command((db) => hub.routeAgentOrder(db, no, nowText(), nodeName))
}

export function shipAgent(no: string) {
  return command((db) => hub.shipAgentOrder(db, no))
}

export function signAgent(no: string) {
  return command((db) => hub.signAgentOrder(db, no))
}

export function approveRtw(no: string) {
  return command((db) => hub.approveRtw(db, no))
}

export function shipRtw(no: string) {
  return command((db) => hub.shipRtw(db, no))
}

export function confirmRemittance(no: string) {
  return command((db) => hub.confirmRemittance(db, no))
}

/** 差异单由中枢处理，责任判定见【待确认-22】，这里只改成「已处理」 */
export function handleDiscrepancy(no: string) {
  return command((db) => {
    const d = db.discrepancies.find((x) => x.no === no)
    if (!d || d.status !== 'submitted') fail('只有已提交的差异单能处理')
    d.status = 'handled'
  })
}

/** 按过去7个营业日重新出一张结算单，只为展示版式（结算周期见【待确认-19】） */
export function issueSettlement(franchiseeId: string) {
  return command((db) => {
    const today = todayBizDate()
    const start = addDays(today, -7)
    const end = addDays(today, -1)
    const s = hub.buildSettlement(db, franchiseeId, start, end, nowText())
    db.settlements.push(s)
    return s
  })
}
