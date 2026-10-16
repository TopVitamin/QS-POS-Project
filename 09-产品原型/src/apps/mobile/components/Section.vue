<script setup lang="ts">
defineProps<{ title?: string; desc?: string }>()
</script>

<template>
  <section class="mx-3 mt-3 overflow-hidden rounded-14px bg-white shadow-card">
    <div v-if="title || $slots.extra" class="flex items-center justify-between gap-2 px-4 pb-1 pt-3.5">
      <span class="text-15px font-600">{{ title }}</span>
      <slot name="extra" />
    </div>
    <div v-if="desc" class="px-4 pb-1 text-12px leading-18px text-t3">{{ desc }}</div>
    <slot />
  </section>
</template>
