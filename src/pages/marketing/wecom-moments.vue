<script setup lang="ts">
import { Eye, Plus, Trash2 } from 'lucide-vue-next'

import { BasicPage } from '@/components/global-layout'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useMarketingApi } from '@/services/api/marketing.api'

const router = useRouter()
const filters = ref({ status: 'all' })
const pagination = ref({ page: 1, page_size: 20 })
const selectedId = ref<string>()
const detailOpen = ref(false)
const deleteId = ref<string>()

const api = useMarketingApi()
const params = computed(() => ({
  ...pagination.value,
  status: filters.value.status === 'all' ? undefined : filters.value.status,
}))
const momentsQuery = api.useGetWeComMoments(params)
const detailQuery = api.useGetWeComMoment(selectedId)
const deleteMutation = api.useDeleteWeComMoment()

const moments = computed(() => momentsQuery.data.value?.items ?? [])
const detail = computed(() => detailQuery.data.value)
const likes = computed(() => detail.value?.interactions.filter(item => item.interaction_type === 'like') ?? [])
const comments = computed(() => detail.value?.interactions.filter(item => item.interaction_type === 'comment') ?? [])

function openDetail(id: string) {
  selectedId.value = id
  detailOpen.value = true
}

function formatDate(value?: string | null) {
  if (!value)
    return '—'
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))
}

function statusVariant(status: string) {
  return status === 'posted' ? 'default' : status === 'error' ? 'destructive' : 'secondary'
}

async function removeMoment(id: string) {
  deleteId.value = id
  try {
    await deleteMutation.mutateAsync(id)
  }
  finally {
    deleteId.value = undefined
  }
}
</script>

