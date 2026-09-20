<script setup lang="ts">
import { useCookies } from '@vueuse/integrations/useCookies'

import AppSidebar from '@/components/app-sidebar/index.vue'
import { SIDEBAR_COOKIE_NAME } from '@/components/ui/sidebar/utils'

const defaultOpen = useCookies([SIDEBAR_COOKIE_NAME])
</script>

<template>
  <UiSidebarProvider :default-open="defaultOpen.get(SIDEBAR_COOKIE_NAME)">
    <AppSidebar />
    <UiSidebarInset class="w-full max-w-full">
      <router-view />
    </UiSidebarInset>
  </UiSidebarProvider>
</template>
