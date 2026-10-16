import { todayBizDate } from '../utils/time'
import { SCHEMA_VERSION, type DemoDb } from './schema'
import { buildSeed } from './seed/history'

/**
 * 本地演示库，存在 localStorage 的 qs-pos-demo 键里，三个端共用。
 * 每次写入都先从存储重新读一份，在副本上改，成功后整体写回：
 * 写到一半出错不会留下半截数据，另一个标签页刚写的也不会被覆盖。
 */
export const STORAGE_KEY = 'qs-pos-demo'

let cache: DemoDb | null = null
let version = 0
const listeners = new Set<(v: number) => void>()

const hasStorage = () => typeof localStorage !== 'undefined'

function load(): DemoDb | null {
  if (!hasStorage()) return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const db = JSON.parse(raw) as DemoDb
    // 换天或结构升级后重新生成，演示数据总是「今天」
    if (db.schema !== SCHEMA_VERSION || db.seedDate !== todayBizDate()) return null
    return db
  } catch {
    return null
  }
}

function commit(db: DemoDb) {
  const text = JSON.stringify(db)
  if (hasStorage()) {
    try {
      localStorage.setItem(STORAGE_KEY, text)
    } catch (e) {
      console.warn('演示数据写入 localStorage 失败', e)
    }
  }
  // 重新解析一遍，保证缓存里都是普通对象（页面传进来的可能是响应式代理）
  cache = JSON.parse(text) as DemoDb
  notify()
}

function notify() {
  version += 1
  listeners.forEach((fn) => fn(version))
}

export function getDb(): DemoDb {
  // 页面开着跨过零点，也要换成新一天的数据
  if (cache && cache.seedDate !== todayBizDate()) cache = null
  if (!cache) {
    const loaded = load()
    if (loaded) cache = loaded
    else commit(buildSeed())
  }
  return cache!
}

export function writeDb<T>(fn: (db: DemoDb) => T): T {
  const db = load() ?? buildSeed()
  const result = fn(db)
  commit(db)
  return result
}

export function resetDb() {
  commit(buildSeed())
}

export function onDbChange(fn: (v: number) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function dbVersion() {
  return version
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY || e.key === null) {
      cache = null
      notify()
    }
  })
}
