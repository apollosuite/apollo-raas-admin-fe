import dayjs from 'dayjs'
import { ref } from 'vue'

export interface DateRange {
  from: string
  to: string
}

const today = () => dayjs().format('YYYY-MM-DD')
const daysAgo = (n: number) => dayjs().subtract(n, 'day').format('YYYY-MM-DD')

// Global reporting period shared across all customer-tracking pages.
const dateRange = ref<DateRange>({ from: daysAgo(29), to: today() })

export function useFilterContext() {
  function setDateRange(range: DateRange) {
    dateRange.value = range
  }

  function setPreset(days: number) {
    dateRange.value = { from: daysAgo(days - 1), to: today() }
  }

  return { dateRange, setDateRange, setPreset }
}
