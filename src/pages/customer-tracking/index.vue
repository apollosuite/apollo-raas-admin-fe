<script setup lang="ts">
const router = useRouter()
router.replace('/customer-tracking/accounts')
</script>

<template>
  <div class="tracking-redirect">
    Redirecting…
  </div>
</template>

<route lang="yml">
meta:
  auth: true
  layout: false
</route>
