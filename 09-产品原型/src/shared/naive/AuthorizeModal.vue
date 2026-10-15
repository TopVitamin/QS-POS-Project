<script setup lang="ts">
import { ref, watch } from 'vue'
import { api } from '@/shared/api'
import { canAuthorizeFor } from '@/shared/config/permissions'
import { errorInfo, useRequest } from '@/shared/composables/useRequest'
import AssumptionTag from './AssumptionTag.vue'

export interface AuthorizeResult {
  jobNo: string
  pin: string
  name: string
  title: string
}

/**
 * 授权人确认：工号 + PIN，且有授权职责、门店在其数据范围内。
 * 传了 action 就在确认后执行，失败时错误留在弹窗里。
 */
const props = withDefaults(
  defineProps<{
    show: boolean
    storeId: string
    title?: string
    confirmText?: string
    action?: (cred: AuthorizeResult) => Promise<unknown>
    large?: boolean
  }>(),
  { title: '授权确认', confirmText: '确认授权' },
)
const emit = defineEmits<{ 'update:show': [value: boolean]; authorized: [cred: AuthorizeResult] }>()

const jobNo = ref('')
const pin = ref('')
const busy = ref(false)
const err = ref<{ message: string; basis?: string } | null>(null)

watch(
  () => props.show,
  (v) => {
    if (!v) return
    jobNo.value = ''
    pin.value = ''
    err.value = null
  },
)

const { data: people } = useRequest(
  async () => {
    const [emps, stores] = await Promise.all([api.master.employees(), api.master.stores()])
    return emps.filter((e) => canAuthorizeFor(e, props.storeId, stores))
  },
  { watch: [() => props.storeId], live: false },
)

async function confirm() {
  if (!jobNo.value.trim() || !pin.value) {
    err.value = { message: '请输入授权人工号和PIN' }
    return
  }
  busy.value = true
  err.value = null
  try {
    const who = await api.master.authorize({ jobNo: jobNo.value, pin: pin.value, storeId: props.storeId })
    const cred = { ...who, pin: pin.value }
    if (props.action) await props.action(cred)
    emit('authorized', cred)
    emit('update:show', false)
  } catch (e) {
    err.value = errorInfo(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <n-modal
    :show="show"
    preset="card"
    :title="title"
    :style="{ width: large ? '560px' : '460px' }"
    :mask-closable="!busy"
    :segmented="{ content: true, footer: 'soft' }"
    @update:show="(v: boolean) => emit('update:show', v)"
  >
    <div class="flex flex-col gap-4">
      <slot />
      <n-form-item label="授权人工号" :show-feedback="false" :size="large ? 'large' : 'medium'">
        <n-input v-model:value="jobNo" placeholder="例如 QS1001" clearable :input-props="{ autocomplete: 'off' }" @keyup.enter="confirm" />
      </n-form-item>
      <n-form-item label="PIN" :show-feedback="false" :size="large ? 'large' : 'medium'">
        <n-input
          v-model:value="pin"
          type="password"
          show-password-on="click"
          placeholder="演示PIN统一是1234"
          :maxlength="6"
          :input-props="{ inputmode: 'numeric', autocomplete: 'off' }"
          @keyup.enter="confirm"
        />
      </n-form-item>
      <div class="rounded-10px bg-subtle px-3 py-2.5 text-13px text-t2">
        <div class="mb-1.5 flex items-center gap-2">
          <span>可以授权的演示账号</span>
          <AssumptionTag k="authorizer" />
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="p in people ?? []"
            :key="p.jobNo"
            type="button"
            class="rounded-8px border border-line bg-white px-2.5 py-1 text-13px hover:border-brand-400 hover:text-brand-700"
            @click="jobNo = p.jobNo"
          >
            {{ p.jobNo }} {{ p.name }} · {{ p.title }}
          </button>
          <span v-if="people && !people.length" class="text-t3">这家店没有可授权的账号</span>
        </div>
      </div>
      <n-alert v-if="err" type="error" :show-icon="true" :bordered="false">
        <div class="font-600">{{ err.message }}</div>
        <div v-if="err.basis" class="mt-0.5 text-12px opacity-80">{{ err.basis }}</div>
      </n-alert>
    </div>
    <template #footer>
      <div class="flex justify-end gap-3">
        <n-button :size="large ? 'large' : 'medium'" :disabled="busy" @click="emit('update:show', false)">取消</n-button>
        <n-button type="primary" :size="large ? 'large' : 'medium'" :loading="busy" @click="confirm">{{ confirmText }}</n-button>
      </div>
    </template>
  </n-modal>
</template>
