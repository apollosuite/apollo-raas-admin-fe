<script setup lang="ts">
import { onClickOutside } from '@vueuse/core'
import { ChevronDown, Info, X } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import type {
  Product,
  ProductCompositeKey,
  ProductCreate,
  ProductFilter,
  ProductListParams,
  ProductProgress,
} from '@/services/types/raas.type'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useRaasApi } from '@/services/api/raas.api'

const props = defineProps<{
  filters: ProductFilter
}>()

const emit = defineEmits<{
  (e: 'productsLoaded', products: ProductProgress[]): void
}>()

const { t } = useI18n()

const {
  useGetProductProgress,
  useCreateProduct,
  useUpdateProduct,
  useCancelProduct,
  useFetchKeepaData,
  useGetLastUpdateTime,
  useTriggerDataUpdate,
  useGetHannaOrgs,
  useGetAmazonProfiles,
} = useRaasApi()

// Pagination
const pagination = ref({
  current: 1,
  pageSize: 20,
  total: 0,
})

// Reactive query params based on filters and pagination
// Exclude ad_window from triggering table reloads as it only affects ad metrics calculation
const queryParams = computed<ProductListParams>(() => {
  // Ensure we're properly handling all filter values
  const params: ProductListParams = {
    page: pagination.value.current,
    page_size: pagination.value.pageSize,
  }

  // Only add filter properties that have actual values
  Object.keys(props.filters).forEach((key) => {
    const typedKey = key as keyof ProductFilter
    const value = props.filters[typedKey]

    // Skip ad_window as it should not trigger table reloads
    if (typedKey !== 'ad_window' && value !== undefined && value !== null && value !== '') {
      (params as any)[typedKey] = value
    }
  })

  return params
})

// Queries - API will automatically react to queryParams changes
// 使用合并后的产品进度API
const { data: productProgressData, isLoading: loading } = useGetProductProgress(queryParams)

// 新增：获取最后更新时间
const { data: lastUpdateTimeData, refetch: refetchLastUpdateTime } = useGetLastUpdateTime()

// Update total when data changes
watch(
  () => productProgressData.value?.total,
  (newTotal) => {
    if (newTotal !== undefined) {
      pagination.value.total = newTotal
    }
  },
)

// Emit products data when loaded
watch(
  () => productProgressData.value?.items,
  (items) => {
    if (items && items.length > 0) {
      emit('productsLoaded', items)
    }
  },
  { immediate: true },
)

// Mutations
const { mutate: createProduct } = useCreateProduct()
const { mutate: updateProduct } = useUpdateProduct()
const { mutate: cancelProduct } = useCancelProduct()
const { mutate: fetchKeepaData } = useFetchKeepaData()
const { mutate: triggerDataUpdate, isPending: isUpdating } = useTriggerDataUpdate()

const tableData = computed(() => productProgressData.value?.items || [])

// 获取当前选择的广告窗口
const currentAdWindow = computed(() => props.filters.ad_window || '30d')

// 根据当前ad_window获取广告数据的辅助函数（扁平字段格式）
function getAdData(product: ProductProgress): { ad_spend?: number, ad_sales?: number, ad_orders?: number, acos?: number } | undefined {
  const adWindow = currentAdWindow.value
  const prefix = adWindow === '7d' ? '7d' : adWindow === '14d' ? '14d' : adWindow === 'rt' ? 'rt' : '30d'
  return {
    ad_spend: product[`ad_spend_${prefix}` as keyof ProductProgress] as number | undefined,
    ad_sales: product[`ad_sales_${prefix}` as keyof ProductProgress] as number | undefined,
    ad_orders: product[`ad_orders_${prefix}` as keyof ProductProgress] as number | undefined,
    acos: product[`acos_${prefix}` as keyof ProductProgress] as number | undefined,
  }
}

// Marketplace 货币符号映射
const marketplaceCurrencyMap: Record<string, string> = {
  US: '$',
  // 可以根据需要添加更多市场的货币符号
}

// 获取货币符号
function getCurrencySymbol(marketplace?: string): string {
  return marketplaceCurrencyMap[marketplace || 'US'] || '$'
}

// 格式化百分比显示（乘以100并添加%后缀）
function formatPercent(value: number | null | undefined): string {
  if (value == null)
    return '-'
  return `${(value * 100).toFixed(2)}%`
}

// 格式化货币显示
function formatCurrency(value: number | null | undefined, marketplace?: string): string {
  if (value == null)
    return '-'
  const symbol = getCurrencySymbol(marketplace)
  return `${symbol}${value.toFixed(2)}`
}

// 格式化 Keepa 时间显示
function formatKeepaTime(keepaTime: string): string {
  // 保持原始格式，或者可以根据需要进行格式化
  return keepaTime
}

// 格式化 Keepa 类目选项显示文本
function formatKeepaCategoryItem(category: { category_name: string, sales_rank: number | null, keepa_time: string }): string {
  return `${category.category_name} - ${category.sales_rank ?? 'N/A'} - ${formatKeepaTime(category.keepa_time)}`
}

const selectedRowKeys = ref<Set<string>>(new Set())

const modalOpen = ref(false)
const modalTitle = ref('')
const isEditing = ref(false)

const formData = ref<ProductCreate>({
  amazon_profile_name: '',
  hanna_org_name: '',
  asin: '',
  category_name: '',
  raas_plan: '',
  start_date: '',
  end_date: '',
  baseline_sales_rank: null,
  target_acos: null,
  target_ad_spend: null,
  status: undefined,
  marketplace: 'US',
})

const bsrPending = ref(false)

// 新增：获取 Hanna Org 和 Amazon Profile 列表（用于新增产品时的级联选择）
const { data: hannaOrgsData, isLoading: hannaOrgsLoading } = useGetHannaOrgs()

