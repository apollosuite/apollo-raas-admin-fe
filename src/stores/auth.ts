import { defineStore } from 'pinia'

export interface AuthUserProfile {
  username: string
  name?: string
  email?: string
  avatarUrl?: string
  authType?: string
  feishuUserId?: string
  feishuOpenId?: string
  feishuUnionId?: string
  tenantKey?: string
  employeeNo?: string
}

export const useAuthStore = defineStore('user', () => {
  const isLogin = ref(false)
  const token = ref('')
  const username = ref('')
  const name = ref('')
  const email = ref('')
  const avatarUrl = ref('')
  const authType = ref('')
  const sessionChecked = ref(false)

  function setAuth(newToken: string, newUsername: string) {
    token.value = newToken
    username.value = newUsername
    name.value = newUsername
    email.value = ''
    avatarUrl.value = ''
    authType.value = 'password'
    isLogin.value = true
    sessionChecked.value = true
  }

  function setUser(profile: string | AuthUserProfile) {
    const normalized = typeof profile === 'string' ? { username: profile } : profile
    username.value = normalized.username
    name.value = normalized.name || normalized.username
    email.value = normalized.email || ''
    avatarUrl.value = normalized.avatarUrl || ''
    authType.value = normalized.authType || ''
    isLogin.value = true
    sessionChecked.value = true
  }

  function markSessionChecked() {
    sessionChecked.value = true
  }

  function clearAuth() {
    token.value = ''
    username.value = ''
    name.value = ''
    email.value = ''
    avatarUrl.value = ''
    authType.value = ''
    isLogin.value = false
    sessionChecked.value = true
  }

  return {
    isLogin,
    token,
    username,
    name,
    email,
    avatarUrl,
    authType,
    sessionChecked,
    setAuth,
    setUser,
    markSessionChecked,
    clearAuth,
  }
}, {
  persist: true,
})