<template>
  <BasicPage title="WeCom Moments" description="Create, schedule, and analyze customer Moments.">
    <div class="flex flex-col gap-6">
      <Card>
        <CardHeader class="flex-row items-start justify-between gap-4">
          <div class="flex flex-col gap-1">
            <CardTitle>Moments</CardTitle>
            <CardDescription>Create, schedule, and analyze customer Moments in China Standard Time.</CardDescription>
          </div>
          <Button @click="router.push('/marketing/wecom-moments/create')">
            <Plus data-icon="inline-start" /> Create Moment
          </Button>
        </CardHeader>
        <CardContent class="flex flex-col gap-4">
          <Select v-model="filters.status">
            <SelectTrigger class="w-48">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">
                  All statuses
                </SelectItem>
                <SelectItem value="upcoming">
                  Upcoming
                </SelectItem>
                <SelectItem value="publishing">
                  Publishing
                </SelectItem>
                <SelectItem value="posted">
                  Posted
                </SelectItem>
                <SelectItem value="error">
                  Error
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>

          <div v-if="momentsQuery.isLoading.value" class="flex flex-col gap-2">
            <Skeleton v-for="row in 5" :key="row" class="h-14 w-full" />
          </div>
          <div v-else class="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Moment</TableHead><TableHead>Name</TableHead><TableHead>Status</TableHead>
                  <TableHead>WeCom Accounts</TableHead><TableHead>Category</TableHead><TableHead>Moment Text</TableHead>
                  <TableHead>Scheduled (CST)</TableHead><TableHead>Posted (CST)</TableHead>
                  <TableHead>Likes</TableHead><TableHead>Comments</TableHead><TableHead>Reposts</TableHead><TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="moment in moments" :key="moment.id">
                  <TableCell><img v-if="moment.thumbnail_url" :src="moment.thumbnail_url" alt="Moment thumbnail" class="size-12 rounded-md object-cover"></TableCell>
                  <TableCell class="font-medium">
                    {{ moment.name }}
                  </TableCell>
                  <TableCell>
                    <Badge :variant="statusVariant(moment.status)">
                      {{ moment.status }}<template v-if="moment.status === 'error'">
                        · {{ moment.posted_accounts }}/{{ moment.total_accounts }}
                      </template>
                    </Badge>
                  </TableCell>
                  <TableCell class="max-w-52">
                    {{ moment.account_names.join(', ') }}
                  </TableCell>
                  <TableCell>{{ moment.category }}</TableCell>
                  <TableCell class="max-w-64 truncate">
                    {{ moment.content }}
                  </TableCell>
                  <TableCell>{{ formatDate(moment.scheduled_at) }}</TableCell><TableCell>{{ formatDate(moment.posted_at) }}</TableCell>
                  <TableCell>{{ moment.likes_count }}</TableCell><TableCell>{{ moment.comments_count }}</TableCell>
                  <TableCell>{{ moment.reposts_count ?? 'Not supported' }}</TableCell>
                  <TableCell>
                    <div class="flex gap-2">
                      <Button variant="outline" size="icon" @click="openDetail(moment.id)">
                        <Eye /><span class="sr-only">View</span>
                      </Button>
                      <AlertDialog v-if="moment.status === 'upcoming'">
                        <AlertDialogTrigger as-child>
                          <Button variant="destructive" size="icon" :disabled="deleteId === moment.id">
                            <Trash2 /><span class="sr-only">Delete</span>
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader><AlertDialogTitle>Delete Upcoming Moment?</AlertDialogTitle><AlertDialogDescription>This cancels its scheduled publication. This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Keep Moment</AlertDialogCancel><AlertDialogAction @click="removeMoment(moment.id)">
                              Delete Moment
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
                <TableRow v-if="!moments.length">
                  <TableCell :colspan="12" class="h-32 text-center text-muted-foreground">
                    No Moments found.
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>

    <Sheet v-model:open="detailOpen">
      <SheetContent class="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader><SheetTitle>{{ detail?.name ?? 'Moment details' }}</SheetTitle><SheetDescription>Account-level publication and engagement data.</SheetDescription></SheetHeader>
        <div v-if="detail" class="flex flex-col gap-6 px-4 pb-6">
          <div class="grid grid-cols-2 gap-4 text-sm">
            <div><span class="text-muted-foreground">Audience</span><p>{{ detail.target_count }} customers</p></div>
            <div><span class="text-muted-foreground">Scheduled (CST)</span><p>{{ formatDate(detail.scheduled_at) }}</p></div>
          </div>
          <Tabs default-value="accounts">
            <TabsList>
              <TabsTrigger value="accounts">
                Accounts
              </TabsTrigger><TabsTrigger value="likes">
                Likes
              </TabsTrigger><TabsTrigger value="comments">
                Comments
              </TabsTrigger><TabsTrigger value="reposts">
                Reposts
              </TabsTrigger>
            </TabsList>
            <TabsContent value="accounts">
              <Table>
                <TableHeader><TableRow><TableHead>Account</TableHead><TableHead>Status</TableHead><TableHead>Posted</TableHead><TableHead>Error</TableHead></TableRow></TableHeader><TableBody>
                  <TableRow v-for="item in detail.deliveries" :key="item.userid">
                    <TableCell>{{ item.account_name }}</TableCell><TableCell>
                      <Badge :variant="statusVariant(item.status)">
                        {{ item.status }}
                      </Badge>
                    </TableCell><TableCell>{{ formatDate(item.posted_at) }}</TableCell><TableCell>{{ item.error_message ?? '—' }}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TabsContent>
            <TabsContent value="likes">
              <p v-if="!likes.length" class="py-8 text-center text-muted-foreground">
                No likes reported.
              </p><p v-for="item in likes" :key="`${item.userid}-${item.actor_userid}`" class="py-2">
                {{ item.actor_name ?? item.actor_userid }}
              </p>
            </TabsContent>
            <TabsContent value="comments">
              <p v-if="!comments.length" class="py-8 text-center text-muted-foreground">
                No comments reported.
              </p><div v-for="item in comments" :key="`${item.userid}-${item.actor_userid}-${item.interaction_time}`" class="py-2">
                <strong>{{ item.actor_name ?? item.actor_userid }}</strong><p>{{ item.content }}</p>
              </div>
            </TabsContent>
            <TabsContent value="reposts">
              <p class="py-8 text-center text-muted-foreground">
                Repost identities are not supported by the WeCom API.
              </p>
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  </BasicPage>
</template>
