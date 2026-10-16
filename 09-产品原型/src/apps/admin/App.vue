<script setup lang="ts">
import { dateZhCN, zhCN } from 'naive-ui'
import { createNaiveTheme } from '@/shared/theme/naive'

const theme = createNaiveTheme('admin')
</script>

<template>
  <n-config-provider :theme-overrides="theme" :locale="zhCN" :date-locale="dateZhCN">
    <n-notification-provider placement="top-right" :max="4">
      <n-message-provider placement="top" :duration="2400">
        <n-dialog-provider>
          <router-view />
        </n-dialog-provider>
      </n-message-provider>
    </n-notification-provider>
  </n-config-provider>
</template>
