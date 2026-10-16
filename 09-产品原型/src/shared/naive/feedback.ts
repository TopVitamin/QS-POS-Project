import { h } from 'vue'
import { useMessage, useNotification } from 'naive-ui'
import { errorInfo } from '../composables/useRequest'

/** 管理端和收银端共用的结果提示。错误一律带规则依据，给店员看得懂的话 */
export function useFeedback() {
  const message = useMessage()
  const notification = useNotification()

  function fail(e: unknown, title?: string) {
    const info = errorInfo(e)
    notification.error({
      title: title ?? info.message,
      content: () =>
        h('div', { class: 'flex flex-col gap-1' }, [
          title ? h('div', info.message) : null,
          info.basis ? h('div', { class: 'text-12px text-t3 leading-18px' }, `依据：${info.basis}`) : null,
        ]),
      duration: 6000,
      keepAliveOnHover: true,
    })
  }

  function ok(title: string, detail?: string) {
    if (detail) notification.success({ title, content: detail, duration: 3500 })
    else message.success(title)
  }

  /** 执行一个写操作：成功提示、失败带依据提示，返回结果或 undefined */
  async function run<T>(task: () => Promise<T>, okText?: string | ((r: T) => string)): Promise<T | undefined> {
    try {
      const r = await task()
      if (okText) ok(typeof okText === 'function' ? okText(r) : okText)
      return r
    } catch (e) {
      fail(e)
      return undefined
    }
  }

  return { ok, fail, run, message, notification }
}
