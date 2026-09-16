<script setup lang="ts">
import { Plus, X } from 'lucide-vue-next'
import { computed, nextTick } from 'vue'

import type { ColumnFilter, ColumnSpec, FilterOperator } from '../types'

import {
  distinctValues,
  metricOptionsFor,
  operatorsFor,
  takesSecondValue,
  valueEditorFor,
} from '../filter-predicates'

/**
 * Filter chip builder.
 *
 * The chip used to be a label plus one free-text "contains" box for every column,
 * which meant numbers had to be typed unformatted and dates only matched as a
 * prefix. Now the column's declared type picks the operator list and the value
 * editor: a range for numbers, a date input for dates, a multi-select of the real
 * distinct values for enums.
 */
const props = defineProps<{
  columns: readonly ColumnSpec[]
  modelValue: ColumnFilter[]
  /** Unfiltered rows, used to derive the enum option lists. */
  rows?: any[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: ColumnFilter[]): void
}>()

const filteredKeys = computed(() => new Set(props.modelValue.map(f => f.key)))
const availableColumns = computed(() => props.columns.filter(([key]) => !filteredKeys.value.has(key)))

const specOf = (key: string) => props.columns.find(s => s[0] === key)
const typeOf = (key: string) => specOf(key)?.[2] ?? 'text'
const labelOf = (key: string) => specOf(key)?.[1] ?? key

const inputEls = new Map<string, HTMLInputElement>()

/**
 * UiInput is a component, so a template ref hands back the component instance
 * (its root element lives on $el), not the <input>. Storing the instance made
 * the focus-on-add call throw "focus is not a function".
 */
function setInputRef(key: string, el: unknown) {
  const root = (el as { $el?: unknown } | null)?.$el ?? el
  if (root instanceof HTMLInputElement)
    inputEls.set(key, root)
  else
    inputEls.delete(key)
}

function commit(next: ColumnFilter[]) {
  emit('update:modelValue', next)
}

function update(key: string, patch: Partial<ColumnFilter>) {
  commit(props.modelValue.map(f => (f.key === key ? { ...f, ...patch } : f)))
}

function addFilter(key: string) {
  if (filteredKeys.value.has(key))
    return
  const operator = operatorsFor(typeOf(key))[0].value
  commit([...props.modelValue, { key, operator, values: [''] }])
  nextTick(() => inputEls.get(key)?.focus())
}

function removeFilter(key: string) {
  commit(props.modelValue.filter(f => f.key !== key))
}

function clearAll() {
  commit([])
}

/** Switching operator can change the editor, so stale values are dropped. */
function setOperator(key: string, operator: FilterOperator) {
  update(key, { operator, values: takesSecondValue(operator) ? ['', ''] : [''] })
}

function onOperator(key: string, value: unknown) {
  setOperator(key, value as FilterOperator)
}

function setValue(key: string, index: number, value: string) {
  const current = props.modelValue.find(f => f.key === key)
  if (!current)
    return
  const values = [...current.values]
  values[index] = value
  update(key, { values })
}

function editorFor(filter: ColumnFilter) {
  const type = typeOf(filter.key)
  if ((type === 'enum' || type === 'connection') && (filter.operator === 'isAnyOf' || filter.operator === 'isNoneOf'))
    return 'enum'
  return valueEditorFor(type, filter.operator)
}

function inputType(filter: ColumnFilter): string {
  const editor = editorFor(filter)
  if (editor === 'date')
    return 'date'
  if (editor === 'number')
    return 'number'
  return 'text'
}

function placeholderFor(filter: ColumnFilter): string {
  const editor = editorFor(filter)
  if (editor === 'list')
    return 'a, b, c'
  if (editor === 'number')
    return 'value'
  if (editor === 'date')
    return 'yyyy-mm-dd'
  return 'contains...'
}

function enumOptions(filter: ColumnFilter): string[] {
  return distinctValues(props.rows ?? [], filter.key)
}

function toggleEnum(key: string, option: string) {
  const current = props.modelValue.find(f => f.key === key)
  if (!current)
    return
  const values = current.values.includes(option)
    ? current.values.filter(v => v !== option)
    : [...current.values, option]
  update(key, { values })
}

