<script setup lang="ts">
import { actionCn, launchActions, optActions } from '../mock'

const router = useRouter()

function go(to: string) {
  router.push(`/customer-tracking/${to}`)
}
</script>

<template>
  <UiDropdownMenu>
    <UiDropdownMenuTrigger as-child>
      <button class="rounded border border-[#e2e8f0] bg-white px-2.5 py-1.5 text-sm text-[#64748b] transition-colors hover:bg-[#f8fafc]">
        Actions ▾
      </button>
    </UiDropdownMenuTrigger>
    <UiDropdownMenuContent align="end" class="w-44 border-[#e2e8f0] bg-white text-[#1e293b] shadow-sm">
      <UiDropdownMenuLabel class="px-2 py-1 text-xs font-medium uppercase tracking-wide text-[#94a3b8]">
        Optimization actions
      </UiDropdownMenuLabel>
      <UiDropdownMenuItem
        v-for="category in optActions"
        :key="category"
        class="px-2 py-1.5 text-sm text-[#1e293b] hover:bg-[#f8fafc] focus:bg-[#f8fafc] focus:text-[#1e293b]"
        @click="go(`performance/schedules/${encodeURIComponent(category)}`)"
      >
        {{ actionCn[category] }}
      </UiDropdownMenuItem>
      <UiDropdownMenuSeparator class="bg-[#e2e8f0]" />
      <UiDropdownMenuLabel class="px-2 py-1 text-xs font-medium uppercase tracking-wide text-[#94a3b8]">
        Campaign launch actions
      </UiDropdownMenuLabel>
      <UiDropdownMenuItem
        v-for="category in launchActions"
        :key="category"
        class="px-2 py-1.5 text-sm text-[#1e293b] hover:bg-[#f8fafc] focus:bg-[#f8fafc] focus:text-[#1e293b]"
        @click="go(`performance/schedules/${encodeURIComponent(category)}`)"
      >
        {{ actionCn[category] }}
      </UiDropdownMenuItem>
    </UiDropdownMenuContent>
  </UiDropdownMenu>
</template>
