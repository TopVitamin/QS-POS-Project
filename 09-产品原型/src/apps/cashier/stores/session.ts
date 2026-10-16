import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { can, type Perm } from '@/shared/config/permissions'
import type { SessionUser } from '@/shared/types'

const KEY = 'qs-pos-cashier-session'

interface Saved {
  storeId: string
  registerNo: string
  user: SessionUser | null
  shiftNo: string | null
}

function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as Saved
  } catch {
    /* 读不出来就用默认值 */
  }
  return { storeId: 's01', registerNo: '01', user: null, shiftNo: null }
}

/** 收银台会话：哪家店、哪台机、谁在用、当前班次。存在本机，刷新不丢 */
export const useSession = defineStore('cashier-session', () => {
  const saved = load()
  const storeId = ref(saved.storeId)
  const registerNo = ref(saved.registerNo)
  const user = ref<SessionUser | null>(saved.user)
  const shiftNo = ref<string | null>(saved.shiftNo)

  watch([storeId, registerNo, user, shiftNo], () => {
    const data: Saved = { storeId: storeId.value, registerNo: registerNo.value, user: user.value, shiftNo: shiftNo.value }
    localStorage.setItem(KEY, JSON.stringify(data))
  }, { deep: true })

  const has = (perm: Perm) => can(user.value, perm)
  /** 有收银职责的要开班才能收款；只有导购职责的只开单、挂单 */
  const isCashier = computed(() => has('payment.collect'))

  function signIn(u: SessionUser, shift: string | null) {
    user.value = u
    shiftNo.value = shift
  }

  function signOut() {
    user.value = null
    shiftNo.value = null
  }

  return { storeId, registerNo, user, shiftNo, has, isCashier, signIn, signOut }
})
