<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '@/shared/api'
import { useRequest } from '@/shared/composables/useRequest'
import { STOCKTAKE_STATUS } from '@/shared/config/labels'
import { shortDate, timeOf } from '@/shared/utils/time'
import BottomBar from '../components/BottomBar.vue'
import MAssumptionTag from '../components/MAssumptionTag.vue'
import MBillNo from '../components/MBillNo.vue'
import MPendingTag from '../components/MPendingTag.vue'
import MStatusTag from '../components/MStatusTag.vue'
import Note from '../components/Note.vue'
import Section from '../components/Section.vue'
import { alertFail, run, toastOk } from '../feedback'
import { useMobile } from '../stores/session'

const mobile = useMobile()
const route = useRoute()
const no = computed(() => String(route.params.no))
const { data, error } = useRequest(() => api.storeops.stocktake(no.value))
const st = computed(() => data.value?.stocktake)
const mine = computed(() => st.value?.storeId === mobile.storeId)
const counting = computed(() => st.value?.status === 'counting' && mine.value && mobile.has('stocktake.manage'))

/** 录入时只显示商品，不显示账面数；提交后按建单时的账面快照算差异 */
const input = ref<Record<string, string>>({})
watch(
  st,
  (s) => {
    if (!s) return
    for (const l of s.lines) if (input.value[l.sku] === undefined && l.countedQty !== null) input.value[l.sku] = String(l.countedQty)
  },
  { immediate: true },
)
const counts = () => Object.fromEntries((st.value?.lines ?? []).map((l) => [l.sku, input.value[l.sku] ? Number(input.value[l.sku]) : null]))
const entered = computed(() => (st.value?.lines ?? []).filter((l) => !!input.value[l.sku]).length)
const keyword = ref('')
const lines = computed(() => {
  const k = keyword.value.trim().toLowerCase()
  return (st.value?.lines ?? []).filter((l) => !k || l.name.toLowerCase().includes(k) || l.sku.toLowerCase().includes(k))
})

const busy = ref(false)
async function save() {
  busy.value = true
  await run(() => api.storeops.saveCounts({ no: no.value, counts: counts(), operatorJobNo: mobile.user!.jobNo }), '已保存，可以接着录')
  busy.value = false
}
async function submit() {
  busy.value = true
  try {
    await api.storeops.saveCounts({ no: no.value, counts: counts(), operatorJobNo: mobile.user!.jobNo })
    const r = await api.storeops.submitStocktake({ no: no.value, operatorJobNo: mobile.user!.jobNo })
    toastOk(r.diffs.length ? `已提交，${r.diffs.length}个商品有差异，等授权过账` : '已提交，账实相符')
  } catch (e) {
    alertFail(e)
  } finally {
    busy.value = false
  }
}

const showAuth = ref(false)
const auth = ref({ jobNo: '', pin: '' })
async function post() {
  busy.value = true
  const r = await run(
    () => api.storeops.postStocktake({ no: no.value, operatorJobNo: mobile.user!.jobNo, authorizer: auth.value }),
    (s) => `${mobile.nameOf(s.authorizerJobNo)}已授权，中枢按差异调账`,
  )
  busy.value = false
  if (r) {
    showAuth.value = false
    auth.value = { jobNo: '', pin: '' }
  }
}
</script>