function enumSummary(filter: ColumnFilter): string {
  if (filter.values.length === 0)
    return 'select...'
  if (filter.values.length <= 2)
    return filter.values.join(', ')
  return `${filter.values.length} selected`
}

function metricOptions(filter: ColumnFilter) {
  return metricOptionsFor(typeOf(filter.key))
}

function metricValue(filter: ColumnFilter): string {
  return filter.series ?? filter.metric ?? 'total'
}

function setMetric(key: string, value: unknown) {
  const type = typeOf(key)
  if (type === 'split')
    update(key, { series: value as ColumnFilter['series'] })
  else
    update(key, { metric: value as ColumnFilter['metric'] })
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
      <!--
        .prevent on closeAutoFocus stops the menu from pulling focus back to the
        Filter button, so the newly added chip's value input can take it.
      -->
      <UiDropdownMenuContent align="start" class="max-h-72 overflow-y-auto" @close-auto-focus.prevent>
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
      <span class="whitespace-nowrap text-muted-foreground">{{ labelOf(f.key) }}</span>

      <UiSelect :model-value="f.operator" @update:model-value="(v: unknown) => onOperator(f.key, v)">
        <UiSelectTrigger class="h-6 w-auto gap-1 border-0 bg-transparent px-1 text-xs shadow-none">
          <UiSelectValue />
        </UiSelectTrigger>
        <UiSelectContent>
          <UiSelectItem v-for="op in operatorsFor(typeOf(f.key))" :key="op.value" :value="op.value">
            {{ op.label }}
          </UiSelectItem>
        </UiSelectContent>
      </UiSelect>

      <UiSelect
        v-if="metricOptions(f).length > 0"
        :model-value="metricValue(f)"
        @update:model-value="(v: unknown) => setMetric(f.key, v)"
      >
        <UiSelectTrigger class="h-6 w-auto gap-1 border-0 bg-transparent px-1 text-xs shadow-none">
          <UiSelectValue />
        </UiSelectTrigger>
        <UiSelectContent>
          <UiSelectItem v-for="opt in metricOptions(f)" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </UiSelectItem>
        </UiSelectContent>
      </UiSelect>

      <UiDropdownMenu v-if="editorFor(f) === 'enum'">
        <UiDropdownMenuTrigger as-child>
          <button
            type="button"
            class="max-w-40 truncate rounded px-1 text-sm text-foreground hover:bg-accent"
          >
            {{ enumSummary(f) }}
          </button>
        </UiDropdownMenuTrigger>
        <UiDropdownMenuContent align="start" class="max-h-72 overflow-y-auto">
          <UiDropdownMenuCheckboxItem
            v-for="option in enumOptions(f)"
            :key="option"
            :model-value="f.values.includes(option)"
            @update:model-value="() => toggleEnum(f.key, option)"
          >
            {{ option }}
          </UiDropdownMenuCheckboxItem>
          <div v-if="enumOptions(f).length === 0" class="px-2 py-1.5 text-sm text-muted-foreground">
            No values in the current data
          </div>
        </UiDropdownMenuContent>
      </UiDropdownMenu>

      <template v-else-if="editorFor(f) !== 'none'">
        <UiInput
          :ref="el => setInputRef(f.key, el)"
          :type="inputType(f)"
          :model-value="f.values[0] ?? ''"
          :placeholder="placeholderFor(f)"
          class="h-6 w-28 border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-0"
          @update:model-value="(v: string | number) => setValue(f.key, 0, String(v))"
        />
        <template v-if="takesSecondValue(f.operator)">
          <span class="text-muted-foreground">and</span>
          <UiInput
            :type="inputType(f)"
            :model-value="f.values[1] ?? ''"
            :placeholder="placeholderFor(f)"
            class="h-6 w-28 border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-0"
            @update:model-value="(v: string | number) => setValue(f.key, 1, String(v))"
          />
        </template>
      </template>

      <button
        type="button"
        class="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        aria-label="Remove filter"
        @click="removeFilter(f.key)"
      >
        <X class="size-3.5" />
      </button>
    </div>

    <UiButton v-if="modelValue.length > 0" variant="ghost" size="sm" @click="clearAll">
      Clear all ({{ modelValue.length }})
    </UiButton>
  </div>
</template>
