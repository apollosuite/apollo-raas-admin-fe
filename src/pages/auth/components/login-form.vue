<script lang="ts" setup>
import { useAuth } from '@/composables/use-auth'

const username = ref('')
const password = ref('')
const feishuLoading = ref(false)
const { login, loginWithFeishu, loading, error } = useAuth()

function handleLogin() {
  login(username.value, password.value)
}

function handleFeishuLogin() {
  feishuLoading.value = true
  loginWithFeishu()
}
</script>

<template>
  <UiCard class="w-full max-w-sm">
    <UiCardHeader>
      <UiCardTitle class="text-2xl">
        Apollo Admin Login
      </UiCardTitle>
      <UiCardDescription>
        Sign in with your Apollo Feishu account.
      </UiCardDescription>
    </UiCardHeader>
    <UiCardContent class="grid gap-4">
      <div v-if="error" class="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
        {{ error }}
      </div>

      <UiButton type="button" class="w-full" :disabled="feishuLoading" @click="handleFeishuLogin">
        <UiSpinner v-if="feishuLoading" class="mr-2" />
        Continue with Feishu
      </UiButton>

      <div class="relative py-2">
        <div class="absolute inset-0 flex items-center">
          <span class="w-full border-t" />
        </div>
        <div class="relative flex justify-center text-xs uppercase">
          <span class="bg-card px-2 text-muted-foreground">Password fallback</span>
        </div>
      </div>

      <form class="grid gap-4" @submit.prevent="handleLogin">
        <div class="grid gap-2">
          <UiLabel for="username">
            Username
          </UiLabel>
          <UiInput
            id="username"
            v-model="username"
            type="text"
            placeholder="admin"
            required
            autocomplete="username"
          />
        </div>
        <div class="grid gap-2">
          <UiLabel for="password">
            Password
          </UiLabel>
          <UiInput
            id="password"
            v-model="password"
            type="password"
            required
            placeholder="*********"
            autocomplete="current-password"
          />
        </div>

        <UiButton type="submit" class="w-full" :disabled="loading">
          <UiSpinner v-if="loading" class="mr-2" />
          Login
        </UiButton>
      </form>
    </UiCardContent>
  </UiCard>
</template>
