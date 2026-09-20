<script setup lang="ts">
import { Construction } from 'lucide-vue-next'

import { BasicPage } from '@/components/global-layout'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'

defineProps<{ title: string, description: string }>()
</script>

<template>
  <BasicPage :title="title" :description="description">
    <Empty class="min-h-[60vh] border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Construction />
        </EmptyMedia>
        <EmptyTitle>{{ title }} is coming soon</EmptyTitle>
        <EmptyDescription>{{ description }}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  </BasicPage>
</template>
