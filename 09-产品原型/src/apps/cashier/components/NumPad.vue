<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'

/** 屏幕数字键盘：金额、整数、提货码。可选接管实体键盘 */
const props = withDefaults(
  defineProps<{
    modelValue: string
    mode?: 'money' | 'int' | 'code'
    maxLength?: number
    confirmText?: string
    confirmDisabled?: boolean
    keyboard?: boolean
    compact?: boolean
  }>(),
  { mode: 'money', keyboard: false },
)
const emit = defineEmits<{ 'update:modelValue': [v: string]; confirm: [] }>()

const bottom = computed(() => (props.mode === 'money' ? ['00', '0', '.'] : ['0']))
/** 确认键只有一列宽，四个字以上拆成两行，避免逐字折行 */
const confirmLines = computed(() => {
  const t = props.confirmText ?? ''
  if (t.length < 4) return [t]
  const half = Math.ceil(t.length / 2)
  return [t.slice(0, half), t.slice(half)]
})

function press(k: string) {
  let v = props.modelValue
  if (k === 'back') v = v.slice(0, -1)
  else if (k === 'clear') v = ''
  else if (k === '.') {
    if (props.mode !== 'money' || v.includes('.')) return
    v = `${v || '0'}.`
  } else {
    if (props.mode === 'money') {
      const [int, dec] = v.split('.')
      if (dec !== undefined && dec.length + k.length > 2) return
      if (dec === undefined && int.length >= 7) return
      if (v === '0') v = ''
      if (!v && k === '00') k = '0'
    }
    if (props.maxLength && v.length + k.length > props.maxLength) return
    v += k
  }
  emit('update:modelValue', v)
}

function onKey(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
  if (/^\d$/.test(e.key)) press(e.key)
  else if (e.key === '.') press('.')
  else if (e.key === 'Backspace') press('back')
  else if (e.key === 'Escape') press('clear')
  else if (e.key === 'Enter' && props.confirmText && !props.confirmDisabled) emit('confirm')
  else return
  e.preventDefault()
}

onMounted(() => props.keyboard && window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

const keyCls = computed(() =>
  [
    'pos-press qs-flex-center rounded-14px border border-line bg-white font-num font-600 text-t1 shadow-[0_1px_0_rgba(12,38,36,0.06)] hover:border-brand-300 active:bg-brand-50',
    props.compact ? 'h-52px text-24px' : 'h-62px text-28px',
  ].join(' '),
)
</script>

<template>
  <div class="grid grid-cols-4 gap-2.5">
    <template v-for="row in [['7', '8', '9'], ['4', '5', '6'], ['1', '2', '3']]" :key="row.join()">
      <button v-for="k in row" :key="k" type="button" :class="keyCls" @click="press(k)">{{ k }}</button>
      <button v-if="row[0] === '7'" type="button" :class="keyCls" aria-label="退格" @click="press('back')">
        <span class="i-ph-backspace-bold text-26px text-t2" />
      </button>
      <button v-else-if="row[0] === '4'" type="button" :class="[keyCls, '!text-17px !font-sans text-t2']" @click="press('clear')">清空</button>
      <button
        v-else-if="confirmText"
        type="button"
        class="pos-press row-span-2 rounded-14px bg-brand-600 px-1 text-20px font-700 leading-snug text-white shadow-card hover:bg-brand-500 disabled:cursor-not-allowed disabled:bg-[#A7B3B1]"
        :aria-label="confirmText"
        :disabled="confirmDisabled"
        @click="emit('confirm')"
      >
        <span v-for="(t, i) in confirmLines" :key="i" class="block">{{ t }}</span>
      </button>
      <div v-else class="row-span-2" />
    </template>
    <button
      v-for="k in bottom"
      :key="k"
      type="button"
      :class="[keyCls, bottom.length === 1 ? 'col-span-3' : '']"
      @click="press(k)"
    >
      {{ k }}
    </button>
  </div>
</template>
