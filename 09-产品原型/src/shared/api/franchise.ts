import type { FranchiseDue, FranchiseSettlement, Remittance } from '../types'
import { scopeFranchiseeIds } from '../config/permissions'
import * as hub from '../mock/hub'
import type { DemoDb } from '../mock/schema'
import { byTimeDesc, command, fail, query, requirePerm } from './core'

/**
 * 加盟营业款（阶段5）。应缴由中枢按营业日生成，POS 只读，不在店里改数；
 * 缴款由加盟商登记、中枢核对；结算单只读，规则未定的项不出金额。
 */

const inFranchisees = (ids?: string[]) => (x: { franchiseeId: string }) => !ids || ids.includes(x.franchiseeId)

export function dues(
  f: { franchiseeIds?: string[]; storeIds?: string[]; status?: FranchiseDue['status']; from?: string; to?: string } = {},
) {
  return query((db) =>
    db.dues
      .filter(
        (d) =>
          inFranchisees(f.franchiseeIds)(d) &&
          (!f.storeIds || f.storeIds.includes(d.storeId)) &&
          (!f.status || d.status === f.status) &&
          (!f.from || d.bizDate >= f.from) &&
          (!f.to || d.bizDate <= f.to),
      )
      .sort(byTimeDesc((d) => d.bizDate + d.storeId)),
  )
}

function franchiseeInScope(db: DemoDb, jobNo: string, franchiseeId: string) {
  const e = db.employees.find((x) => x.jobNo === jobNo)
  if (!scopeFranchiseeIds(e, db.franchisees).includes(franchiseeId)) fail('只能处理本加盟商的应缴和结算', '《8.角色权限原则》§二：加盟商账号只落在本加盟商')
}

/** 缴款登记：金额取所选应缴之和，不能手改（上缴全额还是净额见【待确认-17】） */
export function registerRemittance(input: {
  franchiseeId: string
  dueNos: string[]
  method: string
  voucherNo: string
  registrantJobNo: string
  note?: string
}) {
  return command((db) => {
    requirePerm(db, input.registrantJobNo, 'remit.register')
    franchiseeInScope(db, input.registrantJobNo, input.franchiseeId)
    if (!input.method) fail('请选择缴款方式')
    return hub.registerRemittance(db, input)
  })
}

export function remittances(f: { franchiseeIds?: string[]; status?: Remittance['status'] } = {}) {
  return query((db) =>
    db.remittances
      .filter((r) => inFranchisees(f.franchiseeIds)(r) && (!f.status || r.status === f.status))
      .sort(byTimeDesc((r) => r.registeredAt)),
  )
}

export function settlements(f: { franchiseeIds?: string[]; status?: FranchiseSettlement['status'] } = {}) {
  return query((db) =>
    db.settlements
      .filter((s) => inFranchisees(f.franchiseeIds)(s) && (!f.status || s.status === f.status))
      .sort(byTimeDesc((s) => s.generatedAt)),
  )
}

export function settlement(no: string) {
  return query((db) => {
    const s = db.settlements.find((x) => x.no === no)
    if (!s) fail('找不到结算单')
    const dues = db.dues
      .filter((d) => d.franchiseeId === s.franchiseeId && d.bizDate >= s.periodStart && d.bizDate <= s.periodEnd)
      .sort((a, b) => (a.bizDate < b.bizDate ? -1 : 1))
    const remitNos = new Set(dues.map((d) => d.remittanceNo).filter(Boolean))
    return {
      settlement: s,
      franchisee: db.franchisees.find((x) => x.id === s.franchiseeId),
      dues,
      remittances: db.remittances.filter((r) => remitNos.has(r.no)),
    }
  })
}

/** 有异议另提，不改原始成交，也不改结算单上的数 */
export function dispute(input: { no: string; byJobNo: string; note: string }) {
  return command((db) => {
    requirePerm(db, input.byJobNo, 'settlement.dispute')
    const s = db.settlements.find((x) => x.no === input.no)
    if (!s) fail('找不到结算单')
    franchiseeInScope(db, input.byJobNo, s.franchiseeId)
    hub.disputeSettlement(db, input.no, input.byJobNo, input.note)
    return s
  })
}
