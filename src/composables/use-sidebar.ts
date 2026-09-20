import type { Component } from 'vue'

import { BarChart3, Bot, Building2, ChartNoAxesCombined, Handshake, MessageSquareText, PackageCheck, QrCode, Sparkles, UserRoundPlus, UsersRound } from 'lucide-vue-next'

import type { NavGroup } from '@/components/app-sidebar/types'

interface SettingsNavItem {
  title: string
  url: string
  icon: Component
}

export function useSidebar() {
  const settingsNavItems: SettingsNavItem[] = []

  const navData = ref<NavGroup[]> ([
    {
      title: 'Sales',
      items: [
        { title: 'Contacts', url: '/marketing/wecom-customers', icon: UsersRound },
        { title: 'Companies', url: '/sales/companies', icon: Building2 },
        { title: 'Deals', url: '/sales/deals', icon: Handshake },
        { title: 'Orders', url: '/sales/orders', icon: PackageCheck },
        { title: 'Conversations', url: '/marketing/wecom-chat-history', icon: MessageSquareText },
        { title: 'Dashboard', url: '/sales/dashboard', icon: ChartNoAxesCombined },
      ],
    },
    {
      title: 'Marketing',
      items: [
        { title: 'Lead Nurturing', url: '/marketing/wecom-leads', icon: UserRoundPlus },
        { title: 'WeCom Moments', url: '/marketing/wecom-moments', icon: Sparkles },
        { title: 'QR Codes', url: '/marketing/qr-codes', icon: QrCode },
      ],
    },
    {
      title: 'Services',
      items: [
        { title: 'RaaS', url: '/raas/dashboard', icon: ChartNoAxesCombined },
      ],
    },
    {
      title: 'Customer Tracking',
      items: [
        { title: 'Accounts', url: '/customer-tracking/accounts', icon: UsersRound },
        { title: 'Performance', url: '/customer-tracking/performance', icon: BarChart3 },
        { title: 'Agent Analytics', url: '/customer-tracking/agent', icon: Bot },
      ],
    },
  ])

  const otherPages = ref<NavGroup[]>([])

  return {
    navData,
    otherPages,
    settingsNavItems,
  }
}
