import type { AxiosError } from 'axios'
import type { MaybeRefOrGetter } from 'vue'

import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { toValue } from 'vue'

import { createAxiosInstance, useAxios } from '@/composables/use-axios'

import type {
  AmazonProfileListResponse,
  DataUpdateResponse,
  HannaOrgListResponse,
  KeepaFetchRequest,
  KeepaFetchResponse,
  LastUpdateTimeResponse,
  Product,
  ProductCompositeKey,
  ProductCreate,
  ProductListParams,
  ProductListResponse,
  ProductProgressListResponse,
  ProductUpdate,
} from '../types/raas.type'

export function useRaasApi() {
  const { axiosInstance } = useAxios()
  const queryClient = useQueryClient()

  // Queries
  const useGetProducts = (params: MaybeRefOrGetter<ProductListParams>) => {
    return useQuery({
      queryKey: ['products', params],
      queryFn: async () => {
        const response = await axiosInstance.get('/products', { params: toValue(params) })
        return response.data
      },
      staleTime: 1000 * 60 * 5, // 5 minutes
    })
  }

  // 新增：获取产品进度列表（合并产品信息和进度数据）
  // 注意：不传ad_window参数，一次性获取所有7d/14d/30d的广告数据
  const useGetProductProgress = (params: MaybeRefOrGetter<ProductListParams>) => {
    return useQuery({
      queryKey: ['productProgress', params],
      queryFn: async () => {
        // 排除ad_window参数，一次性获取所有时间窗口的广告数据
        const rawParams = toValue(params)
        const { ad_window, ...restParams } = rawParams as any
        const response = await axiosInstance.get<ProductProgressListResponse>('/product-progress', { params: restParams })
        return response.data
      },
      staleTime: 1000 * 60 * 5, // 5 minutes
    })
  }

  // 新增：获取最后更新时间
  const useGetLastUpdateTime = () => {
    return useQuery({
      queryKey: ['lastUpdateTime'],
      queryFn: async () => {
        const response = await axiosInstance.get<LastUpdateTimeResponse>('/progress/last-update-time')
        return response.data
      },
      staleTime: 1000 * 60 * 1, // 1 minute
    })
  }

  // 新增：获取 Hanna Org 列表（用于新增产品时的级联选择）
  const useGetHannaOrgs = () => {
    return useQuery({
      queryKey: ['hannaOrgs'],
      queryFn: async () => {
        const response = await axiosInstance.get<HannaOrgListResponse>('/hanna-orgs')
        return response.data
      },
      staleTime: 1000 * 60 * 10, // 10 minutes
    })
  }

  // 新增：获取 Amazon Profile 列表（支持按 Hanna Org 筛选）
  const useGetAmazonProfiles = (hannaOrgName?: MaybeRefOrGetter<string | undefined>) => {
    return useQuery({
      queryKey: ['amazonProfiles', hannaOrgName],
      queryFn: async () => {
        const org = toValue(hannaOrgName)
        const params = org ? { hanna_org_name: org } : {}
        const response = await axiosInstance.get<AmazonProfileListResponse>('/amazon-profiles', { params })
        return response.data
      },
      staleTime: 1000 * 60 * 10, // 10 minutes
    })
  }

  // Mutations
  const useCreateProduct = () => {
    return useMutation({
      mutationFn: async (data: ProductCreate) => {
        const response = await axiosInstance.post('/products', data)
        return response.data
      },
      onSuccess: async () => {
        // 先触发数据更新任务
        await axiosInstance.post('/progress/update')
        // 延迟一段时间让后端任务处理，然后刷新数据
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['products'] })
          queryClient.invalidateQueries({ queryKey: ['productProgress'] })
          queryClient.invalidateQueries({ queryKey: ['lastUpdateTime'] })
        }, 2000)
      },
    })
  }

  const useUpdateProduct = () => {
    return useMutation({
      mutationFn: async (data: ProductUpdate) => {
        const response = await axiosInstance.put('/products', data)
        return response.data
      },
      onSuccess: async () => {
        // 先触发数据更新任务
        await axiosInstance.post('/progress/update')
        // 延迟一段时间让后端任务处理，然后刷新数据
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['products'] })
          queryClient.invalidateQueries({ queryKey: ['productProgress'] })
          queryClient.invalidateQueries({ queryKey: ['lastUpdateTime'] })
        }, 2000)
      },
    })
  }

  const useCancelProduct = () => {
    return useMutation({
      mutationFn: async (key: ProductCompositeKey) => {
        await axiosInstance.post('/products/cancel', key)
      },
      onSuccess: async () => {
        // 先触发数据更新任务
        await axiosInstance.post('/progress/update')
        // 延迟一段时间让后端任务处理，然后刷新数据
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['products'] })
          queryClient.invalidateQueries({ queryKey: ['productProgress'] })
          queryClient.invalidateQueries({ queryKey: ['lastUpdateTime'] })
        }, 2000)
      },
    })
  }

  // 新增：获取Keepa产品数据
  const useFetchKeepaData = () => {
    return useMutation({
      mutationFn: async (data: KeepaFetchRequest) => {
        try {
          // Keepa API 响应时间较长，使用更长的超时时间（15秒）
          const longTimeoutInstance = createAxiosInstance(30000)
          const response = await longTimeoutInstance.post('/products/fetch-keepa-data', data)
          return response.data as KeepaFetchResponse
        }
        catch (error) {
          // 将错误信息包装成更详细的格式
          const axiosError = error as AxiosError<any>

          // 构造详细的错误信息
          let errorMessage = '请求失败'

          if (axiosError.code === 'ECONNABORTED' || axiosError.message.includes('timeout')) {
            errorMessage = '请求超时，Keepa API 响应时间过长，请稍后重试'
          }
          else if (axiosError.response) {
            // 服务器返回了错误响应
            const status = axiosError.response.status
            const data = axiosError.response.data as any

            if (data?.detail) {
              errorMessage = `错误 ${status}: ${data.detail}`
            }
            else if (data?.message) {
              errorMessage = `错误 ${status}: ${data.message}`
            }
            else {
              errorMessage = `请求失败，状态码: ${status}`
            }
          }
          else if (axiosError.request) {
            // 请求已发出但没有收到响应
            errorMessage = '网络错误，请检查网络连接'
          }
          else {
            // 其他错误
            errorMessage = axiosError.message || '请求失败'
          }

          // 抛出包含详细信息的错误
          const enhancedError = new Error(errorMessage) as any
          enhancedError.originalError = axiosError
          enhancedError.code = axiosError.code
          enhancedError.status = axiosError.response?.status
          throw enhancedError
        }
      },
    })
  }

  // 新增：触发数据更新任务
  const useTriggerDataUpdate = () => {
    return useMutation({
      mutationFn: async () => {
        const response = await axiosInstance.post<DataUpdateResponse>('/progress/update')
        return response.data
      },
      onSuccess: () => {
        // 刷新最后更新时间和产品进度数据
        queryClient.invalidateQueries({ queryKey: ['lastUpdateTime'] })
        queryClient.invalidateQueries({ queryKey: ['productProgress'] })
      },
    })
  }

  // Legacy methods for compatibility
  const getProducts = async (
    params: ProductListParams = {},
  ): Promise<ProductListResponse> => {
    const response = await axiosInstance.get('/products', { params })
    return response.data
  }

  const createProduct = async (data: ProductCreate): Promise<Product> => {
    const response = await axiosInstance.post('/products', data)
    return response.data
  }

  const updateProduct = async (data: ProductUpdate): Promise<Product> => {
    const response = await axiosInstance.put('/products', data)
    return response.data
  }

  const cancelProduct = async (key: ProductCompositeKey): Promise<void> => {
    await axiosInstance.post('/products/cancel', key)
  }

  // 新增：获取产品进度列表（合并产品信息和进度数据）
  // 注意：不传ad_window参数，一次性获取所有7d/14d/30d的广告数据
  const getProductProgress = async (
    params: ProductListParams = {},
  ): Promise<ProductProgressListResponse> => {
    // 排除ad_window参数，一次性获取所有时间窗口的广告数据
    const { ad_window, ...restParams } = params as any
    const response = await axiosInstance.get('/product-progress', { params: restParams })
    return response.data
  }

  // 新增：获取最后更新时间
  const getLastUpdateTime = async (): Promise<LastUpdateTimeResponse> => {
    const response = await axiosInstance.get<LastUpdateTimeResponse>('/progress/last-update-time')
    return response.data
  }

  // 新增：触发数据更新任务
  const triggerDataUpdate = async (): Promise<DataUpdateResponse> => {
    const response = await axiosInstance.post<DataUpdateResponse>('/progress/update')
    return response.data
  }

  return {
    // Vue Query hooks
    useGetProducts,
    useGetProductProgress,
    useGetLastUpdateTime,
    useGetHannaOrgs,
    useGetAmazonProfiles,
    useCreateProduct,
    useUpdateProduct,
    useCancelProduct,
    useFetchKeepaData,
    useTriggerDataUpdate,

    // Legacy methods for compatibility
    cancelProduct,
    createProduct,
    getProducts,
    getProductProgress,
    updateProduct,
    getLastUpdateTime,
    triggerDataUpdate,
  }
}
