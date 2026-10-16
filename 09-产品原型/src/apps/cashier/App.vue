<script setup lang="ts">
import { dateZhCN, zhCN } from 'naive-ui'
import { createNaiveTheme } from '@/shared/theme/naive'

const theme = createNaiveTheme('cashier')
</script>

<template>
  <n-config-provider :theme-overrides="theme" :locale="zhCN" :date-locale="dateZhCN" class="h-full">
    <n-notification-provider placement="top" :max="3">
      <n-message-provider placement="top" :duration="2200">
        <n-dialog-provider>
          <router-view />
        </n-dialog-provider>
      </n-message-provider>
    </n-notification-provider>
  </n-config-provider>
</template>
