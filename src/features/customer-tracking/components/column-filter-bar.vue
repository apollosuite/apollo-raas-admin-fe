<script setup lang="ts">
import { Plus, X } from 'lucide-vue-next'
import { computed, nextTick, ref, watch } from 'vue'

import type { ColumnFilter, ColumnSpec, FilterOperator } from '../types'

import {
  distinctValues,
  MAX_OPTION_VALUES,
  metricOptionsFor,
  operatorsFor,
  supportsValueOptions,
  takesSecondValue,
  valueEditorFor,
} from '../filter-predicates'

/**
 * Filter chip builder.
 *
 * The chip used to be a label plus one free-text "contains" box for every column,
 * which meant numbers had to be typed unformatted and dates only matched as a
 * prefix. Now the column's declared type picks the operator list and the value
 * editor: a range for numbers, a date input for dates.
 *
 * A column whose distinct values are bounded - tool, organization, profile, status -
 * offers a picker fed by those values instead of asking the user to type one in, and the
 * list is searched rather than scrolled. The picker is chosen per column, not per type:
 * 106 tools get a list, 12k campaign names keep the text box.
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

/** Which chips' value menus are open; a freshly added picker opens itself. */
const openMenus = ref<Record<string, boolean>>({})

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
  // A bounded column opens as a picker (the user wanted to choose, not type); anything
  // else keeps the substring box it has always had.
  const picks = boundedOptions(key).length > 0
  const operator = picks ? 'isAnyOf' : operatorsFor(typeOf(key))[0].value
  // A picker starts empty: seeding it with a blank placeholder made the trigger render
  // an empty label and left a stray '' in the values array.
  commit([...props.modelValue, { key, operator, values: picks ? [] : [''] }])
  // Adding a picker opens it: the user's next move is to choose a value, so making them
  // click again would be a step that exists only because the code was simpler.
  //
  // Deferred by a task on purpose. The menu is non-modal, so its dismissable layer
  // registers while the click that created it is still propagating and reads that same
  // click as an outside press - opening synchronously made the popup flash open and shut.
  if (picks)
    setTimeout(() => { openMenus.value = { ...openMenus.value, [key]: true } }, 0)
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

/**
 * The distinct values behind a column, computed once per data load.
 *
 * Every chip on the page reads this list, so it is memoised rather than recomputed per
 * render - the biggest table here has ~29k rows.
 */
const optionCache = new Map<string, string[]>()
watch(() => props.rows, () => optionCache.clear())

function options(key: string): string[] {
  let cached = optionCache.get(key)
  if (!cached) {
    cached = distinctValues(props.rows ?? [], key)
    optionCache.set(key, cached)
  }
  return cached
}

/** The pickable values, or an empty list when the column has too many to be a category. */
function boundedOptions(key: string): string[] {
  const values = options(key)
  return values.length > 0 && values.length <= MAX_OPTION_VALUES ? values : []
}

function picksValues(filter: ColumnFilter): boolean {
  return supportsValueOptions(typeOf(filter.key))
    && (filter.operator === 'isAnyOf' || filter.operator === 'isNoneOf')
    && boundedOptions(filter.key).length > 0
}

