export type TrackingPage = 'accounts' | 'account-detail' | 'performance' | 'profile' | 'schedules' | 'agent' | 'agent-profile' | 'tool-profiles'
export type RangeKey = '7d' | '30d' | '90d'
export type Status = 'Healthy' | 'Moderate' | 'At Risk' | 'Churned'

export interface ColumnFilter {
  key: string
  value: string
}

export interface Split { sp: number, sb: number, sd: number }
export interface Organization {
  orgId: string
  name: string
  plan: string
  status: Status
  joined: string
  lastActive: string
  renewal: string
  adsConn: [number, number]
  profConn: [number, number]
  subConn: [number, number]
  ams: [number, number]
  sp: [number, number]
  adSpend: number
  adSpendSplit: Split
  chats: number
  optimizationEvents: number
  scheduleRuns: number
  launched: Split
}
export interface AdsAccount {
  amazonAdsAccountId: string
  orgId: string
  name: string
  profiles: [number, number]
  ams: [number, number]
  adSpendSplit: Split
  chats: number
  optimizationEvents: number
  scheduleRuns: number
  launched: Split
}
export interface SubAccount {
  subAccountId: string
  orgId: string
  name: string
  role: string
  lastActive: string
  adsAccess: [number, number]
  profileAccess: [number, number]
  chats: number
  optimizationEvents: number
  scheduleRuns: number
  launched: Split
}
export interface Profile {
  amazonProfileId: string
  name: string
  marketplace: string
  entity: string
  organization: string
  orgId: string
  plan: string
  connectedAt: string
  adsApi: boolean
  amsApi: boolean
  spApi: boolean
  adSpend: number
  adSales: number
  acos: number
  tacos: number
  adOrders: number
  impressions: number
  clicks: number
  cpc: number
  cvr: number
  scheduleRuns: number
  activeSchedules: number
  optimizationEvents: number
  bidsOptimized: number
  budgetsOptimized: number
  placementsOptimized: number
  chats: number
  launched: Split
  targeting: Split
}
export interface Campaign {
  amazonCampaignId: string
  amazonProfileId: string
  name: string
  adType: string
  managedBy: string[]
  affectedBy: string[]
  launchedBy: string
  adSpend: number
  adSales: number
  acos: number
  adOrders: number
  impressions: number
  clicks: number
  cpc: number
  cvr: number
  optimizationEvents: number
  bidsOptimized: number
  budgetsOptimized: number
  placementsOptimized: number
}
export interface Schedule {
  id: string
  amazonProfileId: string
  action: string
  adType: string
  name: string
  status: 'Active' | 'Paused'
  user: string
  alarm: boolean
  created: string
  lastResult: 'Success' | 'Partial' | 'Failed'
  runs: number
  managed: number
  unmanaged: number
  bidsOptimized: number
  campaignsLaunched: number
  adGroups: number
  targeting: number
}
export interface ToolStat { tool: string, profilesUsing: number, calls: number, lastCalled: string | null, success: number | null, errors: number }
export interface AgentChat { name: string, date: string, sub: string, first: string, summary: string }
