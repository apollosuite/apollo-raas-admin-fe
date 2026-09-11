<script setup lang="ts">
import { parseDate } from '@internationalized/date'
import dayjs from 'dayjs'
import { Calendar as CalendarIcon } from 'lucide-vue-next'
import { computed } from 'vue'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { RangeCalendar } from '@/components/ui/range-calendar'

import type { DateRange } from '../filter-context'

const props = defineProps<{ modelValue: DateRange }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: DateRange): void }>()

const presets = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
]

const rangeValue = computed(() => ({
  start: parseDate(props.modelValue.from),
  end: parseDate(props.modelValue.to),
}))

function onRangeChange(value: { start?: { toString: () => string } | null, end?: { toString: () => string } | null }) {
  if (value?.start && value?.end)
    emit('update:modelValue', { from: String(value.start), to: String(value.end) })
}

function applyPreset(days: number) {
  emit('update:modelValue', {
    from: dayjs().subtract(days - 1, 'day').format('YYYY-MM-DD'),
    to: dayjs().format('YYYY-MM-DD'),
  })
}
</script>

<template>
  <Popover>
    <PopoverTrigger as-child>
      <Button variant="outline" class="h-9 w-[220px] justify-start gap-2 text-left font-normal">
        <CalendarIcon class="text-muted-foreground size-4" />
        <span class="truncate">{{ modelValue.from }} → {{ modelValue.to }}</span>
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" class="w-auto p-0">
      <div class="flex flex-col gap-2 p-3">
        <div class="flex items-center gap-1">
          <Button
            v-for="p in presets"
            :key="p.label"
            variant="ghost"
            size="sm"
            @click="applyPreset(p.days)"
          >
            {{ p.label }}
          </Button>
        </div>
        <RangeCalendar :model-value="rangeValue" class="rounded-md border" @update:model-value="onRangeChange" />
      </div>
    </PopoverContent>
  </Popover>
</template>
