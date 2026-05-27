<script setup lang="ts">
import type { User } from './types'

const { user } = defineProps<
  { user: User }
>()
</script>

<template>
  <UiSidebarMenu>
    <UiSidebarMenuItem>
      <div class="flex items-center gap-2 rounded-md px-2 py-2 text-sm">
        <UiAvatar class="size-8 rounded-lg">
          <UiAvatarImage :src="user.avatar" :alt="user.name" />
          <UiAvatarFallback class="rounded-lg">
            CN
          </UiAvatarFallback>
        </UiAvatar>
        <div class="grid flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
          <span class="truncate font-semibold">{{ user.name }}</span>
          <span class="truncate text-xs text-muted-foreground">{{ user.email }}</span>
        </div>
      </div>
    </UiSidebarMenuItem>
  </UiSidebarMenu>
</template>
