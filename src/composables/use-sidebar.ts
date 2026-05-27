import type { Component } from 'vue'

import { BarChart3, FilePenLine, MessageSquareText, UserRoundPlus, UsersRound } from 'lucide-vue-next'

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
      title: 'Dashboard',
      items: [
        { title: 'RAAS Dashboard', url: '/raas/dashboard', icon: BarChart3 },
      ],
    },
    {
      title: 'Marketing',
      items: [
        { title: 'WeCom Customers', url: '/marketing/wecom-customers', icon: UsersRound },
        { title: 'WeCom Chat History', url: '/marketing/wecom-chat-history', icon: MessageSquareText },
        { title: 'WeCom Leads', url: '/marketing/wecom-leads', icon: UserRoundPlus },
        { title: 'Prompt Editor', url: '/marketing/prompt-editor', icon: FilePenLine },
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
