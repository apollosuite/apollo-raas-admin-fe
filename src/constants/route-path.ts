import type { RouteLocationRaw } from 'vue-router'

export const RouterPath: Record<string, RouteLocationRaw> = {
  HOME: '/marketing/wecom-leads',
  LOGIN: '/auth/sign-in',
} as const
