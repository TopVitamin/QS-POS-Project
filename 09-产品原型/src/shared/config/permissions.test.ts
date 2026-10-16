import { describe, expect, it } from 'vitest'
import { EMPLOYEES, FRANCHISEES, STORES } from '../mock/seed/org'
import { can, canAuthorizeFor, canEnter, listsCustomer, scopeFranchiseeIds, scopeStoreIds } from './permissions'

const emp = (jobNo: string) => EMPLOYEES.find((e) => e.jobNo === jobNo)!
const store = (id: string) => STORES.find((s) => s.id === id)!

describe('职责权限', () => {
  it('导购能开单、核销、代客下单，不能收款', () => {
    const guide = emp('QS1003')
    expect(can(guide, 'sale.open')).toBe(true)
    expect(can(guide, 'pickup.verify')).toBe(true)
    expect(can(guide, 'agent.create')).toBe(true)
    expect(can(guide, 'payment.collect')).toBe(false)
  })

  it('日结封账只给店长', () => {
    expect(can(emp('QS1001'), 'daily.close')).toBe(true)
    expect(can(emp('QS1002'), 'daily.close')).toBe(false)
    expect(can(emp('QS9001'), 'daily.close')).toBe(false)
  })

  it('只有导购的账号进不了管理端，店长在收银端靠兼的收银职责', () => {
    expect(canEnter(emp('QS1003'), 'admin')).toBe(false)
    expect(canEnter(emp('QS1003'), 'cashier')).toBe(true)
    expect(canEnter(emp('QS9001'), 'cashier')).toBe(false)
    expect(canEnter(emp('QS1001'), 'cashier')).toBe(true)
  })
})

describe('数据范围', () => {
  it('加盟商账号只看本加盟商的店', () => {
    expect(scopeStoreIds(emp('JMA001'), STORES)).toEqual(['s03'])
    expect(scopeStoreIds(emp('JMB001'), STORES)).toEqual(['s04'])
  })

  it('总部按授权到店，财务的加盟结算按加盟商单独授权', () => {
    expect(scopeStoreIds(emp('QS9001'), STORES)).toEqual(['s01', 's02'])
    expect(scopeFranchiseeIds(emp('QS9002'), FRANCHISEES)).toEqual(['fa', 'fb'])
    expect(scopeFranchiseeIds(emp('QS9001'), FRANCHISEES)).toEqual([])
  })

  it('授权人只能给自己范围内的门店授权', () => {
    expect(canAuthorizeFor(emp('QS1001'), 's01', STORES)).toBe(true)
    expect(canAuthorizeFor(emp('QS1001'), 's02', STORES)).toBe(false)
    expect(canAuthorizeFor(emp('QS1002'), 's01', STORES)).toBe(false)
  })

  it('履约列表只在直营店展示顾客字段', () => {
    expect(listsCustomer(store('s01'))).toBe(true)
    expect(listsCustomer(store('s03'))).toBe(false)
    expect(listsCustomer(null)).toBe(false)
  })
})
