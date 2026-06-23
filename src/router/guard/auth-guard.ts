import type { Router } from 'vue-router'

import axios from 'axios'
import { storeToRefs } from 'pinia'

import pinia from '@/plugins/pinia/setup'
import { useAuthStore } from '@/stores/auth'
import env from '@/utils/env'

export function authGuard(router: Router) {
  router.beforeEach(async (to, _from) => {
    const authStore = useAuthStore(pinia)
    const { isLogin } = storeToRefs(authStore)

    if (to.meta.auth && !unref(isLogin)) {
      try {
        const headers = authStore.token
          ? { Authorization: `Bearer ${authStore.token}` }
          : undefined
        const response = await axios.get(
          `${env.VITE_SERVER_API_URL}${env.VITE_SERVER_API_PREFIX}/auth/me`,
          { headers, withCredentials: true },
        )
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
      }
      catch {
        authStore.markSessionChecked()
      }
    }

    // If the page requires login but the user is not logged in, redirect to the login page and record the original target page.
    if (to.meta.auth && !unref(isLogin) && to.path !== '/auth/sign-in') {
      return {
        path: '/auth/sign-in',
        query: { redirect: to.fullPath },
      }
    }
  })
}
