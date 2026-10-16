<script setup lang="ts">
defineProps<{ title: string; desc?: string }>()
</script>

<template>
  <div class="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
    <div class="min-w-0">
      <div class="flex flex-wrap items-center gap-2">
        <h1 class="m-0 text-20px font-700 leading-28px text-t1">{{ title }}</h1>
        <slot name="tags" />
      </div>
      <div v-if="desc || $slots.desc" class="mt-1 text-13px leading-20px text-t2">
        <slot name="desc">{{ desc }}</slot>
      </div>
    </div>
    <div v-if="$slots.actions" class="flex shrink-0 items-center gap-2">
      <slot name="actions" />
    </div>
  </div>
</template>
