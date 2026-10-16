<script setup lang="ts">
import { vantThemeVars } from '@/shared/theme/vant'
</script>

<template>
  <!-- global：弹窗、轻提示挂在 body 上，也要拿到主题色 -->
  <van-config-provider :theme-vars="vantThemeVars" theme-vars-scope="global">
    <router-view />
  </van-config-provider>
</template>