// 用于筛选 Amazon Profile 的 Hanna Org 名称
const selectedHannaOrgForFilter = computed(() => {
  // 如果用户已经选择了 Hanna Org，用它来筛选
  // 如果用户已经选择了 Amazon Profile，用它的关联 Hanna Org 来筛选
  if (formData.value.hanna_org_name) {
    return formData.value.hanna_org_name
  }
  return undefined
})

const { data: amazonProfilesData, isLoading: amazonProfilesLoading } = useGetAmazonProfiles(selectedHannaOrgForFilter)

// Keepa data fetching states
const keepaLoading = ref(false)
const keepaCategories = ref<{ category_id: number, category_name: string, sales_rank: number | null, keepa_time: string }[]>([])
const keepaFetched = ref(false)

// 只显示有 sales_rank 的类目（过滤掉 sales_rank 为 null 的选项）
const keepaCategoriesWithRank = computed(() => {
  return keepaCategories.value.filter(cat => cat.sales_rank != null)
})

// 新增：Hanna Org 和 Amazon Profile 下拉框状态
const hannaOrgDropdownOpen = ref(false)
const amazonProfileDropdownOpen = ref(false)
const hannaOrgSearch = ref('')
const amazonProfileSearch = ref('')
const hannaOrgDropdownRef = ref<HTMLElement | null>(null)
const amazonProfileDropdownRef = ref<HTMLElement | null>(null)

// 点击外部关闭下拉框
onClickOutside(hannaOrgDropdownRef, () => {
  hannaOrgDropdownOpen.value = false
})
onClickOutside(amazonProfileDropdownRef, () => {
  amazonProfileDropdownOpen.value = false
})

// 过滤后的 Hanna Org 列表
const filteredHannaOrgs = computed(() => {
  const items = hannaOrgsData.value?.items || []
  if (!hannaOrgSearch.value)
    return items
  return items.filter(org =>
    org.hanna_org_name.toLowerCase().includes(hannaOrgSearch.value.toLowerCase()),
  )
})

// 过滤后的 Amazon Profile 列表
const filteredAmazonProfiles = computed(() => {
  const items = amazonProfilesData.value?.items || []
  if (!amazonProfileSearch.value)
    return items
  return items.filter(profile =>
    profile.amazon_profile_name.toLowerCase().includes(amazonProfileSearch.value.toLowerCase()),
  )
})

// 新增：级联选择逻辑 - Hanna Org 和 Amazon Profile
// 当选择 Amazon Profile 时，自动填充对应的 Hanna Org
watch(
  () => formData.value.amazon_profile_name,
  (newAmazonProfile) => {
    if (newAmazonProfile && amazonProfilesData.value?.items) {
      const selectedProfile = amazonProfilesData.value.items.find(p => p.amazon_profile_name === newAmazonProfile)
      if (selectedProfile && !formData.value.hanna_org_name) {
        formData.value.hanna_org_name = selectedProfile.hanna_org_name
      }
    }
  },
)

// 当选择 Hanna Org 时，如果当前选中的 Amazon Profile 不属于该组织，则清空 Amazon Profile
watch(
  () => formData.value.hanna_org_name,
  (newHannaOrg) => {
    if (newHannaOrg && formData.value.amazon_profile_name && amazonProfilesData.value?.items) {
      const selectedProfile = amazonProfilesData.value.items.find(p => p.amazon_profile_name === formData.value.amazon_profile_name)
      if (selectedProfile && selectedProfile.hanna_org_name !== newHannaOrg) {
        formData.value.amazon_profile_name = ''
      }
    }
  },
)

// 新增：数据更新相关状态
const hasTriggeredUpdate = ref(false)
// 冷却时间配置（秒）
const UPDATE_COOLDOWN_SECONDS = 60
const updateCooldownRemaining = ref(0)
let updateCooldownTimer: ReturnType<typeof setInterval> | null = null

// 计算显示的最后更新时间
const displayLastUpdateTime = computed(() => {
  // 如果点击过更新按钮，显示"更新中"
  if (hasTriggeredUpdate.value) {
    return t('raas.actions.updating')
  }
  // 否则显示从API获取的最后更新时间
  if (lastUpdateTimeData.value?.last_updated_at) {
    return lastUpdateTimeData.value.last_updated_at
  }
  // 如果没有数据，显示"暂无数据"
  return t('raas.messages.noDataYet')
})

// 计算距离上次更新的时间（秒）
const timeSinceLastUpdate = computed(() => {
  if (!lastUpdateTimeData.value?.last_updated_at)
    return Infinity
  const lastUpdate = new Date(lastUpdateTimeData.value.last_updated_at)
  return Math.floor((Date.now() - lastUpdate.getTime()) / 1000)
})

// 计算是否处于冷却期
const isInCooldown = computed(() => updateCooldownRemaining.value > 0)

// 计算更新按钮是否应该被禁用
const isUpdateDisabled = computed(() => {
  // 正在更新中
  if (isUpdating.value || hasTriggeredUpdate.value)
    return true
  // 在冷却期内
  if (isInCooldown.value)
    return true
  // 距离上次更新不足最小间隔（30秒）
  const MIN_UPDATE_INTERVAL = 30
  if (timeSinceLastUpdate.value < MIN_UPDATE_INTERVAL)
    return true
  return false
})

// 计算更新按钮的文本
const updateButtonText = computed(() => {
  if (hasTriggeredUpdate.value || isUpdating.value)
    return t('raas.actions.updating')
  if (isInCooldown.value)
    return `${t('raas.dashboard.updateData')} (${updateCooldownRemaining.value}s)`
  return t('raas.dashboard.updateData')
})

