export type TrackingPage = 'accounts' | 'account-detail' | 'performance' | 'profile' | 'schedules' | 'agent' | 'agent-profile' | 'tool-profiles'
export type RangeKey = '7d' | '30d' | '90d'
export type Status = 'Healthy' | 'Moderate' | 'At Risk' | 'Churned'

export interface ColumnFilter {
  key: string
  value: string
}

export interface Split { sp: number, sb: number, sd: number }
export interface Account {
  id: string
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
  spend: number
  spendSplit: Split
  chats: number
  optEvents: number
  schedRuns: number
  launched: Split
}
export interface Profile {
  id: string
  name: string
  marketplace: string
  entity: string
  account: string
  accountId: string
  plan: string
  joined: string
  lastActive: string
  renewal: string
  adsApi: boolean
  amsApi: boolean
  spApi: boolean
  spend: number
  sales: number
  acos: number
  tacos: number
  orders: number
  impr: number
  clicks: number
  cpc: number
  cvr: number
  schedRuns: number
  activeSched: number
  optEvents: number
  bids: number
  budgets: number
  placements: number
  chats: number
  launched: Split
  targeting: Split
}
export interface Campaign {
  id: string
  profileId: string
  name: string
  adType: string
  managedBy: string[]
  affectedBy: string[]
  launchedBy: string
  spend: number
  sales: number
  acos: number
  orders: number
  impr: number
  clicks: number
  cpc: number
  cvr: number
  optEvents: number
  bids: number
  budgets: number
  placements: number
}
export interface Schedule {
  id: string
  profileId: string
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
  bidsOpt: number
  campLaunched: number
  adGroups: number
  targeting: number
}
export interface ToolStat { tool: string, profilesUsing: number, calls: number, lastCalled: string | null, success: number | null, errors: number }
export interface AgentChat { name: string, date: string, sub: string, first: string, summary: string }
