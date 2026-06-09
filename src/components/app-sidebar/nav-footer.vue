<script setup lang="ts">
import type { User } from './types'

const { user } = defineProps<
  { user: User }
>()

const initials = computed(() => {
  const parts = user.name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) {
    return 'A'
  }
  return parts.slice(0, 2).map(part => part[0]).join('').toUpperCase()
})
</script>

<template>
  <UiSidebarMenu>
    <UiSidebarMenuItem>
      <div class="flex items-center gap-2 rounded-md px-2 py-2 text-sm">
        <UiAvatar class="size-8 rounded-lg">
          <UiAvatarImage :src="user.avatar" :alt="user.name" />
          <UiAvatarFallback class="rounded-lg">
            {{ initials }}
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
