import { h, type VNodeChild } from 'vue'
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import { NTag } from 'naive-ui'
import MoneyText from '@/shared/components/MoneyText.vue'
import { STORE_MODE, type LabelDef } from '@/shared/config/labels'
import BillNo from '@/shared/naive/BillNo.vue'
import StatusTag from '@/shared/naive/StatusTag.vue'
import type { StoreMode } from '@/shared/types'

/** n-data-table 列渲染的小工具，保证各页的金额、单号、状态长得一样 */

type MoneyOpts = { tone?: 'default' | 'promo' | 'ok' | 'bad' | 'muted' | 'brand'; strong?: boolean; discount?: boolean; sign?: boolean; unit?: boolean }

export const money = (value: number | null | undefined, opts: MoneyOpts = {}) => h(MoneyText, { value, ...opts })

export const bill = (no?: string | null, plain = false) => h(BillNo, { no, plain })

export const status = (def?: LabelDef | null) => h(StatusTag, { def })

export const muted = (text: string) => h('span', { class: 'text-t3' }, text)

export const mono = (text?: string | null) => (text ? h('span', { class: 'font-mono text-12.5px' }, text) : muted('-'))

export const num = (n: number | null | undefined) => h('span', { class: 'qs-num' }, n === null || n === undefined ? '-' : String(n))

export const dateTime = (text?: string | null) =>
  text ? h('span', { class: 'qs-num whitespace-nowrap' }, [h('span', { class: 'text-t3' }, `${text.slice(0, 10)} `), text.slice(11, 19)]) : muted('-')

export const link = (to: RouteLocationRaw, child: VNodeChild) =>
  h(RouterLink, { to, class: 'text-brand-700 hover:underline', onClick: (e: MouseEvent) => e.stopPropagation() }, () => child)

export const modeTag = (mode: StoreMode) => h(NTag, { size: 'small', bordered: false, type: STORE_MODE[mode].tone }, () => STORE_MODE[mode].label)

/** 主文字加一行小字 */
export const two = (main: VNodeChild, sub?: VNodeChild) =>
  h('div', { class: 'leading-tight' }, [h('div', null, [main]), sub ? h('div', { class: 'mt-0.5 text-12px text-t3' }, [sub]) : null])

/** 行点击打开详情 */
export const clickable = <T>(open: (row: T) => void) => (row: T) => ({ style: 'cursor: pointer', onClick: () => open(row) })

export const pagination = { pageSize: 15, showSizePicker: false }
