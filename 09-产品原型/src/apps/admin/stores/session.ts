import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { api } from '@/shared/api'
import { useRequest } from '@/shared/composables/useRequest'
import { can, canEnter, scopeFranchiseeIds, scopeStoreIds, type Perm } from '@/shared/config/permissions'
import { codeName } from '@/shared/utils/format'

const KEY = 'qs-pos-admin-identity'
const DEFAULT_JOB_NO = 'QS9001'

/**
 * 管理端的演示身份。切换身份就是换一个登录账号，菜单、数据范围和按钮跟着变。
 * 主数据（门店、员工、加盟商）放在这里，各页共用一份。
 */
export const useAdmin = defineStore('admin-session', () => {
  const jobNo = ref(localStorage.getItem(KEY) || DEFAULT_JOB_NO)
  watch(jobNo, (v) => localStorage.setItem(KEY, v))

  const { data: employees } = useRequest(() => api.master.employees())
  const { data: stores } = useRequest(() => api.master.stores())
  const { data: franchisees } = useRequest(() => api.master.franchisees())
  const ready = computed(() => !!employees.value && !!stores.value && !!franchisees.value)

  /** 只有导购、收银职责的账号用收银端和移动端，不进管理端 */
  const accounts = computed(() => (employees.value ?? []).filter((e) => e.active && canEnter(e, 'admin')))
  const user = computed(() => accounts.value.find((e) => e.jobNo === jobNo.value) ?? accounts.value.find((e) => e.jobNo === DEFAULT_JOB_NO) ?? null)
  const has = (perm: Perm) => can(user.value, perm)

  const storeIds = computed(() => scopeStoreIds(user.value, stores.value ?? []))
  const scopedStores = computed(() => (stores.value ?? []).filter((s) => storeIds.value.includes(s.id)))
  const franchiseeIds = computed(() => scopeFranchiseeIds(user.value, franchisees.value ?? []))
  const scopedFranchisees = computed(() => (franchisees.value ?? []).filter((f) => franchiseeIds.value.includes(f.id)))
  /** 应缴和结算按加盟商授权，财务的到店范围里没有加盟店，所以单独列 */
  const franchiseStores = computed(() => (stores.value ?? []).filter((s) => !!s.franchiseeId && franchiseeIds.value.includes(s.franchiseeId)))
  const isSysAdmin = computed(() => !!user.value?.duties.includes('sysAdmin'))

  const storeById = (id: string) => stores.value?.find((s) => s.id === id)
  const storeText = (id: string) => {
    const s = storeById(id)
    return s ? codeName(s.code, s.name) : id
  }
  const nameOf = (no?: string | null) => (no ? employees.value?.find((e) => e.jobNo === no)?.name : undefined)
  const who = (no?: string | null) => (no ? `${no} ${nameOf(no) ?? ''}`.trim() : '-')
  const franchiseeText = (id?: string | null) => {
    const f = franchisees.value?.find((x) => x.id === id)
    return f ? codeName(f.code, f.name) : '-'
  }

  function switchTo(no: string) {
    jobNo.value = no
  }

  return {
    jobNo,
    employees,
    stores,
    franchisees,
    ready,
    accounts,
    user,
    has,
    storeIds,
    scopedStores,
    franchiseeIds,
    scopedFranchisees,
    franchiseStores,
    isSysAdmin,
    storeById,
    storeText,
    nameOf,
    who,
    franchiseeText,
    switchTo,
  }
})
