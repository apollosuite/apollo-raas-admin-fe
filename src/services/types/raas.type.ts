export interface Product {
  amazon_profile_name: string
  hanna_org_name: string
  asin: string
  category_name: string
  raas_plan: string
  start_date: string
  end_date: string
  baseline_sales_rank?: number | null
  target_acos?: number | null
  target_ad_spend?: number | null
  status?: string
  marketplace?: string
}

export interface ProductCreate {
  amazon_profile_name: string
  hanna_org_name: string
  asin: string
  category_name: string
  raas_plan: string
  start_date: string
  end_date: string
  baseline_sales_rank?: number | null
  target_acos?: number | null
  target_ad_spend?: number | null
  status?: string
  marketplace?: string
}

export interface ProductUpdate {
  amazon_profile_name: string
  hanna_org_name: string
  asin: string
  category_name: string
  raas_plan: string
  start_date: string
  end_date: string
  baseline_sales_rank?: number | null
  target_acos?: number | null
  target_ad_spend?: number | null
  status?: string
  marketplace?: string
}

export interface ProductCompositeKey {
  amazon_profile_name: string
  hanna_org_name: string
  asin: string
  category_name: string
  raas_plan: string
  start_date: string
  marketplace?: string
}

export type AdWindow = '7d' | '14d' | '30d' | 'rt'

export interface ProductFilter {
  amazon_profile_name?: string[]
  hanna_org_name?: string[]
  raas_plan?: string
  category_name?: string[]
  status?: string[]
  marketplace?: string
  ad_window?: AdWindow
  start_date_from?: string
  start_date_to?: string
  end_date_from?: string
  end_date_to?: string
}

export interface ProductListResponse {
  items: Product[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export interface ProductListParams extends ProductFilter {
  page?: number
  page_size?: number
}

// 新增：广告数据（包含所有时间窗口）
export interface AdData {
  ad_spend?: number
  ad_sales?: number
  ad_orders?: number
  acos?: number
}

// 新增：合并后的产品进度类型（包含产品信息和进度数据）
export interface ProductProgress {
  // 产品基本信息
  amazon_profile_name: string
  hanna_org_name: string
  asin: string
  category_name: string
  raas_plan: string
  start_date: string
  end_date: string
  baseline_sales_rank?: number | null
  target_acos?: number | null
  target_ad_spend?: number | null
  status?: string
  marketplace?: string
  // 进度数据
  img_url?: string
  days_remaining?: number
  current_sales_rank?: number
  climb_days_met?: number
  days_taken?: number
  final_status_date?: string
  // 赛博加特林数据（非广告窗口相关）
  cyber_minigun_actions?: number
  cyber_minigun_launch_groups?: number
  campaigns_created_by_cyber_minigun?: number
  adgroups_created_by_cyber_minigun?: number
  smart_campaigns?: number
  campaigns_created_by_smart_campaigns?: number
  adgroups_created_by_smart_campaigns?: number
  // 广告数据 - 扁平字段格式（后端返回）
  // 7天
  ad_spend_7d?: number
  ad_sales_7d?: number
  ad_orders_7d?: number
  acos_7d?: number
  // 14天
  ad_spend_14d?: number
  ad_sales_14d?: number
  ad_orders_14d?: number
  acos_14d?: number
  // 30天
  ad_spend_30d?: number
  ad_sales_30d?: number
  ad_orders_30d?: number
  acos_30d?: number
  // Today So Far (当天至今)
  ad_spend_rt?: number
  ad_sales_rt?: number
  ad_orders_rt?: number
  acos_rt?: number
}

// 新增：产品进度列表响应
export interface ProductProgressListResponse {
  items: ProductProgress[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

// 新增：数据更新相关类型
export interface DataUpdateResponse {
  success: boolean
  message: string
  updated_at?: string
}

export interface LastUpdateTimeResponse {
  last_updated_at: string | null
}

// 新增：Keepa API 相关类型
export interface KeepaCategory {
  category_id: number
  category_name: string
  sales_rank: number | null
  keepa_time: string // Keepa 获取到该排名的日期时间
}

export interface KeepaFetchRequest {
  asin: string
  raas_start_date?: string // 可选，用于计算 baseline sales rank
}

export interface KeepaFetchResponse {
  success: boolean
  asin: string
  categories: KeepaCategory[]
  message?: string
}

// 新增：Hanna Org 相关类型
export interface HannaOrg {
  hanna_org_name: string
}

export interface HannaOrgListResponse {
  items: HannaOrg[]
  total: number
}

// 新增：Amazon Profile 相关类型（包含关联的 Hanna Org）
export interface AmazonProfile {
  amazon_profile_name: string
  hanna_org_name: string
}

export interface AmazonProfileListResponse {
  items: AmazonProfile[]
  total: number
}
