<script setup lang="ts">
import { Check, ChevronDown, X } from 'lucide-vue-next'
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { ProductFilter, ProductProgress } from '@/services/types/raas.type'

import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

const props = defineProps<{
  products?: ProductProgress[]
}>()

const emit = defineEmits<{
  (e: 'filterChange', filters: ProductFilter): void
}>()

const { t } = useI18n()

// 多选值存储
const selectedAmazonProfiles = ref<string[]>([])
const selectedCategories = ref<string[]>([])
const selectedHannaOrgs = ref<string[]>([])
const selectedStatus = ref<string[]>([])

// 单选值存储
const selectedMarketplace = ref<string | undefined>(undefined)
const selectedRaasPlan = ref<string | undefined>(undefined)

// Popover 开关状态
const amazonProfileOpen = ref(false)
const marketplaceOpen = ref(false)
const categoryOpen = ref(false)
const hannaOrgOpen = ref(false)
const raasPlanOpen = ref(false)
const statusOpen = ref(false)

const filterForm = reactive<ProductFilter>({
  amazon_profile_name: undefined,
  category_name: undefined,
  hanna_org_name: undefined,
  raas_plan: undefined,
  status: undefined,
  marketplace: undefined,
})

// 从产品数据中提取唯一的 Amazon Profile 列表
const amazonProfileOptions = computed(() => {
  if (!props.products || props.products.length === 0)
    return []
  const uniqueSet = new Set(props.products.map(p => p.amazon_profile_name).filter(Boolean))
  return Array.from(uniqueSet).sort().map(item => ({ label: item, value: item }))
})

// 从产品数据中提取唯一的 Category 列表
const categoryOptions = computed(() => {
  if (!props.products || props.products.length === 0)
    return []
  const uniqueSet = new Set(props.products.map(p => p.category_name).filter(Boolean))
  return Array.from(uniqueSet).sort().map(item => ({ label: item, value: item }))
})

// 从产品数据中提取唯一的 Hanna Org 列表
const hannaOrgOptions = computed(() => {
  if (!props.products || props.products.length === 0)
    return []
  const uniqueSet = new Set(props.products.map(p => p.hanna_org_name).filter(Boolean))
  return Array.from(uniqueSet).sort().map(item => ({ label: item, value: item }))
})

const marketplaceOptions = [
  { label: 'US', value: 'US' },
]

const raasPlanOptions = [
  { label: 'Climb Plan', value: 'Climb Plan' },
  { label: 'Sprint - Top100', value: 'Sprint - Top100' },
  { label: 'Sprint - Top1', value: 'Sprint - Top1' },
]

const statusOptions = [
  { label: 'ONGOING', value: 'ONGOING' },
  { label: 'SUCCESS', value: 'SUCCESS' },
  { label: 'CANCELLED', value: 'CANCELLED' },
]

// 过滤函数
function filterFunction(list: any[], term: string) {
  return list.filter(i => i.label.toLowerCase().includes(term.toLowerCase()))
}

// 多选切换
function toggleMultiValue(values: string[], value: string): string[] {
  const index = values.indexOf(value)
  if (index > -1) {
    return values.filter(v => v !== value)
  }
  return [...values, value]
}

// 监听值变化，更新 filterForm - 直接传递数组
watch(selectedAmazonProfiles, (newVal) => {
  filterForm.amazon_profile_name = newVal.length > 0 ? newVal : undefined
})

watch(selectedCategories, (newVal) => {
  filterForm.category_name = newVal.length > 0 ? newVal : undefined
})

watch(selectedHannaOrgs, (newVal) => {
  filterForm.hanna_org_name = newVal.length > 0 ? newVal : undefined
})

watch(selectedStatus, (newVal) => {
  filterForm.status = newVal.length > 0 ? newVal : undefined
})

watch(selectedMarketplace, (newVal) => {
  filterForm.marketplace = newVal || undefined
})

watch(selectedRaasPlan, (newVal) => {
  filterForm.raas_plan = newVal || undefined
})

function handleSearch() {
  const filters: ProductFilter = {}
  Object.entries(filterForm).forEach(([key, value]) => {
    // 对于数组类型，检查长度；对于其他类型，检查是否为空
    if (Array.isArray(value)) {
      if (value.length > 0) {
        filters[key as keyof ProductFilter] = value as any
      }
    }
    else if (value !== undefined && value !== null && value !== '') {
      filters[key as keyof ProductFilter] = value as any
    }
  })
  emit('filterChange', filters)
}

function handleReset() {
  selectedAmazonProfiles.value = []
  selectedCategories.value = []
  selectedHannaOrgs.value = []
  selectedStatus.value = []
  selectedMarketplace.value = undefined
  selectedRaasPlan.value = undefined
  emit('filterChange', {})
}

