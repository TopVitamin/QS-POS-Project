import { showDialog, showToast } from 'vant'
import { errorInfo } from '@/shared/composables/useRequest'

/** 移动端的结果提示：成功用轻提示，失败弹窗并带规则依据 */
export function toastOk(message: string) {
  showToast({ type: 'success', message, wordBreak: 'break-word', duration: 2200 })
}

export function alertFail(e: unknown, title?: string) {
  const info = errorInfo(e)
  void showDialog({
    title: title ?? info.message,
    message: [title ? info.message : '', info.basis ? `依据：${info.basis}` : ''].filter(Boolean).join('\n'),
    messageAlign: 'left',
    confirmButtonText: '知道了',
  })
}

export function explain(title: string, message: string) {
  void showDialog({ title, message, messageAlign: 'left', confirmButtonText: '知道了' })
}

/** 执行一个写操作：成功轻提示，失败弹窗，返回结果或 undefined */
export async function run<T>(task: () => Promise<T>, okText?: string | ((r: T) => string)): Promise<T | undefined> {
  try {
    const r = await task()
    if (okText) toastOk(typeof okText === 'function' ? okText(r) : okText)
    return r
  } catch (e) {
    alertFail(e)
    return undefined
  }
}
