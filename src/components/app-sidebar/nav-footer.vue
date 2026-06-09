<script setup lang="ts">
import { ChevronsUpDown, LogOut } from 'lucide-vue-next'

import { useAuth } from '@/composables/use-auth'

import type { User } from './types'

const { user } = defineProps<
  { user: User }
>()

const { logout } = useAuth()

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
      <UiDropdownMenu>
        <UiDropdownMenuTrigger as-child>
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:bg-sidebar-accent focus-visible:text-sidebar-accent-foreground"
          >
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
            <ChevronsUpDown class="ml-auto size-4 text-muted-foreground group-data-[collapsible=icon]:hidden" />
          </button>
        </UiDropdownMenuTrigger>
        <UiDropdownMenuContent side="right" align="end" class="w-56">
          <UiDropdownMenuLabel class="font-normal">
            <div class="flex flex-col gap-1">
              <p class="truncate text-sm font-medium leading-none">
                {{ user.name }}
              </p>
              <p class="truncate text-xs leading-none text-muted-foreground">
                {{ user.email }}
              </p>
            </div>
          </UiDropdownMenuLabel>
          <UiDropdownMenuSeparator />
          <UiDropdownMenuItem class="text-destructive focus:text-destructive" @click="logout">
            <LogOut class="mr-2 size-4" />
            <span>Log out</span>
          </UiDropdownMenuItem>
        </UiDropdownMenuContent>
      </UiDropdownMenu>
    </UiSidebarMenuItem>
  </UiSidebarMenu>
</template>
