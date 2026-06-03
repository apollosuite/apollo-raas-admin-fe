<script setup lang="ts">
const route = useRoute()
const router = useRouter()

const externalUserid = computed(() => {
  const params = route.params as Record<string, string | string[] | undefined>
  const value = params.external_userid
  return Array.isArray(value) ? value[0] : value
})

watch(
  externalUserid,
  (value) => {
    router.replace({
      path: '/marketing/wecom-chat-history',
      query: {
        ...route.query,
        thread_name: value || undefined,
      },
    })
  },
  { immediate: true },
)
</script>

<template>
  <div class="flex h-screen w-screen items-center justify-center">
    <div class="text-muted-foreground">
      Redirecting...
    </div>
  </div>
</template>

<route lang="yml">
meta:
  auth: true
</route>