// 移除单个多选项
function removeAmazonProfile(value: string) {
  selectedAmazonProfiles.value = selectedAmazonProfiles.value.filter(v => v !== value)
}

function removeCategory(value: string) {
  selectedCategories.value = selectedCategories.value.filter(v => v !== value)
}

function removeHannaOrg(value: string) {
  selectedHannaOrgs.value = selectedHannaOrgs.value.filter(v => v !== value)
}

function removeStatus(value: string) {
  selectedStatus.value = selectedStatus.value.filter(v => v !== value)
}

// 清除单选
function clearMarketplace() {
  selectedMarketplace.value = undefined
  marketplaceOpen.value = false
}

function clearRaasPlan() {
  selectedRaasPlan.value = undefined
  raasPlanOpen.value = false
}
</script>

<template>
  <div class="space-y-3">
    <!-- Filters grid - 6 columns on md screens, 2 columns on mobile -->
    <div class="grid grid-cols-2 md:grid-cols-6 gap-3">
      <!-- Amazon Profile (Multi-select) -->
      <div class="space-y-1">
        <div class="text-xs font-medium text-muted-foreground">
          Amazon Profile
        </div>
        <Popover v-model:open="amazonProfileOpen">
          <PopoverTrigger as-child>
            <button
              type="button"
              class="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span class="truncate">
                {{ selectedAmazonProfiles.length > 0 ? `${selectedAmazonProfiles.length} ${t('raas.filter.selected')}` : t('raas.filter.amazonProfilePlaceholder') }}
              </span>
              <ChevronDown class="h-4 w-4 opacity-50" />
            </button>
          </PopoverTrigger>
          <PopoverContent class="w-[200px] p-0" align="start">
            <Command :filter-function="filterFunction">
              <CommandInput :placeholder="t('raas.filter.search')" />
              <CommandList>
                <CommandEmpty>{{ t('raas.filter.noResults') }}</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    v-for="option in amazonProfileOptions"
                    :key="option.value"
                    :value="option"
                    @select="selectedAmazonProfiles = toggleMultiValue(selectedAmazonProfiles, option.value)"
                  >
                    <div
                      :class="cn(
                        'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                        selectedAmazonProfiles.includes(option.value)
                          ? 'bg-primary'
                          : 'opacity-50 [&_svg]:invisible',
                      )"
                    >
                      <Check :class="cn('h-4 w-4', selectedAmazonProfiles.includes(option.value) ? 'text-primary-foreground' : '')" />
                    </div>
                    <span class="truncate">{{ option.label }}</span>
                  </CommandItem>
                </CommandGroup>
                <template v-if="selectedAmazonProfiles.length > 0">
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem
                      :value="{ label: 'Clear filters' }"
                      class="justify-center text-center"
                      @select="selectedAmazonProfiles = []"
                    >
                      {{ t('raas.filter.clearFilters') }}
                    </CommandItem>
                  </CommandGroup>
                </template>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <!-- Selected tags -->
        <div v-if="selectedAmazonProfiles.length > 0" class="flex flex-wrap gap-1">
          <span
            v-for="item in selectedAmazonProfiles"
            :key="item"
            class="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs"
          >
            <span class="truncate max-w-[80px]">{{ item }}</span>
            <button
              type="button"
              class="hover:text-destructive"
              @click="removeAmazonProfile(item)"
            >
              <X :size="12" />
            </button>
          </span>
        </div>
      </div>

      <!-- Marketplace (Single-select) -->
      <div class="space-y-1">
        <div class="text-xs font-medium text-muted-foreground">
          Marketplace
        </div>
        <Popover v-model:open="marketplaceOpen">
          <PopoverTrigger as-child>
            <button
              type="button"
              class="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <span class="truncate">
                {{ selectedMarketplace || t('raas.filter.marketplacePlaceholder') }}
              </span>
              <ChevronDown class="h-4 w-4 opacity-50" />
            </button>
          </PopoverTrigger>
          <PopoverContent class="w-[200px] p-0" align="start">
            <Command :filter-function="filterFunction">
              <CommandInput :placeholder="t('raas.filter.search')" />
              <CommandList>
                <CommandEmpty>{{ t('raas.filter.noResults') }}</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    v-for="option in marketplaceOptions"
                    :key="option.value"
                    :value="option"
                    @select="selectedMarketplace = option.value; marketplaceOpen = false"
                  >
                    <div
                      :class="cn(
                        'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                        selectedMarketplace === option.value
                          ? 'bg-primary'
                          : 'opacity-50 [&_svg]:invisible',
                      )"
                    >
                      <Check :class="cn('h-4 w-4', selectedMarketplace === option.value ? 'text-primary-foreground' : '')" />
                    </div>
                    <span>{{ option.label }}</span>
                  </CommandItem>
                </CommandGroup>
                <template v-if="selectedMarketplace">
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem
                      :value="{ label: 'Clear' }"
                      class="justify-center text-center"
                      @select="clearMarketplace"
                    >
                      {{ t('raas.filter.clearFilters') }}
                    </CommandItem>
                  </CommandGroup>
                </template>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      <!-- Category (Multi-select) -->
      <div class="space-y-1">
        <div class="text-xs font-medium text-muted-foreground">
          Category
        </div>
        <Popover v-model:open="categoryOpen">
          <PopoverTrigger as-child>
            <button
              type="button"
              class="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span class="truncate">
                {{ selectedCategories.length > 0 ? `${selectedCategories.length} ${t('raas.filter.selected')}` : t('raas.filter.categoryPlaceholder') }}
              </span>
              <ChevronDown class="h-4 w-4 opacity-50" />
            </button>
          </PopoverTrigger>
          <PopoverContent class="w-[200px] p-0" align="start">
            <Command :filter-function="filterFunction">
              <CommandInput :placeholder="t('raas.filter.search')" />
              <CommandList>
                <CommandEmpty>{{ t('raas.filter.noResults') }}</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    v-for="option in categoryOptions"
                    :key="option.value"
                    :value="option"
                    @select="selectedCategories = toggleMultiValue(selectedCategories, option.value)"
                  >
                    <div
                      :class="cn(
                        'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                        selectedCategories.includes(option.value)
                          ? 'bg-primary'
                          : 'opacity-50 [&_svg]:invisible',
                      )"
                    >
                      <Check :class="cn('h-4 w-4', selectedCategories.includes(option.value) ? 'text-primary-foreground' : '')" />
                    </div>
                    <span class="truncate">{{ option.label }}</span>
                  </CommandItem>
                </CommandGroup>
                <template v-if="selectedCategories.length > 0">
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem
                      :value="{ label: 'Clear filters' }"
                      class="justify-center text-center"
                      @select="selectedCategories = []"
                    >
                      {{ t('raas.filter.clearFilters') }}
                    </CommandItem>
                  </CommandGroup>
                </template>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <!-- Selected tags -->
        <div v-if="selectedCategories.length > 0" class="flex flex-wrap gap-1">
          <span
            v-for="item in selectedCategories"
            :key="item"
            class="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs"
          >
            <span class="truncate max-w-[80px]">{{ item }}</span>
            <button
              type="button"
              class="hover:text-destructive"
              @click="removeCategory(item)"
            >
              <X :size="12" />
            </button>
          </span>
        </div>
      </div>

      <!-- Hanna Org (Multi-select) -->
      <div class="space-y-1">
        <div class="text-xs font-medium text-muted-foreground">
          Hanna Org
        </div>
        <Popover v-model:open="hannaOrgOpen">
          <PopoverTrigger as-child>
            <button
              type="button"
              class="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span class="truncate">
                {{ selectedHannaOrgs.length > 0 ? `${selectedHannaOrgs.length} ${t('raas.filter.selected')}` : t('raas.filter.hannaOrgPlaceholder') }}
              </span>
              <ChevronDown class="h-4 w-4 opacity-50" />
            </button>
          </PopoverTrigger>
          <PopoverContent class="w-[200px] p-0" align="start">
            <Command :filter-function="filterFunction">
              <CommandInput :placeholder="t('raas.filter.search')" />
              <CommandList>
                <CommandEmpty>{{ t('raas.filter.noResults') }}</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    v-for="option in hannaOrgOptions"
                    :key="option.value"
                    :value="option"
                    @select="selectedHannaOrgs = toggleMultiValue(selectedHannaOrgs, option.value)"
                  >
                    <div
                      :class="cn(
                        'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                        selectedHannaOrgs.includes(option.value)
                          ? 'bg-primary'
                          : 'opacity-50 [&_svg]:invisible',
                      )"
                    >
                      <Check :class="cn('h-4 w-4', selectedHannaOrgs.includes(option.value) ? 'text-primary-foreground' : '')" />
                    </div>
                    <span class="truncate">{{ option.label }}</span>
                  </CommandItem>
                </CommandGroup>
                <template v-if="selectedHannaOrgs.length > 0">
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem
                      :value="{ label: 'Clear filters' }"
                      class="justify-center text-center"
                      @select="selectedHannaOrgs = []"
                    >
                      {{ t('raas.filter.clearFilters') }}
                    </CommandItem>
                  </CommandGroup>
                </template>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <!-- Selected tags -->
        <div v-if="selectedHannaOrgs.length > 0" class="flex flex-wrap gap-1">
          <span
            v-for="item in selectedHannaOrgs"
            :key="item"
            class="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs"
          >
            <span class="truncate max-w-[80px]">{{ item }}</span>
            <button
              type="button"
              class="hover:text-destructive"
              @click="removeHannaOrg(item)"
            >
              <X :size="12" />
            </button>
          </span>
        </div>
      </div>

      <!-- Raas Plan (Single-select) -->
      <div class="space-y-1">
        <div class="text-xs font-medium text-muted-foreground">
          Raas Plan
        </div>
        <Popover v-model:open="raasPlanOpen">
          <PopoverTrigger as-child>
            <button
              type="button"
              class="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <span class="truncate">
                {{ selectedRaasPlan || t('raas.filter.raasPlanPlaceholder') }}
              </span>
              <ChevronDown class="h-4 w-4 opacity-50" />
            </button>
          </PopoverTrigger>
          <PopoverContent class="w-[200px] p-0" align="start">
            <Command :filter-function="filterFunction">
              <CommandInput :placeholder="t('raas.filter.search')" />
              <CommandList>
                <CommandEmpty>{{ t('raas.filter.noResults') }}</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    v-for="option in raasPlanOptions"
                    :key="option.value"
                    :value="option"
                    @select="selectedRaasPlan = option.value; raasPlanOpen = false"
                  >
                    <div
                      :class="cn(
                        'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                        selectedRaasPlan === option.value
                          ? 'bg-primary'
                          : 'opacity-50 [&_svg]:invisible',
                      )"
                    >
                      <Check :class="cn('h-4 w-4', selectedRaasPlan === option.value ? 'text-primary-foreground' : '')" />
                    </div>
                    <span>{{ option.label }}</span>
                  </CommandItem>
                </CommandGroup>
                <template v-if="selectedRaasPlan">
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem
                      :value="{ label: 'Clear' }"
                      class="justify-center text-center"
                      @select="clearRaasPlan"
                    >
                      {{ t('raas.filter.clearFilters') }}
                    </CommandItem>
                  </CommandGroup>
                </template>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      <!-- Status (Multi-select) -->
      <div class="space-y-1">
        <div class="text-xs font-medium text-muted-foreground">
          {{ t('raas.filter.statusLabel') }}
        </div>
        <Popover v-model:open="statusOpen">
          <PopoverTrigger as-child>
            <button
              type="button"
              class="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span class="truncate">
                {{ selectedStatus.length > 0 ? `${selectedStatus.length} ${t('raas.filter.selected')}` : t('raas.filter.statusPlaceholder') }}
              </span>
              <ChevronDown class="h-4 w-4 opacity-50" />
            </button>
          </PopoverTrigger>
          <PopoverContent class="w-[200px] p-0" align="start">
            <Command :filter-function="filterFunction">
              <CommandInput :placeholder="t('raas.filter.search')" />
              <CommandList>
                <CommandEmpty>{{ t('raas.filter.noResults') }}</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    v-for="option in statusOptions"
                    :key="option.value"
                    :value="option"
                    @select="selectedStatus = toggleMultiValue(selectedStatus, option.value)"
                  >
                    <div
                      :class="cn(
                        'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                        selectedStatus.includes(option.value)
                          ? 'bg-primary'
                          : 'opacity-50 [&_svg]:invisible',
                      )"
                    >
                      <Check :class="cn('h-4 w-4', selectedStatus.includes(option.value) ? 'text-primary-foreground' : '')" />
                    </div>
                    <span class="truncate">{{ option.label }}</span>
                  </CommandItem>
                </CommandGroup>
                <template v-if="selectedStatus.length > 0">
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem
                      :value="{ label: 'Clear filters' }"
                      class="justify-center text-center"
                      @select="selectedStatus = []"
                    >
                      {{ t('raas.filter.clearFilters') }}
                    </CommandItem>
                  </CommandGroup>
                </template>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <!-- Selected tags -->
        <div v-if="selectedStatus.length > 0" class="flex flex-wrap gap-1">
          <span
            v-for="item in selectedStatus"
            :key="item"
            class="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs"
          >
            <span class="truncate max-w-[80px]">{{ item }}</span>
            <button
              type="button"
              class="hover:text-destructive"
              @click="removeStatus(item)"
            >
              <X :size="12" />
            </button>
          </span>
        </div>
      </div>
    </div>

    <!-- Action buttons -->
    <div class="flex items-center gap-2 pt-1">
      <Button size="sm" @click="handleSearch">
        {{ t('raas.filter.search') }}
      </Button>
      <Button size="sm" variant="outline" @click="handleReset">
        {{ t('raas.filter.reset') }}
      </Button>
    </div>
  </div>
</template>
