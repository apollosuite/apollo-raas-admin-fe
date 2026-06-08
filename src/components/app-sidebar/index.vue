<script lang="ts" setup>
import { useAuthStore } from '@/stores/auth'

import { sidebarData } from './data/sidebar-data'
import NavFooter from './nav-footer.vue'
import NavTeam from './nav-team.vue'

const authStore = useAuthStore()
const sidebarUser = computed(() => ({
  name: authStore.name || authStore.username || sidebarData.user.name,
  email: authStore.email || (authStore.authType === 'feishu' ? 'Feishu account' : sidebarData.user.email),
  avatar: authStore.avatarUrl || sidebarData.user.avatar,
}))
</script>

<template>
  <UiSidebar collapsible="icon" class="z-50">
    <UiSidebarHeader>
      <div class="flex items-center gap-2 px-2 py-4">
        <div class="flex items-center justify-center rounded-lg aspect-square size-8 bg-sidebar-primary text-sidebar-primary-foreground">
          <span class="text-lg font-bold">A</span>
        </div>
        <div class="grid flex-1 text-sm leading-tight text-left">
          <span class="font-semibold truncate">Apollo Admin</span>
          <span class="text-xs truncate">Dashboard</span>
        </div>
      </div>
    </UiSidebarHeader>

    <UiSidebarContent>
      <NavTeam :nav-main="sidebarData.navMain" />
    </UiSidebarContent>

    <UiSidebarFooter>
      <NavFooter :user="sidebarUser" />
    </UiSidebarFooter>

    <UiSidebarRail />
  </UiSidebar>
</template>