function editorFor(filter: ColumnFilter) {
  if (picksValues(filter))
    return 'options'
  return valueEditorFor(typeOf(filter.key), filter.operator)
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

/** The search term per chip, so a 530-profile list is typed into rather than scrolled. */
const searches = ref<Record<string, string>>({})

/**
 * How many rows a picker renders at once.
 *
 * Every row is a menu item, and re-rendering them on each tick is what made selecting
 * feel sticky: measured click-to-paint was ~480ms with 362 rows, ~300ms with 211 and
 * ~120ms with 40. The search box is how the rest of the list is reached, so the cap costs
 * nothing that matters and the list stays responsive.
 */
const MAX_RENDERED_OPTIONS = 60

/** What the search term matches, before the render cap. */
function matchedOptions(filter: ColumnFilter): string[] {
  const term = (searches.value[filter.key] ?? '').trim().toLowerCase()
  const all = boundedOptions(filter.key)
  return term ? all.filter(option => option.toLowerCase().includes(term)) : all
}

function visibleOptions(filter: ColumnFilter): string[] {
  return matchedOptions(filter).slice(0, MAX_RENDERED_OPTIONS)
}

/** "共 N 个可选值" or "匹配 N 个 · 显示前 60 个", so the cap is never invisible. */
function optionCountLabel(filter: ColumnFilter): string {
  const matched = matchedOptions(filter).length
  const rendered = Math.min(matched, MAX_RENDERED_OPTIONS)
  if (matched === 0)
    return '没有匹配的值'
  const total = boundedOptions(filter.key).length
  return rendered < matched
    ? `匹配 ${matched} 个 · 显示前 ${rendered} 个（输入可筛选）`
    : `共 ${total} 个可选值`
}

function optionSummary(filter: ColumnFilter): string {
  const picked = filter.values.filter(v => String(v ?? '').trim() !== '')
  if (picked.length === 0)
    return '选择值…'
  if (picked.length <= 2)
    return picked.join(', ')
  return `已选 ${picked.length} 个`
}

function toggleEnum(key: string, option: string) {
  const current = props.modelValue.find(f => f.key === key)
  if (!current)
    return
  const values = current.values.includes(option)
    ? current.values.filter(v => v !== option)
    // Drop any blank placeholder so the summary never counts a value nobody chose.
    : [...current.values.filter(v => String(v ?? '').trim() !== ''), option]
  update(key, { values })
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

      <!--
        :modal="false" because this is a filter popup, not a dialog: the modal lock put a
        scroll-lock and a focus trap on the page for every click, which is the hitch that
        made picking several values feel like it had to be done fast.
      -->
      <UiDropdownMenu v-if="editorFor(f) === 'options'" v-model:open="openMenus[f.key]" :modal="false">
        <UiDropdownMenuTrigger as-child>
          <button
            type="button"
            class="max-w-40 truncate rounded px-1 text-sm text-foreground hover:bg-accent"
          >
            {{ optionSummary(f) }}
          </button>
        </UiDropdownMenuTrigger>
        <!--
          A list of 530 profiles is typed into, not scrolled, so the search box sits
          inside the menu. Keydown is stopped there so the menu's own type-ahead does not
          swallow the characters.
        -->
        <!--
          The menu would normally pull focus to itself on open; the search box is where
          the user is about to type, so that focus is prevented instead.
        -->
        <!--
          focus-outside.prevent is load-bearing, not defensive. The picker opens itself as
          soon as it is added, while the menu item that created it is unmounting and focus
          is returning to the Filter button - which is outside the new menu, so reka closed
          it in the same tick. Outside clicks still dismiss it; a focus change does not.
        -->
        <UiDropdownMenuContent align="start" class="w-64" @open-auto-focus.prevent @focus-outside.prevent>
          <UiInput
            :model-value="searches[f.key] ?? ''"
            placeholder="搜索值…"
            class="mb-1 h-7 text-sm"
            autofocus
            @update:model-value="(v: string | number) => searches[f.key] = String(v)"
            @keydown.stop
          />
          <div class="max-h-64 overflow-y-auto">
            <!--
              select.prevent is what makes this a multi-select: reka-ui's checkbox item
              closes its menu on every select unless the event is prevented, so without it
              each tick dismissed the list and a second value needed a second click on the
              trigger. The tick itself is applied after the emit, so preventing the close
              does not prevent the selection.

            -->
            <UiDropdownMenuCheckboxItem
              v-for="option in visibleOptions(f)"
              :key="option"
              :model-value="f.values.includes(option)"
              @select.prevent
              @update:model-value="() => toggleEnum(f.key, option)"
            >
              {{ option }}
            </UiDropdownMenuCheckboxItem>
            <div v-if="matchedOptions(f).length === 0" class="px-2 py-1.5 text-sm text-muted-foreground">
              没有匹配的值
            </div>
          </div>
          <div class="px-2 pt-1 text-xs text-muted-foreground">
            {{ optionCountLabel(f) }}
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
