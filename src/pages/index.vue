<script setup lang="ts">
import { useRouter } from 'vue-router'

import Loading from '@/components/loading.vue'

const router = useRouter()
router.replace('/marketing/wecom-customers')
</script>

<template>
  <div class="flex items-center justify-center w-screen h-screen">
    <Loading />
  </div>
</template>

<route lang="yaml">
meta:
  layout: false
</route>