<template>
  <div class="pb-4">
    <van-empty v-if="error" image="error" description="找不到这张盘点单" />
    <template v-else-if="st && data">
      <div class="mx-3 mt-3 rounded-14px bg-white px-4 py-3.5 shadow-card">
        <div class="flex items-center gap-2">
          <MBillNo :no="st.no" class="text-14px font-600" />
          <div class="flex-1" />
          <MStatusTag :def="STOCKTAKE_STATUS[st.status]" />
        </div>
        <div class="mt-1.5 flex flex-wrap gap-x-3 text-12px text-t2">
          <span>{{ st.scope === 'full' ? '全盘' : '抽盘' }} · {{ st.lines.length }}个商品</span>
          <span>{{ mobile.who(st.creatorJobNo) }} {{ shortDate(st.createdAt) }} {{ timeOf(st.createdAt) }}建单</span>
          <span v-if="st.joint" class="text-[#92400E]">加盟店共同盘点</span>
        </div>
      </div>

      <template v-if="counting">
        <Section title="逐个录入实盘数">
          <template #extra><span class="text-12px text-t3">已录 {{ entered }}/{{ st.lines.length }}</span></template>
          <van-search v-model="keyword" placeholder="找商品" shape="round" />
          <div v-for="l in lines" :key="l.sku" class="flex items-center gap-3 border-t border-line px-4 py-2.5">
            <div class="min-w-0 flex-1">
              <div class="truncate text-14px font-500">{{ l.name }}</div>
              <div class="truncate text-12px text-t3"><span class="font-mono">{{ l.sku }}</span> · {{ l.spec }}</div>
            </div>
            <input
              v-model="input[l.sku]"
              inputmode="numeric"
              placeholder="实盘"
              class="qs-num h-40px w-76px rounded-10px border border-line-strong bg-subtle px-2 text-center text-17px font-600 outline-none focus:border-brand-500"
              @input="input[l.sku] = (input[l.sku] ?? '').replace(/\D/g, '').slice(0, 4)"
            />
          </div>
        </Section>
        <Note>录入时不显示账面数，提交后按建单时的账面快照算差异。没盘完可以先保存</Note>
        <BottomBar>
          <div class="flex gap-2">
            <van-button class="!w-110px" round size="large" :disabled="busy" @click="save">保存</van-button>
            <van-button class="flex-1" round type="primary" size="large" :loading="busy" :disabled="entered < st.lines.length" @click="submit">
              {{ entered < st.lines.length ? `还差${st.lines.length - entered}个没录` : '提交，算差异' }}
            </van-button>
          </div>
        </BottomBar>
      </template>

      <template v-else-if="st.status !== 'counting'">
        <Section :title="data.diffs.length ? `${data.diffs.length}个商品有差异` : '账实相符'">
          <template v-if="data.diffs.length">
            <div class="grid grid-cols-[1fr_48px_48px_48px] gap-x-2 border-b border-line bg-subtle px-4 py-1.5 text-12px text-t3">
              <span>商品</span><span class="text-right">账面</span><span class="text-right">实盘</span><span class="text-right">差异</span>
            </div>
            <div v-for="d in data.diffs" :key="d.sku" class="grid grid-cols-[1fr_48px_48px_48px] items-center gap-x-2 border-b border-line px-4 py-2.5 text-13px last:border-0">
              <span class="truncate">{{ d.name }}</span>
              <span class="qs-num text-right">{{ d.bookQty }}</span>
              <span class="qs-num text-right font-600">{{ d.countedQty }}</span>
              <span class="qs-num text-right font-600" :class="d.diff < 0 ? 'text-bad' : 'text-ok'">{{ d.diff > 0 ? '+' : '' }}{{ d.diff }}</span>
            </div>
          </template>
          <div v-else class="px-4 pb-3 text-13px text-t2">{{ st.lines.length }}个商品的实盘数和账面快照一致</div>
          <div v-if="st.status === 'adjusted'" class="border-t border-line px-4 py-2.5 text-12px leading-19px text-t2">
            授权人 {{ mobile.who(st.authorizerJobNo) }} · {{ shortDate(st.authorizedAt) }} {{ timeOf(st.authorizedAt) }} · 中枢结果 <MBillNo :no="st.hubResultNo" plain />
          </div>
        </Section>
        <Note>
          <template v-if="st.status === 'submitted'">差异过账要授权人确认：授权人、时间和差异明细都留痕。授权前可用量不变。授权层级 <MPendingTag id="待确认-51" /> <MAssumptionTag k="authorizer" /></template>
          <template v-else>中枢已按差异调账，调整记在本店库存流水里。</template>
          <template v-if="st.joint">加盟店共同盘点只记事实，系统不自动生成赔偿金额 <MPendingTag id="待确认-23" /></template>
        </Note>
        <BottomBar v-if="st.status === 'submitted' && mine && mobile.has('stocktake.post') && data.diffs.length">
          <van-button block round type="primary" size="large" icon="shield-o" @click="showAuth = true">差异过账，找授权人确认</van-button>
        </BottomBar>
      </template>

      <template v-else>
        <Section title="盘点中">
          <div class="px-4 pb-3 text-13px text-t2">已录 {{ entered }}/{{ st.lines.length }}，由店长录入和提交</div>
        </Section>
      </template>
    </template>

    <van-popup v-model:show="showAuth" position="bottom" round closeable teleport="body">
      <div class="px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-5">
        <div class="text-17px font-700">差异过账授权</div>
        <div class="mt-1 text-12px leading-18px text-t3">本店店长或被授权的总部运营输入工号和PIN。演示PIN都是1234</div>
        <van-cell-group inset class="!mx-0 !mt-3 border border-line">
          <van-field v-model="auth.jobNo" label="授权人工号" placeholder="例如 QS1001" maxlength="10" />
          <van-field v-model="auth.pin" label="PIN" type="password" placeholder="4位PIN" maxlength="6" />
        </van-cell-group>
        <van-button block round type="primary" size="large" class="!mt-4" :loading="busy" :disabled="!auth.jobNo || !auth.pin" @click="post">确认过账</van-button>
      </div>
    </van-popup>
  </div>
</template>
