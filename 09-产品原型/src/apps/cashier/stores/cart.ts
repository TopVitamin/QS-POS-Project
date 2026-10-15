import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import type { CartLineDraft, SaleDraft } from '@/shared/api'
import type { Member, PriceAdjustment, SessionUser } from '@/shared/types'
import { uid } from '@/shared/utils/random'
import { nowText } from '@/shared/utils/time'

const KEY = 'qs-pos-cashier-cart'

export interface HeldOrder {
  id: string
  storeId: string
  registerNo: string
  heldAt: string
  heldBy: string
  heldByName: string
  lines: CartLineDraft[]
  guideJobNo: string
  member: Member | null
  couponId: string | null
}

/** 被拒的核销或可用不足时带去代客下单的商品 */
export interface AgentPrefill {
  items: { sku: string; qty: number }[]
  source: 'cashier' | 'pickup_rejected'
  sourceRef?: string
  reason: string
}

interface Saved {
  storeId: string
  lines: CartLineDraft[]
  nextLineNo: number
  guideJobNo: string
  member: Member | null
  couponId: string | null
  adjustments: PriceAdjustment[]
  held: HeldOrder[]
  checkoutId: string | null
  agentPrefill: AgentPrefill | null
}

const empty = (storeId = 's01'): Saved => ({
  storeId,
  lines: [],
  nextLineNo: 1,
  guideJobNo: '',
  member: null,
  couponId: null,
  adjustments: [],
  held: [],
  checkoutId: null,
  agentPrefill: null,
})

function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...empty(), ...(JSON.parse(raw) as Saved) }
  } catch {
    /* 用空购物车 */
  }
  return empty()
}

/**
 * 购物车、挂单和进行中的结算。改价是按行金额授权的，购物车一变（加减商品、换会员、换券），
 * 已授权的改价就不再对应原来的金额，所以全部清掉，要重新授权。
 */
export const useCart = defineStore('cashier-cart', () => {
  const s = ref<Saved>(load())
  watch(s, (v) => localStorage.setItem(KEY, JSON.stringify(v)), { deep: true })

  const lines = computed(() => s.value.lines)
  const count = computed(() => s.value.lines.reduce((n, l) => n + l.qty, 0))
  const isEmpty = computed(() => s.value.lines.length === 0)

  /** 返回 true 表示清掉了已授权的改价，页面要提示 */
  function dropAdjustments(): boolean {
    if (!s.value.adjustments.length) return false
    s.value.adjustments = []
    return true
  }

  function bindStore(storeId: string) {
    if (s.value.storeId === storeId) return
    s.value = { ...empty(storeId), held: s.value.held }
  }

  function add(sku: string, snRequired: boolean, guideJobNo: string): boolean {
    const line = s.value.lines.find((l) => l.sku === sku)
    if (line) {
      line.qty += 1
      if (snRequired) line.sns.push('')
    } else {
      s.value.lines.push({ lineNo: s.value.nextLineNo++, sku, qty: 1, sns: snRequired ? [''] : [], guideJobNo: guideJobNo || s.value.guideJobNo })
    }
    return dropAdjustments()
  }

  function setQty(lineNo: number, qty: number): boolean {
    const line = s.value.lines.find((l) => l.lineNo === lineNo)
    if (!line) return false
    if (qty <= 0) return remove(lineNo)
    // 需采集SN的行逐件一个序列号，数量变了跟着增减
    if (line.sns.length) line.sns = Array.from({ length: qty }, (_, i) => line.sns[i] ?? '')
    line.qty = qty
    return dropAdjustments()
  }

  function remove(lineNo: number): boolean {
    s.value.lines = s.value.lines.filter((l) => l.lineNo !== lineNo)
    return dropAdjustments()
  }

  function setSns(lineNo: number, sns: string[]) {
    const line = s.value.lines.find((l) => l.lineNo === lineNo)
    if (line) line.sns = sns.map((x) => x.trim())
  }

  function setLineGuide(lineNo: number, jobNo: string) {
    const line = s.value.lines.find((l) => l.lineNo === lineNo)
    if (line) line.guideJobNo = jobNo
  }

  /** 单头导购：同时改所有行，个别行可以再单独改 */
  function setGuide(jobNo: string) {
    s.value.guideJobNo = jobNo
    s.value.lines.forEach((l) => (l.guideJobNo = jobNo))
  }

  function setMember(m: Member | null): boolean {
    s.value.member = m
    s.value.couponId = null
    return dropAdjustments()
  }

  function setCoupon(id: string | null): boolean {
    s.value.couponId = id
    return dropAdjustments()
  }

  function setAdjustment(a: PriceAdjustment) {
    s.value.adjustments = [...s.value.adjustments.filter((x) => x.lineNo !== a.lineNo), a]
  }

  function removeAdjustment(lineNo: number) {
    s.value.adjustments = s.value.adjustments.filter((x) => x.lineNo !== lineNo)
  }

  function clear() {
    const keep = { held: s.value.held, storeId: s.value.storeId, guideJobNo: s.value.guideJobNo, agentPrefill: s.value.agentPrefill }
    s.value = { ...empty(keep.storeId), ...keep }
  }

  /** 挂单不保留改价：取单时金额可能已变，要重新授权 */
  function hold(registerNo: string, by: SessionUser) {
    if (isEmpty.value) return
    s.value.held.unshift({
      id: uid('hold'),
      storeId: s.value.storeId,
      registerNo,
      heldAt: nowText(),
      heldBy: by.jobNo,
      heldByName: by.name,
      lines: s.value.lines.map((l) => ({ ...l, sns: [...l.sns] })),
      guideJobNo: s.value.guideJobNo,
      member: s.value.member,
      couponId: s.value.couponId,
    })
    clear()
  }

  function resume(id: string, registerNo: string, by: SessionUser) {
    const h = s.value.held.find((x) => x.id === id)
    if (!h) return
    if (!isEmpty.value) hold(registerNo, by)
    s.value.held = s.value.held.filter((x) => x.id !== id)
    s.value.lines = h.lines
    s.value.nextLineNo = Math.max(0, ...h.lines.map((l) => l.lineNo)) + 1
    s.value.guideJobNo = h.guideJobNo
    s.value.member = h.member
    s.value.couponId = h.couponId
    s.value.adjustments = []
  }

  function dropHeld(id: string) {
    s.value.held = s.value.held.filter((x) => x.id !== id)
  }

  const heldHere = computed(() => s.value.held.filter((h) => h.storeId === s.value.storeId))

  function toDraft(ctx: { storeId: string; registerNo: string; shiftNo: string; cashierJobNo: string }): SaleDraft {
    return {
      ...ctx,
      guideJobNo: s.value.guideJobNo || s.value.lines[0]?.guideJobNo || '',
      memberId: s.value.member?.id,
      couponId: s.value.couponId ?? undefined,
      lines: s.value.lines.map((l) => ({ ...l, sns: [...l.sns] })),
      adjustments: s.value.adjustments,
    }
  }

  function setCheckout(id: string | null) {
    s.value.checkoutId = id
  }

  function setAgentPrefill(p: AgentPrefill | null) {
    s.value.agentPrefill = p
  }

  return {
    s,
    lines,
    count,
    isEmpty,
    heldHere,
    bindStore,
    add,
    setQty,
    remove,
    setSns,
    setLineGuide,
    setGuide,
    setMember,
    setCoupon,
    setAdjustment,
    removeAdjustment,
    clear,
    hold,
    resume,
    dropHeld,
    toDraft,
    setCheckout,
    setAgentPrefill,
  }
})
