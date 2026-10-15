import { canAuthorizeFor } from '../config/permissions'
import { resetDb } from '../mock/db'
import { employeeOf, fail, plain, query, storeOf } from './core'

export function meta() {
  return query((db) => ({ seedDate: db.seedDate, seededAt: db.seededAt }))
}

export function stores() {
  return query((db) => db.stores)
}

export function franchisees() {
  return query((db) => db.franchisees)
}

export function nodes() {
  return query((db) => db.nodes)
}

export function employees() {
  return query((db) => db.employees.map(({ pin: _pin, ...rest }) => rest))
}

export function products() {
  return query((db) => db.products)
}

export function categories() {
  return query((db) => db.categories)
}

export function promotions() {
  return query((db) => db.promotions)
}

export function couponTemplates() {
  return query((db) => db.couponTemplates)
}

/** 演示登录：工号 + 演示PIN */
export function login(jobNo: string, pin: string) {
  return query((db) => {
    const e = db.employees.find((x) => x.jobNo.toUpperCase() === jobNo.trim().toUpperCase())
    if (!e) fail('工号不存在')
    if (!e.active) fail('账号已停用')
    if (e.pin !== pin) fail('PIN不对，演示PIN统一是1234')
    const { pin: _pin, ...rest } = e
    return rest
  })
}

/**
 * 授权人确认：工号、PIN，且有授权职责、门店在其数据范围内。
 * 不拦截本人授权本人（【待确认-51】）。
 */
export function authorize(input: { jobNo: string; pin: string; storeId: string }) {
  return query((db) => {
    const e = db.employees.find((x) => x.jobNo.toUpperCase() === input.jobNo.trim().toUpperCase())
    if (!e || e.pin !== input.pin) fail('授权人工号或PIN不对')
    if (!canAuthorizeFor(e, input.storeId, db.stores)) {
      fail(`${e.name}不能为${storeOf(db, input.storeId).name}授权`, '授权人由本店店长和被授权的总部运营担任，层级见【待确认-51】')
    }
    return { jobNo: e.jobNo, name: e.name, title: e.title }
  })
}

/** 扫码或搜索：条码、SKU、名称 */
export function findProducts(keyword: string) {
  return query((db) => {
    const k = keyword.trim().toLowerCase()
    if (!k) return db.products.filter((p) => p.status === 'active')
    const exact = db.products.filter((p) => p.barcodes.includes(k) || p.sku.toLowerCase() === k)
    if (exact.length) return exact
    return db.products.filter((p) => p.status === 'active' && (p.name.toLowerCase().includes(k) || p.spec.toLowerCase().includes(k) || p.sku.toLowerCase().includes(k)))
  })
}

/** 会员只识别本店（【待确认-37】） */
export function findMember(storeId: string, phone: string) {
  return query((db) => {
    const p = phone.trim()
    if (!/^1\d{10}$/.test(p)) fail('请输入11位手机号')
    const m = db.members.find((x) => x.phone === p)
    if (!m) fail('没有找到这个会员')
    if (m.storeId !== storeId) fail('这是其他门店的会员，原型只能识别本店会员', '会员是否跨店共享见【待确认-37】')
    return m
  })
}

export function employeeName(jobNo: string) {
  return query((db) => employeeOf(db, jobNo).name)
}

export async function reset() {
  resetDb()
  return plain({ ok: true })
}
