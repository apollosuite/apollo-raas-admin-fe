<script setup lang="ts">
import { Plus, X } from 'lucide-vue-next'
import { computed, nextTick } from 'vue'

import type { ColumnFilter } from '../types'

const props = defineProps<{
  columns: string[][]
  modelValue: ColumnFilter[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: ColumnFilter[]): void
}>()

const filteredKeys = computed(() => new Set(props.modelValue.map(f => f.key)))
const availableColumns = computed(() => props.columns.filter(([key]) => !filteredKeys.value.has(key)))

const inputEls = new Map<string, HTMLInputElement>()

function setInputRef(key: string, el: unknown) {
  if (el)
    inputEls.set(key, el as HTMLInputElement)
  else
    inputEls.delete(key)
}

function addFilter(key: string) {
  if (filteredKeys.value.has(key))
    return
  emit('update:modelValue', [...props.modelValue, { key, value: '' }])
  nextTick(() => inputEls.get(key)?.focus())
}

function removeFilter(key: string) {
  emit('update:modelValue', props.modelValue.filter(f => f.key !== key))
}

function setValue(key: string, value: string) {
  emit('update:modelValue', props.modelValue.map(f => (f.key === key ? { ...f, value } : f)))
}

function labelOf(key: string) {
  return props.columns.find(([k]) => k === key)?.[1] ?? key
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <UiDropdownMenu>
      <UiDropdownMenuTrigger as-child>
        <UiButton variant="outline" size="sm" :disabled="availableColumns.length === 0">
          <Plus data-icon="inline-start" />
          Filter
        </UiButton>
      </UiDropdownMenuTrigger>
      <UiDropdownMenuContent align="start" class="max-h-72 overflow-y-auto">
        <UiDropdownMenuItem
          v-for="[key, label] in availableColumns"
          :key="key"
          @click="addFilter(key)"
        >
          {{ label }}
        </UiDropdownMenuItem>
        <div v-if="availableColumns.length === 0" class="px-2 py-1.5 text-sm text-muted-foreground">
          All columns are already filtered
        </div>
      </UiDropdownMenuContent>
    </UiDropdownMenu>

    <div
      v-for="f in modelValue"
      :key="f.key"
      class="inline-flex items-center gap-1 rounded-md border bg-card py-1 pl-2.5 pr-1 text-sm"
    >
      <span class="text-muted-foreground">{{ labelOf(f.key) }}</span>
      <input
        :ref="el => setInputRef(f.key, el)"
        :value="f.value"
        class="w-28 bg-transparent px-1 text-sm text-foreground outline-none placeholder:text-muted-foreground"
        placeholder="contains…"
        @input="setValue(f.key, ($event.target as HTMLInputElement).value)"
      >
      <button
        class="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        aria-label="Remove filter"
        @click="removeFilter(f.key)"
      >
        <X class="size-3.5" />
      </button>
    </div>
  </div>
</template>
