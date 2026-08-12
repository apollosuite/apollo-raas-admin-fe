import { storeToRefs } from 'pinia'

import { useAxios } from '@/composables/use-axios'
import { useAuthStore } from '@/stores/auth'
import env from '@/utils/env'

export function useAuth() {
  const router = useRouter()

  const authStore = useAuthStore()
  const { isLogin } = storeToRefs(authStore)
  const loading = ref(false)
  const error = ref('')
  const defaultHome = '/marketing/wecom-customers'

  function safeRedirectPath(value: unknown) {
    if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
      return defaultHome
    }
    try {
      const parsedRedirect = new URL(value, window.location.origin)
      return parsedRedirect.origin === window.location.origin ? value : defaultHome
    }
    catch {
      return defaultHome
    }
  }

  async function fetchCurrentUser() {
    try {
      const { axiosInstance } = useAxios()
      const response = await axiosInstance.get('/auth/me')
      authStore.setUser({
        username: response.data.username,
        name: response.data.name,
        email: response.data.email,
        avatarUrl: response.data.avatar_url,
        authType: response.data.auth_type,
        feishuUserId: response.data.feishu_user_id,
        feishuOpenId: response.data.feishu_open_id,
        feishuUnionId: response.data.feishu_union_id,
        tenantKey: response.data.tenant_key,
        employeeNo: response.data.employee_no,
      })
      return true
    }
    catch {
      authStore.markSessionChecked()
      return false
    }
  }

  async function logout() {
    try {
      const { axiosInstance } = useAxios()
      await axiosInstance.post('/auth/logout')
    }
    catch {
      // Local logout should still proceed when the server session is already gone.
    }
    authStore.clearAuth()
    router.push({ path: '/auth/sign-in' })
  }

  async function login(username: string, password: string) {
    loading.value = true
    error.value = ''

    try {
      const { axiosInstance } = useAxios()
      const response = await axiosInstance.post('/auth/login', { username, password })
      const { access_token, username: name } = response.data

      authStore.setAuth(access_token, name)

      router.push(safeRedirectPath(router.currentRoute.value.query.redirect))
    }
    catch (e: any) {
      error.value = e?.response?.data?.detail || 'Login failed'
    }
    finally {
      loading.value = false
    }
  }

  function loginWithFeishu() {
    const currentRoute = router.currentRoute.value
    const redirectSource = currentRoute.query.redirect || (
      currentRoute.path.startsWith('/auth')
        ? defaultHome
        : currentRoute.fullPath
    )
    const redirect = safeRedirectPath(redirectSource)
    const apiBase = `${env.VITE_SERVER_API_URL}${env.VITE_SERVER_API_PREFIX}`
    window.location.href = `${apiBase}/auth/feishu/start?redirect=${encodeURIComponent(redirect)}`
  }

  return {
    loading,
    error,
    isLogin,
    logout,
    login,
    loginWithFeishu,
    fetchCurrentUser,
  }
}
