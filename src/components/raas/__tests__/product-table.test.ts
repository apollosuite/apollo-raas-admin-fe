import type { Ref } from 'vue'

import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'

import { createAppI18n } from '@/plugins/i18n/setup'
import { useRaasApi } from '@/services/api/raas.api'

import ProductTable from '../product-table.vue'

vi.mock('@/services/api/raas.api')
vi.mock('vue-router', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn() })),
}))
vi.mock('vue-sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(() => 'mock-toast-id'),
  },
}))

// NOTE: the suite previously asserted a legacy API surface (getProducts /
// createProduct / asin_list / progressMap) that product-table.vue no longer has.
// It was rewritten against the current contract: useRaasApi() exposes query hooks
// that return { data, isLoading } and mutation hooks that return { mutate }.
// The 'handles progress tracking' case was dropped with the feature it covered.

const PRODUCT = {
  amazon_profile_name: 'Test Profile',
  hanna_org_name: 'Test Org',
  asin: 'B001',
  category_name: 'Test Category',
  raas_plan: 'Climb Plan',
  start_date: '2024-01-01',
  end_date: '2024-12-31',
  baseline_sales_rank: 1000,
  status: 'ONGOING',
}

describe('productTable', () => {
  let wrapper: any
  let progress: Ref<any>
  let createProduct: any
  let updateProduct: any
  let cancelProduct: any
  let useGetProductProgress: any

  /** The params the component handed to the products query on its latest render. */
  const lastParams = () => {
    const calls = useGetProductProgress.mock.calls
    return calls[calls.length - 1][0].value
  }
  const payloadOf = (fn: any) => fn.mock.calls[0][0]

  beforeEach(() => {
    progress = ref({ items: [], total: 0 })
    createProduct = vi.fn()
    updateProduct = vi.fn()
    cancelProduct = vi.fn()
    useGetProductProgress = vi.fn(() => ({ data: progress, isLoading: ref(false) }))

    const query = () => ({ data: ref({ items: [] }), isLoading: ref(false), refetch: vi.fn() })
    const mutation = (mutate: any) => () => ({ mutate, isPending: ref(false) })

    vi.mocked(useRaasApi).mockReturnValue({
      useGetProductProgress,
      useGetLastUpdateTime: query,
      useGetHannaOrgs: query,
      useGetAmazonProfiles: query,
      useGetKeywordAnalytics: query,
      useCreateProduct: mutation(createProduct),
      useUpdateProduct: mutation(updateProduct),
      useCancelProduct: mutation(cancelProduct),
      useFetchKeepaData: mutation(vi.fn()),
      useTriggerDataUpdate: mutation(vi.fn()),
    } as any)

    wrapper = mount(ProductTable, {
      global: {
        // 'zh' because this suite asserts the Chinese strings below
        plugins: [createPinia(), createAppI18n('zh')],
        stubs: {
          // Stub UI components to avoid complexity
          Badge: true,
          Button: true,
          Checkbox: true,
          Dialog: true,
          DialogContent: true,
          DialogFooter: true,
          DialogHeader: true,
          DialogTitle: true,
          Input: true,
          Select: true,
          SelectContent: true,
          SelectItem: true,
          SelectTrigger: true,
          SelectValue: true,
          Textarea: true,
        },
      },
      props: {
        filters: {},
      },
    })
  })

  it('renders correctly', () => {
    expect(wrapper.exists()).toBe(true)
  })

  it('requests the first page on mount', () => {
    expect(useGetProductProgress).toHaveBeenCalled()
    expect(lastParams()).toEqual({ page: 1, page_size: 20 })
  })

  it('passes filter values through to the products query', async () => {
    await wrapper.setProps({ filters: { amazon_profile_name: 'Test' } })
    await nextTick()

    expect(lastParams()).toEqual({ page: 1, page_size: 20, amazon_profile_name: 'Test' })
  })

  it('omits blank filters and the ad_window, which must not reload the table', async () => {
    await wrapper.setProps({ filters: { amazon_profile_name: '', ad_window: '30' } })
    await nextTick()

    expect(lastParams()).toEqual({ page: 1, page_size: 20 })
  })

  it('opens the modal in create mode', async () => {
    await wrapper.vm.handleAdd()

    expect(wrapper.vm.modalOpen).toBe(true)
    expect(wrapper.vm.modalTitle).toBe('新增产品')
    expect(wrapper.vm.isEditing).toBe(false)
  })

  it('opens the modal prefilled in edit mode', async () => {
    await wrapper.vm.handleEdit(PRODUCT)

    expect(wrapper.vm.modalOpen).toBe(true)
    expect(wrapper.vm.modalTitle).toBe('编辑产品')
    expect(wrapper.vm.isEditing).toBe(true)
    expect(wrapper.vm.formData.amazon_profile_name).toBe('Test Profile')
    expect(wrapper.vm.formData.asin).toBe('B001')
  })

  it('creates a product on submit, converting target ACoS to a decimal', async () => {
    await wrapper.vm.handleAdd()
    wrapper.vm.formData = {
      amazon_profile_name: 'Test Profile',
      hanna_org_name: 'Test Org',
      asin: 'B001',
      category_name: 'Test Category',
      raas_plan: 'Climb Plan',
      start_date: '2024-01-01',
      end_date: '2024-12-31',
      baseline_sales_rank: 1000,
      target_acos: 25,
      target_ad_spend: 10,
      marketplace: 'US',
    }

    await wrapper.vm.handleModalOk()

    expect(createProduct).toHaveBeenCalledTimes(1)
    const payload = payloadOf(createProduct)
    expect(payload).toMatchObject({
      amazon_profile_name: 'Test Profile',
      hanna_org_name: 'Test Org',
      asin: 'B001',
      category_name: 'Test Category',
      raas_plan: 'Climb Plan',
      start_date: '2024-01-01',
      end_date: '2024-12-31',
      baseline_sales_rank: 1000,
      target_acos: 0.25,
      target_ad_spend: 10,
      marketplace: 'US',
    })
    // status is only sent when editing an existing product
    expect(payload.status).toBeUndefined()
  })

  it('updates an existing product, including its status', async () => {
    await wrapper.vm.handleEdit(PRODUCT)
    await wrapper.vm.handleModalOk()

    expect(updateProduct).toHaveBeenCalledTimes(1)
    expect(createProduct).not.toHaveBeenCalled()
    expect(payloadOf(updateProduct)).toMatchObject({
      amazon_profile_name: 'Test Profile',
      asin: 'B001',
      status: 'ONGOING',
    })
  })

  it('cancels the selected rows by composite key', async () => {
    progress.value = { items: [PRODUCT], total: 1 }
    await nextTick()

    wrapper.vm.selectedRowKeys.add(`${wrapper.vm.compositeKey(PRODUCT)}_B001`)
    await wrapper.vm.handleCancelSelected()

    expect(cancelProduct).toHaveBeenCalledTimes(1)
    expect(payloadOf(cancelProduct)).toEqual({
      amazon_profile_name: 'Test Profile',
      hanna_org_name: 'Test Org',
      asin: 'B001',
      category_name: 'Test Category',
      raas_plan: 'Climb Plan',
      start_date: '2024-01-01',
    })
  })

  it('does not cancel a product that is already cancelled', async () => {
    progress.value = { items: [{ ...PRODUCT, status: 'CANCELLED' }], total: 1 }
    await nextTick()

    wrapper.vm.selectedRowKeys.add(`${wrapper.vm.compositeKey(PRODUCT)}_B001`)
    await wrapper.vm.handleCancelSelected()

    expect(cancelProduct).not.toHaveBeenCalled()
  })
})