// 启动冷却倒计时
function startUpdateCooldown() {
  updateCooldownRemaining.value = UPDATE_COOLDOWN_SECONDS
  if (updateCooldownTimer)
    clearInterval(updateCooldownTimer)
  updateCooldownTimer = setInterval(() => {
    updateCooldownRemaining.value--
    if (updateCooldownRemaining.value <= 0) {
      if (updateCooldownTimer) {
        clearInterval(updateCooldownTimer)
        updateCooldownTimer = null
      }
    }
  }, 1000)
}

// 处理更新数据按钮点击
function handleUpdateData() {
  // 检查是否可以更新
  if (isUpdateDisabled.value) {
    const remaining = Math.max(0, UPDATE_COOLDOWN_SECONDS - timeSinceLastUpdate.value)
    if (remaining > 0 && remaining < UPDATE_COOLDOWN_SECONDS) {
      toast.info(`${t('raas.messages.updateTooFrequent')} ${remaining}${t('raas.messages.seconds')}`)
    }
    return
  }

  hasTriggeredUpdate.value = true

  triggerDataUpdate(undefined, {
    onSuccess: (response) => {
      if (response.success) {
        toast.success(t('raas.messages.updateDataSuccess'))
        // 启动冷却倒计时
        startUpdateCooldown()
        // 刷新最后更新时间
        refetchLastUpdateTime()
      }
      else {
        toast.error(response.message || t('raas.messages.updateDataFailed'))
      }
    },
    onError: () => {
      toast.error(t('raas.messages.updateDataFailed'))
    },
    onSettled: () => {
      hasTriggeredUpdate.value = false
    },
  })
}

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

const statusVariantMap: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  CANCELLED: 'destructive',
  ONGOING: 'secondary',
  SUCCESS: 'default',
  UNDEFINED: 'outline',
}

// ---- Composite key helpers ----
function compositeKey(row: Product | ProductCompositeKey): string {
  const asins = row.asin || ''
  return `${row.amazon_profile_name}||${row.hanna_org_name}||${asins}||${row.category_name}||${row.raas_plan}||${row.start_date}`
}

function toCompositeKeyObj(row: Product): ProductCompositeKey {
  return {
    amazon_profile_name: row.amazon_profile_name,
    hanna_org_name: row.hanna_org_name,
    asin: row.asin,
    category_name: row.category_name,
    raas_plan: row.raas_plan,
    start_date: row.start_date,
  }
}

// ---- Flattened Rows ----
interface FlattenedRow {
  _key: string
  product: ProductProgress
  asin: string
}

const flattenedRows = computed<FlattenedRow[]>(() => {
  const rows: FlattenedRow[] = []
  tableData.value.forEach((product: ProductProgress) => {
    const asin = product.asin || ''
    const pKey = `${product.amazon_profile_name}||${product.hanna_org_name}||${asin}||${product.category_name}||${product.raas_plan}||${product.start_date}`
    rows.push({
      _key: `${pKey}_${asin}`,
      product,
      asin,
    })
  })
  return rows
})

// ---- Selection ----
const hasSelection = computed(() => selectedRowKeys.value.size > 0)

function toggleSelectAll(checked: boolean | 'indeterminate') {
  if (checked === true) {
    selectedRowKeys.value = new Set(flattenedRows.value.map(r => r._key))
  }
  else {
    selectedRowKeys.value = new Set()
  }
}

function toggleSelectRow(rowKey: string, checked: boolean | 'indeterminate') {
  const next = new Set(selectedRowKeys.value)
  if (checked === true) {
    next.add(rowKey)
  }
  else {
    next.delete(rowKey)
  }
  selectedRowKeys.value = next
}

const allSelected = computed(() => {
  return flattenedRows.value.length > 0 && selectedRowKeys.value.size === flattenedRows.value.length
})

const partiallySelected = computed(() => {
  return selectedRowKeys.value.size > 0 && !allSelected.value
})

// ---- Selected products (deduplicated) ----
const selectedProducts = computed<ProductProgress[]>(() => {
  const seen = new Set<string>()
  const products: ProductProgress[] = []
  flattenedRows.value.forEach((row) => {
    if (selectedRowKeys.value.has(row._key)) {
      const pk = compositeKey(row.product)
      if (!seen.has(pk)) {
        seen.add(pk)
        products.push(row.product)
      }
    }
  })
  return products
})

const selectedProductCount = computed(() => selectedProducts.value.length)

// ---- Action bar handlers ----
function handleEditSelected() {
  if (selectedProducts.value.length === 0)
    return
  if (selectedProducts.value.length > 1) {
    toast.warning(t('raas.messages.editSingleOnly'))
    return
  }
  handleEdit(selectedProducts.value[0])
}

function handleCancelSelected() {
  const products = selectedProducts.value.filter(p => p.status !== 'CANCELLED')
  if (products.length === 0) {
    toast.warning(t('raas.messages.allCancelled'))
    return
  }

  for (const p of products) {
    cancelProduct(toCompositeKeyObj(p), {
      onSuccess: () => {
        toast.success(t('raas.messages.cancelledCount', { count: products.length }))
        // 缓存会自动失效，不需要手动刷新
      },
      onError: () => {
        toast.error(t('raas.messages.cancelFailed'))
      },
    })
  }
}

// ---- Pagination ----

// ---- Modal: Add / Edit ----
function handleAdd() {
  modalTitle.value = t('raas.modal.addProduct')
  isEditing.value = false
  formData.value = {
    amazon_profile_name: '',
    hanna_org_name: '',
    asin: '',
    category_name: '',
    raas_plan: '',
    start_date: '',
    end_date: '',
    baseline_sales_rank: null,
    target_acos: null,
    target_ad_spend: null,
    status: undefined,
    marketplace: 'US',
  }
  bsrPending.value = false
  // Reset keepa states
  keepaLoading.value = false
  keepaCategories.value = []
  keepaFetched.value = false
  modalOpen.value = true
}

