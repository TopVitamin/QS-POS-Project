import { can, scopeStoreIds, type Perm } from '../config/permissions'
import { getDb, writeDb } from '../mock/db'
import { HubRejection } from '../mock/hub'
import type { DemoDb } from '../mock/schema'
import type { Employee } from '../types'

/** 页面看到的错误：message 给店员看，basis 是规则依据 */
export class ApiError extends Error {
  constructor(
    message: string,
    public basis?: string,
    public detail?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/** 模拟网络延迟，让加载态看得见；截图和测试时可以关掉 */
let latency: [number, number] = [60, 180]
export function setLatency(min: number, max = min) {
  latency = [min, max]
}

const wait = () => {
  const [min, max] = latency
  const ms = min + Math.random() * (max - min)
  return ms > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve()
}

/** JSON 往返：拿到的一定是普通对象，页面改了也不会影响库 */
export const plain = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)))

function translate(e: unknown): never {
  if (e instanceof HubRejection) throw new ApiError(e.message, e.basis, e.detail)
  throw e
}

export async function query<T>(fn: (db: DemoDb) => T): Promise<T> {
  await wait()
  try {
    return plain(fn(getDb()))
  } catch (e) {
    return translate(e)
  }
}

export async function command<T>(fn: (db: DemoDb) => T): Promise<T> {
  await wait()
  try {
    return plain(writeDb(fn))
  } catch (e) {
    return translate(e)
  }
}

export function fail(message: string, basis?: string, detail?: unknown): never {
  throw new ApiError(message, basis, detail)
}

export function employeeOf(db: DemoDb, jobNo: string): Employee {
  const e = db.employees.find((x) => x.jobNo === jobNo)
  if (!e) fail(`工号${jobNo}不存在`)
  return e
}

/** 操作类接口都要过权限和数据范围，页面隐藏按钮之外再挡一层 */
export function requirePerm(db: DemoDb, jobNo: string, perm: Perm, storeId?: string): Employee {
  const e = employeeOf(db, jobNo)
  if (!e.active) fail(`${e.name}的账号已停用`)
  if (!can(e, perm)) fail(`${e.name}没有这项权限`, '《8.角色权限原则》：按职责授权，兼岗不扩大数据范围')
  if (storeId && !scopeStoreIds(e, db.stores).includes(storeId)) fail(`${e.name}的数据范围不含这家店`, '《8.角色权限原则》§二：员工只看授权范围内的店')
  return e
}

export function storeOf(db: DemoDb, storeId: string) {
  const s = db.stores.find((x) => x.id === storeId)
  if (!s) fail('门店不存在')
  return s
}

export function productOf(db: DemoDb, sku: string) {
  const p = db.products.find((x) => x.sku === sku)
  if (!p) fail(`商品${sku}不存在`)
  return p
}

export const inStores = (storeIds?: string[]) => (x: { storeId: string }) => !storeIds || storeIds.includes(x.storeId)

export const byTimeDesc = <T>(key: (x: T) => string) => (a: T, b: T) => (key(a) < key(b) ? 1 : key(a) > key(b) ? -1 : 0)
