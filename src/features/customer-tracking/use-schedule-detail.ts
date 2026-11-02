/**
 * Data loading for the Performance L3 schedule page.
 *
 * Four aggregates arrive as Arrow over one backend call each, because they answer
 * four different questions and the page can render the cheap ones while the expensive
 * one is still in flight:
 *
 * - campaigns  (per campaign, the table)
 * - targetings (per campaign x targeting, bid schedules only)
 * - daily      (one row per day, the trend)
 * - changelog  (one row per run, the ledger)
 *
 * The change *rows* are a fifth call, made only when a run is expanded. A bid run can
 * hold 5,500 changes and a month can hold 166k; the ledger summarises runs so the page
 * never has to hold them all, and the panel fetches the evidence for the one run the
 * reader opened.
 *
 * Every payload is ingested under a name derived from its scope, never a shared name:
 * DuckDB treats an ingest into an existing relation inconsistently, so a re-used name
 * can serve the previous schedule's numbers while the new response sits on the wire.
 */

import { ref } from 'vue'

import { isArrowTableLoaded, loadArrowDataset, runQuery } from '@/services/mosaic'

import type { ChangelogChange, ChangelogRun, ScheduleCampaign, ScheduleDailyPoint, ScheduleTargeting, ScheduleWindows } from './schedule-detail'

import { hasChangelog, hasTargeting, placementMoves, scheduleFamily } from './schedule-detail'
import { fetchArrow, hashIds } from './use-dashboard-data'

function scopeHash(...parts: string[]): string {
  return hashIds(parts)
}

export function useScheduleDetail() {
  const campaigns = ref<ScheduleCampaign[]>([])
  const targetings = ref<ScheduleTargeting[]>([])
  const daily = ref<ScheduleDailyPoint[]>([])
  const changelogRuns = ref<ChangelogRun[]>([])
  /** The selected run's changes, largest move first. */
  const changes = ref<ChangelogChange[]>([])
  const selectedRun = ref<string | null>(null)
  const loading = ref(false)
  const changesLoading = ref(false)
  const error = ref<string | null>(null)

  /** What the data on screen belongs to, so a stale response cannot overwrite it. */
  let loadedKey: string | null = null
  let scope: { actionType: string, actionId: string, windows: ScheduleWindows } | null = null
  let changesRequest = 0
  const changesCache = new Map<string, ChangelogChange[]>()

  function clear(): void {
    campaigns.value = []
    targetings.value = []
    daily.value = []
    changelogRuns.value = []
    changes.value = []
    selectedRun.value = null
    changesRequest++
    changesCache.clear()
  }

  async function ingest(name: string, bytes: Uint8Array): Promise<string> {
    if (!isArrowTableLoaded(name))
      await loadArrowDataset(name, bytes)
    return name
  }

  async function load(actionType: string, actionId: string, windows: ScheduleWindows): Promise<void> {
    if (!actionType || !actionId)
      return
    const family = scheduleFamily(actionType)
    if (!family) {
      error.value = `Unknown action type: ${actionType}`
      return
    }
    const key = [actionType, actionId, windows.performance.from, windows.performance.to, windows.changelog.from, windows.changelog.to].join('|')
    if (loadedKey === key)
      return

    const suffix = scopeHash(...key.split('|'))
    const scopeNow = { actionType, actionId, windows }
    scope = scopeNow
    loading.value = true
    error.value = null
    clear()

    const perf = new URLSearchParams({
      action_type: actionType,
      action_id: actionId,
      from: windows.performance.from,
      to: windows.performance.to,
    })
    const log = new URLSearchParams({
      action_type: actionType,
      action_id: actionId,
      from: windows.changelog.from,
      to: windows.changelog.to,
    })
    const wantsTargeting = hasTargeting(actionType)
    const wantsChangelog = hasChangelog(actionType)

    const results = await Promise.allSettled([
      fetchArrow(`/customer-tracking/performance/schedule/campaigns?${perf.toString()}`),
      wantsTargeting
        ? fetchArrow(`/customer-tracking/performance/schedule/targetings?${perf.toString()}`)
        : Promise.resolve(null),
      fetchArrow(`/customer-tracking/performance/schedule/daily?${perf.toString()}`),
      wantsChangelog
        ? fetchArrow(`/customer-tracking/performance/schedule/changelog/runs?${log.toString()}`)
        : Promise.resolve(null),
    ])

    const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
    if (failure)
      error.value = failure.reason instanceof Error ? failure.reason.message : String(failure.reason)

    try {
      const campaignRows = results[0].status === 'fulfilled'
        ? await ingest(`schedule_campaigns_${suffix}`, results[0].value)
        : null
      const targetingRows = results[1].status === 'fulfilled' && results[1].value
        ? await ingest(`schedule_targetings_${suffix}`, results[1].value)
        : null
      const dailyRows = results[2].status === 'fulfilled'
        ? await ingest(`schedule_daily_${suffix}`, results[2].value)
        : null
      const runRows = results[3].status === 'fulfilled' && results[3].value
        ? await ingest(`schedule_changelog_${suffix}`, results[3].value)
        : null

      // The scope may have moved on while the bytes were in flight; the new scope's
      // load owns the refs.
      if (scope !== scopeNow)
        return

      const [campaignData, targetingData, dailyData, runData] = await Promise.all([
        campaignRows
          ? runQuery<ScheduleCampaign>(`SELECT amazon_campaign_id AS campaignId,
              amazon_campaign_name AS campaignName,
              state, budget, targets,
              days_active AS daysActive,
              impressions, clicks,
              ad_orders AS adOrders,
              ad_spend AS adSpend,
              ad_sales AS adSales
         FROM "${campaignRows}"`)
          : [],
        targetingRows
          ? runQuery<ScheduleTargeting>(`SELECT amazon_campaign_id AS campaignId,
              amazon_campaign_name AS campaignName,
              amazon_adgroup_id AS adgroupId,
              amazon_target_id AS targetId,
              target_expression AS targetExpression,
              match_type AS matchType,
              impressions, clicks,
              ad_orders AS adOrders,
              ad_spend AS adSpend,
              ad_sales AS adSales
         FROM "${targetingRows}"`)
          : [],
        dailyRows
          ? runQuery<ScheduleDailyPoint>(`SELECT date, campaigns, targets, impressions, clicks,
              ad_orders AS adOrders,
              ad_spend AS adSpend,
              ad_sales AS adSales
         FROM "${dailyRows}" ORDER BY date`)
          : [],
        runRows
          ? runQuery<ChangelogRun>(`SELECT run_time AS runTime, logged, changes, entities, raised, lowered,
              median_abs_pct AS medianAbsPct,
              pp_changes AS ppChanges,
              tos_changes AS tosChanges,
              ros_changes AS rosChanges
         FROM "${runRows}" ORDER BY runTime DESC`)
          : [],
      ])

      if (scope !== scopeNow)
        return
      campaigns.value = campaignData
      targetings.value = targetingData
      daily.value = dailyData
      changelogRuns.value = runData
      loadedKey = key
    }
    catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    }
    finally {
      if (scope === scopeNow)
        loading.value = false
    }
  }

  /** Expand one run: fetch its changes once, then reuse them. */
  async function selectRun(runTime: string | null): Promise<void> {
    if (!scope)
      return
    if (runTime === null || selectedRun.value === runTime) {
      selectedRun.value = null
      return
    }
    selectedRun.value = runTime
    changes.value = []
    const cached = changesCache.get(runTime)
    if (cached) {
      changes.value = cached
      return
    }
    if (!hasChangelog(scope.actionType))
      return

    const request = ++changesRequest
    changesLoading.value = true
    const current = scope
    const { actionType, actionId, windows } = current
    const params = new URLSearchParams({
      action_type: actionType,
      action_id: actionId,
      run_time: runTime,
      from: windows.changelog.from,
      to: windows.changelog.to,
    })
    try {
      const bytes = await fetchArrow(`/customer-tracking/performance/schedule/changelog/rows?${params.toString()}`)
      const table = await ingest(`schedule_changes_${scopeHash(actionType, actionId, runTime)}`, bytes)
      const rows = await runQuery<Record<string, any>>(changeSelect(actionType, table))
      if (request !== changesRequest)
        return
      const mapped = rows.map(row => toChange(actionType, row))
      changesCache.set(runTime, mapped)
      changes.value = mapped
    }
    catch (e) {
      if (request === changesRequest)
        error.value = e instanceof Error ? e.message : String(e)
    }
    finally {
      if (request === changesRequest)
        changesLoading.value = false
    }
  }

  return { campaigns, targetings, daily, changelogRuns, changes, selectedRun, loading, changesLoading, error, load, selectRun }
}