function handleEdit(row: ProductProgress) {
  modalTitle.value = t('raas.modal.editProduct')
  isEditing.value = true
  formData.value = {
    amazon_profile_name: row.amazon_profile_name || '',
    hanna_org_name: row.hanna_org_name || '',
    asin: row.asin || '',
    category_name: row.category_name || '',
    raas_plan: row.raas_plan || '',
    start_date: row.start_date || '',
    end_date: row.end_date || '',
    baseline_sales_rank: row.baseline_sales_rank ?? null,
    // 后端存储的是小数（如 0.25），前端显示需要乘以 100（如 25）
    target_acos: row.target_acos != null ? row.target_acos * 100 : null,
    target_ad_spend: row.target_ad_spend ?? null,
    status: row.status || 'ONGOING',
    marketplace: row.marketplace || 'US',
  }
  bsrPending.value = false
  // Reset keepa states
  keepaLoading.value = false
  keepaCategories.value = []
  keepaFetched.value = false
  modalOpen.value = true
}

// ---- Keepa: Fetch product categories and sales ranks ----
async function handleFetchKeepaData() {
  if (!formData.value.asin) {
    toast.error(t('raas.messages.enterAsin'))
    return
  }

  // 验证 start_date 是否已填写
  if (!formData.value.start_date) {
    toast.error(t('raas.messages.enterStartDate'))
    return
  }

  keepaLoading.value = true
  keepaFetched.value = false
  keepaCategories.value = []
  formData.value.category_name = ''
  formData.value.baseline_sales_rank = null

  fetchKeepaData({
    asin: formData.value.asin,
    raas_start_date: formData.value.start_date,
  }, {
    onSuccess: (res) => {
      if (res.success && res.categories && res.categories.length > 0) {
        keepaCategories.value = res.categories
        keepaFetched.value = true
        // 只统计有 sales_rank 的类目数量（与下拉框显示保持一致）
        const categoriesWithRank = res.categories.filter(cat => cat.sales_rank != null).length
        toast.success(t('raas.messages.keepaFetchSuccess', { count: categoriesWithRank }))
      }
      else {
        toast.error(res.message || t('raas.messages.keepaFetchFailed'))
      }
    },
    onError: (error: any) => {
      // 显示详细的错误信息
      const errorMsg = error.message || t('raas.messages.keepaRequestFailed')
      toast.error(errorMsg)
    },
    onSettled: () => {
      keepaLoading.value = false
    },
  })
}

// Handle category selection - auto-fill baseline sales rank
function handleCategoryChange(categoryValue: any) {
  const valueStr = String(categoryValue ?? '')
  formData.value.category_name = valueStr
  const selectedCategory = keepaCategories.value.find(c => c.category_name === valueStr)
  if (selectedCategory && selectedCategory.sales_rank != null) {
    formData.value.baseline_sales_rank = selectedCategory.sales_rank
  }
}

// ---- Submit form ----
async function handleModalOk() {
  const payload: ProductCreate = {
    amazon_profile_name: formData.value.amazon_profile_name,
    hanna_org_name: formData.value.hanna_org_name,
    asin: formData.value.asin,
    category_name: formData.value.category_name,
    raas_plan: formData.value.raas_plan,
    start_date: formData.value.start_date,
    end_date: formData.value.end_date,
    baseline_sales_rank: formData.value.baseline_sales_rank,
    // 前端输入的是百分比（如 25），后端存储的是小数（如 0.25），需要除以 100
    target_acos: formData.value.target_acos != null ? formData.value.target_acos / 100 : null,
    target_ad_spend: formData.value.target_ad_spend,
    marketplace: formData.value.marketplace,
    ...(isEditing.value ? { status: formData.value.status } : {}),
  }

  const mutateFn = isEditing.value ? updateProduct : createProduct

  mutateFn(payload, {
    onSuccess: () => {
      toast.success(isEditing.value ? t('raas.messages.updateSuccess') : t('raas.messages.createSuccess'))
      modalOpen.value = false
      // 缓存会自动失效，不需要手动刷新
    },
    onError: () => {
      toast.error(isEditing.value ? t('raas.messages.updateFailed') : t('raas.messages.createFailed'))
    },
  })
}

// ---- Pagination ----
function handlePageChange(nextPage: number) {
  pagination.value.current = nextPage
  // Query will automatically refetch due to reactive queryParams
}

const totalPages = computed(() => {
  return Math.max(1, Math.ceil(pagination.value.total / pagination.value.pageSize))
})
</script>

