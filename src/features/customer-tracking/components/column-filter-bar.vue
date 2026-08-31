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
        <button
          class="inline-flex items-center gap-1 rounded border border-[#e2e8f0] bg-white px-2.5 py-1.5 text-sm text-[#64748b] transition-colors hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="availableColumns.length === 0"
          aria-label="Add filter"
        >
          <Plus class="size-3.5" />
          Filter
        </button>
      </UiDropdownMenuTrigger>
      <UiDropdownMenuContent align="start" class="max-h-72 overflow-y-auto bg-white border-[#e2e8f0] shadow-sm">
        <UiDropdownMenuItem
          v-for="[key, label] in availableColumns"
          :key="key"
          class="px-2 py-1.5 text-sm text-[#1e293b] hover:bg-[#f8fafc] focus:bg-[#f8fafc] focus:text-[#1e293b]"
          @click="addFilter(key)"
        >
          {{ label }}
        </UiDropdownMenuItem>
        <div v-if="availableColumns.length === 0" class="px-2 py-1.5 text-sm text-[#94a3b8]">
          All columns are already filtered
        </div>
      </UiDropdownMenuContent>
    </UiDropdownMenu>

    <div
      v-for="f in modelValue"
      :key="f.key"
      class="inline-flex items-center gap-1 rounded border border-[#e2e8f0] bg-white py-1 pl-2.5 pr-1 text-sm"
    >
      <span class="text-[#64748b]">{{ labelOf(f.key) }}</span>
      <input
        :ref="el => setInputRef(f.key, el)"
        :value="f.value"
        class="w-28 bg-transparent px-1 text-sm text-[#1e293b] outline-none placeholder:text-[#94a3b8]"
        placeholder="contains…"
        @input="setValue(f.key, ($event.target as HTMLInputElement).value)"
      >
      <button
        class="rounded p-0.5 text-[#94a3b8] transition-colors hover:bg-[#f8fafc] hover:text-[#1e293b]"
        aria-label="Remove filter"
        @click="removeFilter(f.key)"
      >
        <X class="size-3.5" />
      </button>
    </div>
  </div>
</template>
