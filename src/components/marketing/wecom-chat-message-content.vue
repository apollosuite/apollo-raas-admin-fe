<script setup lang="ts">
import { Download, ExternalLink, FileText, RotateCcw, ZoomIn, ZoomOut } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'

import type { WeComChatMessage } from '@/services/types/marketing.type'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const props = defineProps<{
  message: WeComChatMessage
}>()

const imagePreviewOpen = ref(false)
const imageZoom = ref(1)
const mediaUrl = computed(() => props.message.media?.url || '')
const linkUrl = computed(() => props.message.link?.url || '')
const mediaName = computed(() => props.message.media?.filename || props.message.content_text || props.message.msgtype || 'Attachment')
const displayText = computed(() => {
  if (mediaUrl.value || linkUrl.value)
    return ''
  return props.message.content_text || '-'
})

function messageTypeLabel(message: WeComChatMessage) {
  if (message.msgtype === 'text')
    return ''
  return message.msgtype || 'message'
}

function formatBytes(value?: number | null) {
  if (!value)
    return ''

  const units = ['B', 'KB', 'MB', 'GB']
  let size = value
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

function openImagePreview() {
  imageZoom.value = 1
  imagePreviewOpen.value = true
}

function zoomImage(delta: number) {
  imageZoom.value = Math.min(3, Math.max(0.5, Number((imageZoom.value + delta).toFixed(2))))
}

watch(mediaUrl, () => {
  imagePreviewOpen.value = false
  imageZoom.value = 1
})
</script>

<template>
  <div v-if="messageTypeLabel(message)" class="mb-1">
    <Badge variant="secondary">
      {{ messageTypeLabel(message) }}
    </Badge>
  </div>

  <a
    v-if="linkUrl"
    :href="linkUrl"
    target="_blank"
    rel="noreferrer"
    class="block min-w-[240px] max-w-[360px] overflow-hidden rounded-md border bg-background/70 text-left transition-colors hover:bg-accent/50"
  >
    <img
      v-if="message.link?.image_url"
      :src="message.link.image_url"
      :alt="message.link?.title || 'Link preview'"
      class="h-28 w-full object-cover"
      loading="lazy"
    >
    <div class="space-y-1 p-3">
      <div class="flex items-start gap-2">
        <div class="min-w-0 flex-1 font-medium leading-snug">
          {{ message.link?.title || linkUrl }}
        </div>
        <ExternalLink class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      </div>
      <div v-if="message.link?.description" class="line-clamp-2 text-xs text-muted-foreground">
        {{ message.link.description }}
      </div>
      <div class="truncate text-xs text-primary">
        {{ linkUrl }}
      </div>
    </div>
  </a>

  <template v-else-if="mediaUrl">
    <button
      v-if="message.msgtype === 'image' || message.msgtype === 'emotion'"
      type="button"
      class="block cursor-zoom-in rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      @click="openImagePreview"
    >
      <img
        :src="mediaUrl"
        :alt="mediaName"
        class="max-h-[320px] max-w-full rounded-md object-contain"
        loading="lazy"
      >
    </button>

    <Dialog v-if="message.msgtype === 'image' || message.msgtype === 'emotion'" v-model:open="imagePreviewOpen">
      <DialogContent class="max-w-[92vw] gap-3 p-4 sm:max-w-[820px]">
        <DialogHeader class="pr-8">
          <DialogTitle class="truncate text-base">
            {{ mediaName }}
          </DialogTitle>
        </DialogHeader>

        <div class="flex items-center justify-between gap-3">
          <div class="text-xs text-muted-foreground">
            {{ Math.round(imageZoom * 100) }}%
          </div>
          <div class="flex items-center gap-1">
            <Button variant="outline" size="icon-sm" :disabled="imageZoom <= 0.5" @click="zoomImage(-0.25)">
              <ZoomOut class="size-4" />
              <span class="sr-only">Zoom out</span>
            </Button>
            <Button variant="outline" size="icon-sm" @click="imageZoom = 1">
              <RotateCcw class="size-4" />
              <span class="sr-only">Reset zoom</span>
            </Button>
            <Button variant="outline" size="icon-sm" :disabled="imageZoom >= 3" @click="zoomImage(0.25)">
              <ZoomIn class="size-4" />
              <span class="sr-only">Zoom in</span>
            </Button>
          </div>
        </div>

        <div class="flex max-h-[72vh] items-center justify-center overflow-auto rounded-md bg-muted/30 p-3">
          <img
            :src="mediaUrl"
            :alt="mediaName"
            class="h-auto rounded-md object-contain"
            :style="{
              width: `${imageZoom * 100}%`,
              maxWidth: imageZoom <= 1 ? '100%' : 'none',
              maxHeight: imageZoom <= 1 ? '68vh' : 'none',
            }"
          >
        </div>
      </DialogContent>
    </Dialog>

    <video
      v-else-if="message.msgtype === 'video'"
      class="max-h-[360px] max-w-full rounded-md"
      controls
      preload="metadata"
      :src="mediaUrl"
    />

    <audio
      v-else-if="message.msgtype === 'voice'"
      class="w-[260px] max-w-full"
      controls
      preload="metadata"
      :src="mediaUrl"
    />

    <div v-else class="flex min-w-[220px] max-w-[340px] items-center gap-3 rounded-md border bg-background/60 p-3 text-left">
      <div class="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted">
        <FileText class="size-5 text-muted-foreground" />
      </div>
      <div class="min-w-0 flex-1">
        <div class="truncate font-medium">
          {{ mediaName }}
        </div>
        <div class="text-xs text-muted-foreground">
          {{ formatBytes(message.media?.byte_size) || message.media?.fileext || 'File' }}
        </div>
      </div>
      <Button as-child variant="ghost" size="icon-sm">
        <a :href="mediaUrl" target="_blank" rel="noreferrer" :download="message.media?.filename || undefined">
          <Download class="size-4" />
        </a>
      </Button>
    </div>
  </template>

  <div v-else class="whitespace-pre-wrap break-words">
    {{ displayText }}
  </div>
</template>
