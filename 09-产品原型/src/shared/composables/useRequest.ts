import { onScopeDispose, ref, shallowRef, watch, type Ref, type WatchSource } from 'vue'
import { ApiError } from '../api/core'
import { dbVersion, onDbChange } from '../mock/db'

export interface UseRequestOptions<T> {
  /** 默认 true：创建时就请求 */
  immediate?: boolean
  /** 这些值变了重新请求 */
  watch?: WatchSource[]
  /** 默认 true：本地库变化（含其他标签页）时静默刷新，三个端的数据保持一致 */
  live?: boolean
  initial?: T
}

/** 读接口的统一包装：加载态、错误、旧请求结果丢弃 */
export function useRequest<T>(fn: () => Promise<T>, opts: UseRequestOptions<T> = {}) {
  const data = shallowRef(opts.initial) as Ref<T | undefined>
  const loading = ref(false)
  const error = shallowRef<unknown>(null)
  let seq = 0

  async function run(silent = false): Promise<T | undefined> {
    const id = ++seq
    if (!silent) loading.value = true
    try {
      const value = await fn()
      if (id === seq) {
        data.value = value
        error.value = null
      }
      return value
    } catch (e) {
      if (id === seq) error.value = e
      return undefined
    } finally {
      if (id === seq) loading.value = false
    }
  }

  if (opts.watch?.length) watch(opts.watch, () => run(), { deep: true })
  if (opts.live !== false) onScopeDispose(onDbChange(() => run(true)))
  if (opts.immediate !== false) run()

  return { data, loading, error, run, refresh: () => run(true) }
}

/** 本地库版本号，库一变就加一 */
export function useDbVersion() {
  const v = ref(dbVersion())
  onScopeDispose(onDbChange((n) => (v.value = n)))
  return v
}

/** 把任意错误转成给店员看的一句话和规则依据 */
export function errorInfo(e: unknown): { message: string; basis?: string; detail?: unknown } {
  if (e instanceof ApiError) return { message: e.message, basis: e.basis, detail: e.detail }
  if (e instanceof Error) return { message: e.message }
  return { message: String(e) }
}
