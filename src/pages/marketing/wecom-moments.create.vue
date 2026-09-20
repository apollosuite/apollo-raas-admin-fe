<script setup lang="ts">
import { ArrowLeft, ImagePlus } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

import type { WeComMomentAccount, WeComMomentAudienceRequest } from '@/services/types/marketing.type'

import { BasicPage } from '@/components/global-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { useMarketingApi } from '@/services/api/marketing.api'

const router = useRouter()
const api = useMarketingApi()
const accountsQuery = api.useGetWeComMomentAccounts()
const tagsQuery = api.useGetWeComMomentTags()
const previewMutation = api.usePreviewWeComMomentAudience()
const createMutation = api.useCreateWeComMoment()

const form = reactive({
  name: '',
  category: '',
  content: '',
  scheduledAt: '',
  audienceMode: 'filter' as const,
  accountUserids: [] as string[],
  tagIdsText: '',
})
const files = ref<File[]>([])
const imageError = ref('')
const touched = ref(false)
const preview = computed(() => previewMutation.data.value)
const accounts = computed<WeComMomentAccount[]>(() => accountsQuery.data.value ?? [])
const enterpriseTags = computed(() => tagsQuery.data.value ?? [])
const contentByteLength = computed(() => new TextEncoder().encode(form.content).length)

function cstDate(value: string) {
  return value ? new Date(`${value}:00+08:00`) : undefined
}

const errors = computed(() => ({
  name: !form.name.trim() || form.name.trim().length > 256 ? 'Enter a name of at most 256 characters.' : '',
  category: !form.category.trim() ? 'Content Category is required.' : '',
  content: !form.content.trim() || new TextEncoder().encode(form.content.trim()).length > 4000 ? 'Enter Moment Text of at most 4000 UTF-8 bytes.' : '',
  accounts: !form.accountUserids.length ? 'Select at least one WeCom Account.' : '',
  schedule: !cstDate(form.scheduledAt) || cstDate(form.scheduledAt)!.getTime() <= Date.now() ? 'Choose a future date and time in CST.' : '',
  images: imageError.value || (files.value.length < 1 || files.value.length > 9 ? 'Upload between 1 and 9 images.' : ''),
  audience: !tagIds().length ? 'Select at least one enterprise customer tag.' : '',
}))
const isValid = computed(() => Object.values(errors.value).every(value => !value))

function tagIds() {
  return [...new Set(form.tagIdsText.split(/[\s,]+/).map(value => value.trim()).filter(Boolean))]
}

function toggleTag(id: string, checked: boolean | 'indeterminate') {
  const selected = tagIds()
  form.tagIdsText = (checked === true ? [...new Set([...selected, id])] : selected.filter(item => item !== id)).join(', ')
}

function audienceRequest(): WeComMomentAudienceRequest {
  return {
    mode: form.audienceMode,
    external_userids: [],
    filters: { tag_ids: tagIds() },
    account_userids: form.accountUserids,
  }
}

function toggleAccount(userid: string, checked: boolean | 'indeterminate') {
  form.accountUserids = checked === true
    ? [...new Set([...form.accountUserids, userid])]
    : form.accountUserids.filter(item => item !== userid)
}

function loadImageDimensions(file: File) {
  return new Promise<{ width: number, height: number }>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: image.naturalWidth, height: image.naturalHeight })
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Invalid image'))
    }
    image.src = url
  })
}

async function pickImages(event: Event) {
  const input = event.target as HTMLInputElement
  const selected = [...(input.files ?? [])]
  imageError.value = ''
  files.value = []
  if (selected.length < 1 || selected.length > 9) {
    imageError.value = 'Upload between 1 and 9 images.'
    toast.error(imageError.value)
    input.value = ''
    return
  }
  const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
  if (selected.some(file => !allowedTypes.has(file.type))) {
    imageError.value = 'Images must be JPEG, PNG, GIF, or WebP.'
    toast.error(imageError.value)
    input.value = ''
    return
  }
  if (selected.some(file => file.size > 10 * 1024 * 1024)) {
    imageError.value = 'Each image must be 10 MB or smaller.'
    toast.error(imageError.value)
    input.value = ''
    return
  }
  try {
    const dimensions = await Promise.all(selected.map(loadImageDimensions))
    if (dimensions.some(({ width, height }) => Math.max(width, height) > 10800 || Math.min(width, height) > 1080)) {
      imageError.value = 'Each image must have a long side of at most 10800 px and a short side of at most 1080 px.'
      toast.error(imageError.value)
      input.value = ''
      return
    }
  }
  catch {
    imageError.value = 'One or more selected files are not valid images.'
    toast.error(imageError.value)
    input.value = ''
    return
  }
  files.value = selected
}

async function previewAudience() {
  try {
    await previewMutation.mutateAsync(audienceRequest())
  }
  catch {
    toast.error('Could not preview this audience.')
  }
}

async function submit() {
  touched.value = true
  if (!isValid.value)
    return
  const payload = new FormData()
  payload.set('name', form.name.trim())
  payload.set('category', form.category.trim())
  payload.set('content', form.content.trim())
  payload.set('scheduled_at', cstDate(form.scheduledAt)!.toISOString())
  payload.set('account_userids', JSON.stringify(form.accountUserids))
  const audience = audienceRequest()
  payload.set('audience_mode', audience.mode)
  payload.set('external_userids', JSON.stringify(audience.external_userids))
  payload.set('audience_filters', JSON.stringify(audience.filters))
  files.value.forEach(file => payload.append('images', file))
  try {
    await createMutation.mutateAsync(payload)
    toast.success('Moment scheduled.')
    await router.push('/marketing/wecom-moments')
  }
  catch { toast.error('Could not schedule the Moment. Check the form and try again.') }
}
</script>

