import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { api } from '@/shared/api'
import { useRequest } from '@/shared/composables/useRequest'
import { can, canEnter, type Perm } from '@/shared/config/permissions'
import { codeName } from '@/shared/utils/format'

const KEY = 'qs-pos-mobile-identity'
const DEFAULT_JOB_NO = 'QS1001'

/** 移动端的演示身份：店长和导购用手机做店务。演示账号都只授权一家店，就按这家店工作 */
export const useMobile = defineStore('mobile-session', () => {
  const jobNo = ref(localStorage.getItem(KEY) || DEFAULT_JOB_NO)
  watch(jobNo, (v) => localStorage.setItem(KEY, v))

  const { data: employees } = useRequest(() => api.master.employees())
  const { data: stores } = useRequest(() => api.master.stores())
  const ready = computed(() => !!employees.value && !!stores.value)

  const accounts = computed(() => (employees.value ?? []).filter((e) => e.active && canEnter(e, 'mobile')))
  const user = computed(() => accounts.value.find((e) => e.jobNo === jobNo.value) ?? accounts.value.find((e) => e.jobNo === DEFAULT_JOB_NO) ?? null)
  const store = computed(() => stores.value?.find((s) => s.id === user.value?.storeIds[0]) ?? null)
  const storeId = computed(() => store.value?.id ?? '')
  const storeText = computed(() => (store.value ? codeName(store.value.code, store.value.name) : '-'))
  const guides = computed(() => (employees.value ?? []).filter((e) => e.active && e.duties.includes('guide') && e.storeIds.includes(storeId.value)))

  const has = (perm: Perm) => can(user.value, perm)
  const nameOf = (no?: string | null) => (no ? (employees.value?.find((e) => e.jobNo === no)?.name ?? no) : '-')
  const who = (no?: string | null) => (no ? `${no} ${employees.value?.find((e) => e.jobNo === no)?.name ?? ''}`.trim() : '-')
  const storeName = (id: string) => stores.value?.find((s) => s.id === id)?.name ?? id

  function switchTo(no: string) {
    jobNo.value = no
  }

  return { jobNo, employees, stores, ready, accounts, user, store, storeId, storeText, guides, has, nameOf, who, storeName, switchTo }
})