<template>
  <div class="space-y-4">
    <!-- Top toolbar -->
    <div class="flex items-center gap-2">
      <Button @click="handleAdd">
        {{ t('raas.actions.addProduct') }}
      </Button>
      <!-- 新增：更新数据按钮 -->
      <div class="flex items-center gap-2">
        <Button :disabled="isUpdateDisabled" @click="handleUpdateData">
          {{ updateButtonText }}
        </Button>
        <span class="text-xs text-muted-foreground whitespace-nowrap">
          {{ t('raas.dashboard.lastUpdated', { time: displayLastUpdateTime }) }}
        </span>
      </div>
    </div>

    <!-- Two-panel table -->
    <div class="rounded-md border">
      <div class="flex">
        <!-- Fixed left panel: Checkbox + Image + ASIN -->
        <div class="shrink-0 border-r bg-background">
          <table class="text-sm">
            <thead>
              <tr class="border-b">
                <th class="row-cell w-[40px] px-2">
                  <Checkbox
                    :model-value="allSelected"
                    :indeterminate="partiallySelected"
                    @update:model-value="toggleSelectAll"
                  />
                </th>
                <th class="row-cell w-[48px] px-2 text-left font-medium text-foreground">
                  {{ t('raas.table.image') }}
                </th>
                <th class="row-cell min-w-[120px] px-2 text-left font-medium text-foreground">
                  {{ t('raas.table.asin') }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading">
                <td colspan="3" class="row-cell px-2 text-center text-muted-foreground">
                  {{ t('raas.table.loading') }}
                </td>
              </tr>
              <tr v-else-if="flattenedRows.length === 0">
                <td colspan="3" class="row-cell px-2 text-center text-muted-foreground">
                  {{ t('raas.table.noData') }}
                </td>
              </tr>
              <tr v-for="row in flattenedRows" :key="row._key" class="border-b">
                <td class="row-cell w-[40px] px-2">
                  <Checkbox
                    :model-value="selectedRowKeys.has(row._key)"
                    @update:model-value="(checked: boolean | 'indeterminate') => toggleSelectRow(row._key, checked)"
                  />
                </td>
                <td class="row-cell w-[48px] px-2">
                  <img
                    v-if="row.product.img_url"
                    :src="row.product.img_url"
                    alt="Product"
                    class="h-9 w-9 rounded object-cover"
                  >
                  <div v-else class="h-9 w-9 rounded bg-muted" />
                </td>
                <td class="row-cell min-w-[120px] px-2 font-medium">
                  {{ row.asin || '-' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Scrollable right panel: All other columns -->
        <div class="flex-1 overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b">
                <th class="row-cell min-w-[140px] whitespace-nowrap px-3 text-left font-medium text-foreground">
                  {{ t('raas.table.amazonProfile') }}
                </th>
                <th class="row-cell min-w-[100px] whitespace-nowrap px-3 text-left font-medium text-foreground">
                  {{ t('raas.table.marketplace') }}
                </th>
                <th class="row-cell min-w-[120px] whitespace-nowrap px-3 text-left font-medium text-foreground">
                  {{ t('raas.table.hannaOrg') }}
                </th>
                <th class="row-cell min-w-[120px] whitespace-nowrap px-3 text-left font-medium text-foreground">
                  {{ t('raas.table.category') }}
                </th>
                <th class="row-cell min-w-[120px] whitespace-nowrap px-3 text-left font-medium text-foreground">
                  {{ t('raas.table.raasPlan') }}
                </th>
                <th class="row-cell min-w-[100px] whitespace-nowrap px-3 text-left font-medium text-foreground">
                  {{ t('raas.table.baselineRank') }}
                </th>
                <th class="row-cell min-w-[90px] whitespace-nowrap px-3 text-left font-medium text-foreground">
                  {{ t('raas.table.status') }}
                </th>
                <th class="row-cell min-w-[100px] whitespace-nowrap px-3 text-left font-medium text-foreground">
                  {{ t('raas.table.startDate') }}
                </th>
                <th class="row-cell min-w-[100px] whitespace-nowrap px-3 text-left font-medium text-foreground">
                  {{ t('raas.table.endDate') }}
                </th>
                <!-- Progress columns -->
                <th class="row-cell min-w-[80px] whitespace-nowrap px-3 text-left font-medium text-foreground">
                  {{ t('raas.table.daysRemaining') }}
                </th>
                <th class="row-cell min-w-[80px] whitespace-nowrap px-3 text-left font-medium text-foreground">
                  {{ t('raas.table.currentRank') }}
                </th>
                <th class="row-cell min-w-[100px] whitespace-nowrap px-3 text-left font-medium text-foreground">
                  {{ t('raas.table.climbDaysMet') }}
                </th>
                <th class="row-cell min-w-[80px] whitespace-nowrap px-3 text-left font-medium text-foreground">
                  {{ t('raas.table.daysTaken') }}
                </th>
                <th class="row-cell min-w-[100px] whitespace-nowrap px-3 text-left font-medium text-foreground">
                  {{ t('raas.table.finalStatusDate') }}
                </th>
                <!-- Ad columns (window controlled by filter) -->
                <th class="row-cell min-w-[100px] whitespace-nowrap px-3 text-left font-medium text-foreground">
                  {{ t('raas.table.adSpend') }}
                </th>
                <th class="row-cell min-w-[120px] whitespace-nowrap px-3 text-left font-medium text-foreground">
                  {{ t('raas.table.targetAdSpend') }}
                </th>
                <th class="row-cell min-w-[100px] whitespace-nowrap px-3 text-left font-medium text-foreground">
                  {{ t('raas.table.adSales') }}
                </th>
                <th class="row-cell min-w-[100px] whitespace-nowrap px-3 text-left font-medium text-foreground">
                  {{ t('raas.table.adOrders') }}
                </th>
                <th class="row-cell min-w-[80px] whitespace-nowrap px-3 text-left font-medium text-foreground">
                  {{ t('raas.table.acos') }}
                </th>
                <th class="row-cell min-w-[100px] whitespace-nowrap px-3 text-left font-medium text-foreground">
                  {{ t('raas.table.targetAcos') }}
                </th>
                <th class="row-cell min-w-[80px] whitespace-nowrap px-3 text-left font-medium text-foreground">
                  {{ t('raas.table.cmActions') }}
                </th>
                <th class="row-cell min-w-[110px] whitespace-nowrap px-3 text-left font-medium text-foreground">
                  {{ t('raas.table.cmLaunchGroups') }}
                </th>
                <th class="row-cell min-w-[100px] whitespace-nowrap px-3 text-left font-medium text-foreground">
                  {{ t('raas.table.cmCampaigns') }}
                </th>
                <th class="row-cell min-w-[100px] whitespace-nowrap px-3 text-left font-medium text-foreground">
                  {{ t('raas.table.cmAdGroups') }}
                </th>
                <th class="row-cell min-w-[110px] whitespace-nowrap px-3 text-left font-medium text-foreground">
                  {{ t('raas.table.smartCampaigns') }}
                </th>
                <th class="row-cell min-w-[100px] whitespace-nowrap px-3 text-left font-medium text-foreground">
                  {{ t('raas.table.scCampaigns') }}
                </th>
                <th class="row-cell min-w-[100px] whitespace-nowrap px-3 text-left font-medium text-foreground">
                  {{ t('raas.table.scAdGroups') }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading">
                <td colspan="32" class="row-cell px-3 text-center text-muted-foreground">
                  {{ t('raas.table.loading') }}
                </td>
              </tr>
              <tr v-else-if="flattenedRows.length === 0">
                <td colspan="32" class="row-cell px-3 text-center text-muted-foreground">
                  {{ t('raas.table.noData') }}
                </td>
              </tr>
              <tr v-for="row in flattenedRows" :key="row._key" class="border-b">
                <td class="row-cell whitespace-nowrap px-3">
                  {{ row.product.amazon_profile_name || '-' }}
                </td>
                <td class="row-cell whitespace-nowrap px-3">
                  {{ row.product.marketplace || '-' }}
                </td>
                <td class="row-cell whitespace-nowrap px-3">
                  {{ row.product.hanna_org_name || '-' }}
                </td>
                <td class="row-cell whitespace-nowrap px-3">
                  {{ row.product.category_name || '-' }}
                </td>
                <td class="row-cell whitespace-nowrap px-3">
                  <Badge v-if="row.product.raas_plan">
                    {{ row.product.raas_plan }}
                  </Badge>
                  <span v-else>-</span>
                </td>
                <td class="row-cell whitespace-nowrap px-3">
                  <span v-if="row.product.baseline_sales_rank != null">
                    {{ row.product.baseline_sales_rank }}
                  </span>
                  <span v-else class="text-muted-foreground">-</span>
                </td>
                <td class="row-cell whitespace-nowrap px-3">
                  <Badge :variant="statusVariantMap[row.product.status || 'ONGOING'] || 'outline'">
                    {{ row.product.status || 'ONGOING' }}
                  </Badge>
                </td>
                <td class="row-cell whitespace-nowrap px-3">
                  {{ row.product.start_date || '-' }}
                </td>
                <td class="row-cell whitespace-nowrap px-3">
                  {{ row.product.end_date || '-' }}
                </td>
                <!-- Progress data -->
                <td class="row-cell whitespace-nowrap px-3">
                  {{ row.product.days_remaining ?? '-' }}
                </td>
                <td class="row-cell whitespace-nowrap px-3">
                  {{ row.product.current_sales_rank ?? '-' }}
                </td>
                <td class="row-cell whitespace-nowrap px-3">
                  {{ row.product.climb_days_met ?? '-' }}
                </td>
                <td class="row-cell whitespace-nowrap px-3">
                  {{ row.product.days_taken ?? '-' }}
                </td>
                <td class="row-cell whitespace-nowrap px-3">
                  {{ row.product.final_status_date ?? '-' }}
                </td>
                <!-- Ad data (window controlled by filter) -->
                <td class="row-cell whitespace-nowrap px-3">
                  {{ formatCurrency(getAdData(row.product)?.ad_spend, row.product.marketplace) }}
                </td>
                <td class="row-cell whitespace-nowrap px-3">
                  {{ formatCurrency(row.product.target_ad_spend, row.product.marketplace) }}
                </td>
                <td class="row-cell whitespace-nowrap px-3">
                  {{ formatCurrency(getAdData(row.product)?.ad_sales, row.product.marketplace) }}
                </td>
                <td class="row-cell whitespace-nowrap px-3">
                  {{ getAdData(row.product)?.ad_orders ?? '-' }}
                </td>
                <td class="row-cell whitespace-nowrap px-3">
                  {{ formatPercent(getAdData(row.product)?.acos) }}
                </td>
                <td class="row-cell whitespace-nowrap px-3">
                  <span v-if="row.product.target_acos != null">
                    {{ formatPercent(row.product.target_acos) }}
                  </span>
                  <span v-else class="text-muted-foreground">-</span>
                </td>
                <td class="row-cell whitespace-nowrap px-3">
                  {{ row.product.cyber_minigun_actions ?? '-' }}
                </td>
                <td class="row-cell whitespace-nowrap px-3">
                  {{ row.product.cyber_minigun_launch_groups ?? '-' }}
                </td>
                <td class="row-cell whitespace-nowrap px-3">
                  {{ row.product.campaigns_created_by_cyber_minigun ?? '-' }}
                </td>
                <td class="row-cell whitespace-nowrap px-3">
                  {{ row.product.adgroups_created_by_cyber_minigun ?? '-' }}
                </td>
                <td class="row-cell whitespace-nowrap px-3">
                  {{ row.product.smart_campaigns ?? '-' }}
                </td>
                <td class="row-cell whitespace-nowrap px-3">
                  {{ row.product.campaigns_created_by_smart_campaigns ?? '-' }}
                </td>
                <td class="row-cell whitespace-nowrap px-3">
                  {{ row.product.adgroups_created_by_smart_campaigns ?? '-' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Selection action bar -->
    <!-- 移除了"确认更新"按钮 -->
    <div v-if="hasSelection" class="flex items-center gap-3 rounded-md border bg-muted/50 p-3">
      <span class="text-sm font-medium">
        {{ t('raas.actions.selectedProducts', { products: selectedProductCount, rows: selectedRowKeys.size }) }}
      </span>
      <Button size="sm" @click="handleEditSelected">
        {{ t('raas.actions.edit') }}
      </Button>
      <Button size="sm" variant="destructive" @click="handleCancelSelected">
        {{ t('raas.actions.cancelContract') }}
      </Button>
    </div>

    <!-- Pagination -->
    <div class="flex items-center justify-between text-sm text-muted-foreground">
      <div>
        {{ t('raas.table.totalProductsRows', { products: pagination.total, rows: flattenedRows.length }) }}
      </div>
      <div class="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          :disabled="pagination.current <= 1"
          @click="handlePageChange(pagination.current - 1)"
        >
          {{ t('raas.table.previousPage') }}
        </Button>
        <span>
          {{ pagination.current }} / {{ totalPages }}
        </span>
        <Button
          variant="outline"
          size="sm"
          :disabled="pagination.current >= totalPages"
          @click="handlePageChange(pagination.current + 1)"
        >
          {{ t('raas.table.nextPage') }}
        </Button>
      </div>
    </div>

    <!-- Add/Edit Dialog -->
    <Dialog :open="modalOpen" @update:open="modalOpen = $event">
      <DialogContent class="max-w-3xl w-full mx-4 h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{{ modalTitle }}</DialogTitle>
        </DialogHeader>
        <div class="overflow-y-auto flex-1 py-4">
          <div class="grid gap-4 px-2">
            <div class="space-y-2">
              <div class="text-sm text-muted-foreground">
                {{ t('raas.modal.marketplace') }}
              </div>
              <Select v-model="formData.marketplace" :disabled="isEditing">
                <SelectTrigger class="w-full max-w-[calc(100%-2rem)]">
                  <SelectValue :placeholder="t('raas.modal.marketplacePlaceholder')" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="US">
                    US
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="space-y-2">
              <div class="text-sm text-muted-foreground">
                {{ t('raas.modal.hannaOrg') }}
              </div>
              <div ref="hannaOrgDropdownRef" class="relative w-full max-w-[calc(100%-2rem)]">
                <button
                  type="button"
                  :disabled="isEditing || hannaOrgsLoading"
                  class="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  @click="hannaOrgDropdownOpen = !hannaOrgDropdownOpen"
                >
                  <span class="truncate">
                    {{ formData.hanna_org_name || (hannaOrgsLoading ? t('raas.modal.fetching') : t('raas.modal.hannaOrgPlaceholder')) }}
                  </span>
                  <ChevronDown :size="16" class="shrink-0 opacity-50" />
                </button>
                <!-- Dropdown list -->
                <div
                  v-if="hannaOrgDropdownOpen && !isEditing && !hannaOrgsLoading"
                  class="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md"
                >
                  <!-- Search input -->
                  <div class="border-b px-3 py-2">
                    <input
                      v-model="hannaOrgSearch"
                      type="text"
                      :placeholder="t('raas.filter.search')"
                      class="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    >
                  </div>
                  <!-- Options list -->
                  <div class="max-h-60 overflow-y-auto p-1">
                    <!-- Clear option -->
                    <button
                      v-if="formData.hanna_org_name"
                      type="button"
                      class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      @click="formData.hanna_org_name = ''; hannaOrgDropdownOpen = false; hannaOrgSearch = ''"
                    >
                      <X :size="14" class="opacity-50" />
                      {{ t('raas.filter.clear') }}
                    </button>
                    <!-- Filtered options -->
                    <button
                      v-for="org in filteredHannaOrgs"
                      :key="org.hanna_org_name"
                      type="button"
                      class="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                      @click="formData.hanna_org_name = org.hanna_org_name; hannaOrgDropdownOpen = false; hannaOrgSearch = ''"
                    >
                      {{ org.hanna_org_name }}
                    </button>
                    <div v-if="filteredHannaOrgs.length === 0" class="px-2 py-1.5 text-sm text-muted-foreground">
                      {{ t('raas.filter.noResults') }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="space-y-2">
              <div class="text-sm text-muted-foreground">
                {{ t('raas.modal.amazonProfile') }}
              </div>
              <div ref="amazonProfileDropdownRef" class="relative w-full max-w-[calc(100%-2rem)]">
                <button
                  type="button"
                  :disabled="isEditing || amazonProfilesLoading"
                  class="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  @click="amazonProfileDropdownOpen = !amazonProfileDropdownOpen"
                >
                  <span class="truncate">
                    {{ formData.amazon_profile_name || (amazonProfilesLoading ? t('raas.modal.fetching') : t('raas.modal.amazonProfilePlaceholder')) }}
                  </span>
                  <ChevronDown :size="16" class="shrink-0 opacity-50" />
                </button>
                <!-- Dropdown list -->
                <div
                  v-if="amazonProfileDropdownOpen && !isEditing && !amazonProfilesLoading"
                  class="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md"
                >
                  <!-- Search input -->
                  <div class="border-b px-3 py-2">
                    <input
                      v-model="amazonProfileSearch"
                      type="text"
                      :placeholder="t('raas.filter.search')"
                      class="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    >
                  </div>
                  <!-- Options list -->
                  <div class="max-h-60 overflow-y-auto p-1">
                    <!-- Clear option -->
                    <button
                      v-if="formData.amazon_profile_name"
                      type="button"
                      class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      @click="formData.amazon_profile_name = ''; amazonProfileDropdownOpen = false; amazonProfileSearch = ''"
                    >
                      <X :size="14" class="opacity-50" />
                      {{ t('raas.filter.clear') }}
                    </button>
                    <!-- Filtered options -->
                    <button
                      v-for="profile in filteredAmazonProfiles"
                      :key="`${profile.amazon_profile_name}||${profile.hanna_org_name}`"
                      type="button"
                      class="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                      @click="formData.amazon_profile_name = profile.amazon_profile_name; amazonProfileDropdownOpen = false; amazonProfileSearch = ''"
                    >
                      {{ profile.amazon_profile_name }}
                    </button>
                    <div v-if="filteredAmazonProfiles.length === 0" class="px-2 py-1.5 text-sm text-muted-foreground">
                      {{ t('raas.filter.noResults') }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="space-y-2">
              <div class="text-sm text-muted-foreground">
                {{ t('raas.modal.asin') }}
              </div>
              <div class="flex gap-2 items-start">
                <Input v-model="formData.asin" :disabled="isEditing" :placeholder="t('raas.modal.asinPlaceholder')" class="w-40" />
                <Button
                  type="button"
                  variant="secondary"
                  :disabled="keepaLoading || isEditing || !formData.asin"
                  @click="handleFetchKeepaData"
                >
                  {{ keepaLoading ? t('raas.modal.fetchingKeepa') : t('raas.modal.fetchKeepaData') }}
                </Button>
              </div>
            </div>
            <div class="space-y-2">
              <div class="text-sm text-muted-foreground">
                {{ t('raas.modal.category') }}
              </div>
              <!-- Category: Dropdown after keepa fetch, or Input if editing/never fetched -->
              <Select
                v-if="keepaFetched && keepaCategories.length > 0"
                :model-value="formData.category_name"
                :disabled="isEditing || keepaLoading"
                @update:model-value="handleCategoryChange"
              >
                <SelectTrigger class="w-full max-w-[calc(100%-2rem)]">
                  <SelectValue :placeholder="t('raas.modal.categoryPlaceholder')" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    v-for="cat in keepaCategoriesWithRank"
                    :key="cat.category_id"
                    :value="cat.category_name"
                  >
                    {{ formatKeepaCategoryItem(cat) }}
                  </SelectItem>
                </SelectContent>
              </Select>
              <Input
                v-else
                v-model="formData.category_name"
                :disabled="isEditing || keepaLoading"
                :placeholder="t('raas.modal.categoryPlaceholder')"
                class="w-full max-w-[calc(100%-2rem)]"
              />
            </div>
            <div class="space-y-2">
              <div class="flex items-center gap-1 text-sm text-muted-foreground">
                <span>{{ t('raas.modal.baselineRank') }}</span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <button class="inline-flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                        <Info :size="14" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" class="max-w-[320px] whitespace-normal">
                      {{ t('raas.modal.baselineRankTooltip') }}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Input
                :model-value="formData.baseline_sales_rank ?? undefined"
                type="number"
                :disabled="bsrPending || keepaLoading"
                :placeholder="t('raas.modal.baselineRankPlaceholder')"
                class="w-full max-w-[calc(100%-2rem)]"
                @update:model-value="(v: any) => formData.baseline_sales_rank = v === '' || v == null ? null : Number(v)"
              />
            </div>
            <div class="space-y-2">
              <div class="text-sm text-muted-foreground">
                {{ t('raas.modal.raasPlan') }}
              </div>
              <Select v-model="formData.raas_plan" :disabled="isEditing">
                <SelectTrigger class="w-full max-w-[calc(100%-2rem)]">
                  <SelectValue :placeholder="t('raas.modal.raasPlanPlaceholder')" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    v-for="option in raasPlanOptions"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="space-y-2">
              <div class="text-sm text-muted-foreground">
                {{ t('raas.modal.startDate') }}
              </div>
              <Input v-model="formData.start_date" :disabled="isEditing" placeholder="YYYY-MM-DD" class="w-full max-w-[calc(100%-2rem)]" />
            </div>
            <div class="space-y-2">
              <div class="text-sm text-muted-foreground">
                {{ t('raas.modal.endDate') }}
              </div>
              <Input v-model="formData.end_date" placeholder="YYYY-MM-DD" class="w-full max-w-[calc(100%-2rem)]" />
            </div>
            <div v-if="isEditing" class="space-y-2">
              <div class="text-sm text-muted-foreground">
                {{ t('raas.modal.status') }}
              </div>
              <Select v-model="formData.status">
                <SelectTrigger class="w-full max-w-[calc(100%-2rem)]">
                  <SelectValue :placeholder="t('raas.modal.statusPlaceholder')" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    v-for="option in statusOptions"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="space-y-2">
              <div class="text-sm text-muted-foreground">
                {{ t('raas.modal.targetAcos') }}
              </div>
              <div class="relative">
                <Input
                  :model-value="formData.target_acos ?? undefined"
                  type="number"
                  step="0.01"
                  min="0"
                  max="250"
                  :placeholder="t('raas.modal.targetAcosPlaceholder')"
                  class="w-full max-w-[calc(100%-2rem)] pr-8"
                  @update:model-value="(v: any) => formData.target_acos = v === '' || v == null ? null : Number(v)"
                />
                <span class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
              </div>
            </div>
            <div class="space-y-2">
              <div class="text-sm text-muted-foreground">
                {{ t('raas.modal.targetAdSpend') }}
              </div>
              <div class="relative">
                <span class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm z-10">
                  {{ getCurrencySymbol(formData.marketplace) }}
                </span>
                <Input
                  :model-value="formData.target_ad_spend ?? undefined"
                  type="number"
                  step="0.01"
                  min="0"
                  :placeholder="t('raas.modal.targetAdSpendPlaceholder')"
                  class="w-full max-w-[calc(100%-2rem)] pl-7"
                  @update:model-value="(v: any) => formData.target_ad_spend = v === '' || v == null ? null : Number(v)"
                />
              </div>
            </div>
          </div>
          <DialogFooter class="pt-4">
            <Button variant="secondary" @click="modalOpen = false">
              {{ t('raas.modal.cancel') }}
            </Button>
            <Button @click="handleModalOk">
              {{ t('raas.modal.confirm') }}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>

<style scoped>
.row-cell {
  height: 52px;
  vertical-align: middle;
}
</style>
