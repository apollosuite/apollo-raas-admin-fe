import type { AxiosError } from 'axios'

import axios from 'axios'

import { useAuthStore } from '@/stores/auth'
import env from '@/utils/env'

// 全局存储路由器实例的变量
let globalRouter: any = null

// 全局设置路由器实例的函数
export function setGlobalRouter(router: any) {
  globalRouter = router
}

// 创建带拦截器的 axios 实例（内部函数）
function createAxiosInstanceWithInterceptors(timeout: number) {
  const axiosInstance = axios.create({
    baseURL: env.VITE_SERVER_API_URL + env.VITE_SERVER_API_PREFIX,
    timeout,
    paramsSerializer: {
      indexes: null, // 使用 `key=value1&key=value2` 格式而不是 `key[]=value1&key[]=value2`
    },
  })

  axiosInstance.interceptors.request.use((config) => {
    const authStore = useAuthStore()
    if (authStore.token) {
      config.headers.Authorization = `Bearer ${authStore.token}`
    }
    return config
  }, (error) => {
    return Promise.reject(error)
  })

  axiosInstance.interceptors.response.use((response) => {
    return response
  }, (error: AxiosError) => {
    if (error.response?.status === 401) {
      const authStore = useAuthStore()
      authStore.clearAuth()

      // 如果有全局路由器实例，则使用它进行导航，否则回退到传统的页面重定向
      if (globalRouter) {
        globalRouter.push('/auth/sign-in')
      }
      else {
        window.location.href = '/auth/sign-in'
      }
    }
    return Promise.reject(error)
  })

  return axiosInstance
}

// 创建 axios 实例（使用默认超时时间，返回对象格式以保持向后兼容）
export function useAxios() {
  const axiosInstance = createAxiosInstanceWithInterceptors(env.VITE_SERVER_API_TIMEOUT)
  return {
    axiosInstance,
  }
}

// 创建 axios 实例（可自定义超时时间，直接返回实例）
export function createAxiosInstance(timeout: number) {
  return createAxiosInstanceWithInterceptors(timeout)
}