/** The family's change columns, aliased to the shape the UI reads. */
function changeSelect(actionType: string, table: string): string {
  const family = scheduleFamily(actionType)
  if (family === 'bid') {
    return `SELECT run_time AS runTime,
              amazon_target_id AS targetId,
              match_type AS matchType,
              target_type AS targetType,
              target_expression AS targetExpression,
              sponsored_ads_type AS sponsoredAdsType,
              bid_old AS oldValue,
              bid_new AS newValue
         FROM "${table}"`
  }
  if (family === 'budget') {
    return `SELECT run_time AS runTime,
              amazon_campaign_id AS campaignId,
              amazon_campaign_name AS campaignName,
              budget_old AS oldValue,
              budget_new AS newValue
         FROM "${table}"`
  }
  return `SELECT run_time AS runTime,
            amazon_campaign_id AS campaignId,
            amazon_campaign_name AS campaignName,
            tos_old AS tosOld, tos_new AS tosNew,
            ros_old AS rosOld, ros_new AS rosNew,
            pp_old AS ppOld, pp_new AS ppNew
       FROM "${table}"`
}

function toChange(actionType: string, row: Record<string, any>): ChangelogChange {
  if (scheduleFamily(actionType) === 'placement') {
    return {
      runTime: String(row.runTime ?? ''),
      campaignId: row.campaignId ?? null,
      campaignName: row.campaignName ?? null,
      placements: placementMoves(row),
    }
  }
  return {
    runTime: String(row.runTime ?? ''),
    campaignId: row.campaignId ?? null,
    campaignName: row.campaignName ?? null,
    targetId: row.targetId ?? null,
    targetExpression: row.targetExpression ?? null,
    matchType: row.matchType ?? null,
    targetType: row.targetType ?? null,
    sponsoredAdsType: row.sponsoredAdsType ?? null,
    oldValue: row.oldValue ?? null,
    newValue: row.newValue ?? null,
  }
}