<template>
  <BasicPage title="Create WeCom Moment" description="Configure content, audience, accounts, and schedule.">
    <Card class="mx-auto max-w-4xl">
      <CardHeader><CardTitle>Create Moment</CardTitle><CardDescription>All schedule times are shown in China Standard Time (UTC+8).</CardDescription></CardHeader>
      <CardContent>
        <form id="moment-form" @submit.prevent="submit">
          <FieldGroup>
            <Field :data-invalid="touched && !!errors.name">
              <FieldLabel for="moment-name">
                Moment Name
              </FieldLabel><Input id="moment-name" v-model="form.name" maxlength="256" :aria-invalid="touched && !!errors.name" /><FieldError v-if="touched && errors.name">
                {{ errors.name }}
              </FieldError>
            </Field>
            <Field :data-invalid="touched && !!errors.category">
              <FieldLabel for="moment-category">
                Content Category
              </FieldLabel><Input id="moment-category" v-model="form.category" :aria-invalid="touched && !!errors.category" /><FieldDescription>Required free-text category used for performance analysis.</FieldDescription><FieldError v-if="touched && errors.category">
                {{ errors.category }}
              </FieldError>
            </Field>
            <Field :data-invalid="touched && !!errors.content">
              <FieldLabel for="moment-text">
                Moment Text
              </FieldLabel><Textarea id="moment-text" v-model="form.content" rows="6" :aria-invalid="touched && !!errors.content" /><FieldDescription>{{ contentByteLength }} / 4000 UTF-8 bytes</FieldDescription><FieldError v-if="touched && errors.content">
                {{ errors.content }}
              </FieldError>
            </Field>

            <FieldSet>
              <FieldLegend variant="label">
                WeCom Accounts
              </FieldLegend><FieldDescription>Select one or more employees who will receive the WeCom Moment task.</FieldDescription><FieldGroup data-slot="checkbox-group">
                <Field v-for="account in accounts" :key="account.userid" orientation="horizontal">
                  <Checkbox :id="`account-${account.userid}`" :model-value="form.accountUserids.includes(account.userid)" @update:model-value="toggleAccount(account.userid, $event)" /><FieldLabel :for="`account-${account.userid}`" class="font-normal">
                    {{ account.name }} ({{ account.userid }})
                  </FieldLabel>
                </Field>
              </FieldGroup><FieldError v-if="touched && errors.accounts">
                {{ errors.accounts }}
              </FieldError>
            </FieldSet>

            <FieldSet>
              <FieldLegend variant="label">
                Customers
              </FieldLegend><FieldDescription>The task sends only to selected accounts that follow at least one customer with a selected enterprise tag. Those accounts' posts are visible only to matching tagged customers.</FieldDescription>
              <FieldSet>
                <FieldLegend variant="label">
                  Enterprise customer tags
                </FieldLegend><FieldGroup data-slot="checkbox-group">
                  <Field v-for="tag in enterpriseTags" :key="tag.id" orientation="horizontal">
                    <Checkbox :id="`tag-${tag.id}`" :model-value="tagIds().includes(tag.id)" @update:model-value="toggleTag(tag.id, $event)" /><FieldLabel :for="`tag-${tag.id}`" class="font-normal">
                      {{ tag.group_name }} / {{ tag.name }}
                    </FieldLabel>
                  </Field>
                </FieldGroup><FieldError v-if="touched && errors.audience">
                  {{ errors.audience }}
                </FieldError>
              </FieldSet>
              <Button type="button" variant="outline" :disabled="previewMutation.isPending.value" @click="previewAudience">
                <Spinner v-if="previewMutation.isPending.value" data-icon="inline-start" />Preview audience
              </Button>
              <FieldDescription v-if="preview">
                Estimated matching customers followed by the selected accounts: {{ preview.total }}. {{ preview.items.map(item => item.name ?? item.external_userid).join(', ') }} WeCom applies the application visibility range again when creating the task.
              </FieldDescription>
            </FieldSet>

            <Field :data-invalid="touched && !!errors.images">
              <FieldLabel for="moment-images">
                Images
              </FieldLabel><Input id="moment-images" type="file" accept="image/jpeg,image/png,image/gif,image/webp" multiple @change="pickImages" /><FieldDescription><ImagePlus class="inline" /> {{ files.length }} selected; 1–9 images, up to 10 MB each.</FieldDescription><FieldError v-if="touched && errors.images">
                {{ errors.images }}
              </FieldError>
            </Field>
            <Field :data-invalid="touched && !!errors.schedule">
              <FieldLabel for="moment-schedule">
                Schedule Date & Time (CST)
              </FieldLabel><Input id="moment-schedule" v-model="form.scheduledAt" type="datetime-local" :aria-invalid="touched && !!errors.schedule" /><FieldError v-if="touched && errors.schedule">
                {{ errors.schedule }}
              </FieldError>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter class="justify-between">
        <Button variant="outline" @click="router.back()">
          <ArrowLeft data-icon="inline-start" />Back
        </Button><Button type="submit" form="moment-form" :disabled="createMutation.isPending.value || !isValid">
          <Spinner v-if="createMutation.isPending.value" data-icon="inline-start" />Confirm and schedule
        </Button>
      </CardFooter>
    </Card>
  </BasicPage>
</template>
