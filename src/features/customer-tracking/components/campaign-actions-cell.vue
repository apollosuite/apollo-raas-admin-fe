<script setup lang="ts">
import { ChevronDown } from 'lucide-vue-next'

import type { Campaign } from '../types'

import { actionCn } from '../mock'

const props = defineProps<{
  campaign: Campaign
}>()

const router = useRouter()

const optItems = [...new Set([...props.campaign.managedBy, ...props.campaign.affectedBy])]
const launchItems = [props.campaign.launchedBy].filter(Boolean)

function go(action: string) {
  router.push(`/customer-tracking/performance/profile/${props.campaign.amazonProfileId}/schedules/${encodeURIComponent(action)}`)
}
</script>

<template>
  <UiDropdownMenu>
    <UiDropdownMenuTrigger as-child>
      <UiButton variant="outline" size="sm">
        Actions
        <ChevronDown data-icon="inline-end" />
      </UiButton>
    </UiDropdownMenuTrigger>
    <UiDropdownMenuContent align="end" class="w-44">
      <UiDropdownMenuLabel class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Optimization actions
      </UiDropdownMenuLabel>
      <UiDropdownMenuItem
        v-for="category in optItems"
        :key="category"
        @click="go(category)"
      >
        {{ actionCn[category] || category }}
      </UiDropdownMenuItem>
      <template v-if="launchItems.length">
        <UiDropdownMenuSeparator />
        <UiDropdownMenuLabel class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Campaign launch actions
        </UiDropdownMenuLabel>
        <UiDropdownMenuItem
          v-for="category in launchItems"
          :key="category"
          @click="go(category)"
        >
          {{ actionCn[category] || category }}
        </UiDropdownMenuItem>
      </template>
    </UiDropdownMenuContent>
  </UiDropdownMenu>
</template>
