'use client'

import { useEffect, useState } from 'react'
import { reportAPI } from '@/lib/api'
import { DashboardData } from '@/types/api'
import { StatsCards } from '@/components/dashboard/stats-cards'
import { StockChart } from '@/components/dashboard/stock-chart'
import { ActivityFeed } from '@/components/dashboard/activity-feed'
import { ProfitLossWidget } from '@/components/dashboard/profit-loss-widget'
import { Skeleton } from '@/components/ui/skeleton'

const emptyData: DashboardData = {
  total_fish_stock_kg: 0,
  raw_fish_stock_kg: 0,
  sorted_fish_stock_kg: 0,
  pending_reviews: 0,
  total_ar: 0,
  total_ap: 0,
  fish_stock_summary: [],
  recent_transactions: [],
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    reportAPI
      .getDashboard()
      .then((d) => {
        const raw = d as DashboardData
        setData({
          ...raw,
          fish_stock_summary: raw.fish_stock_summary ?? [],
          recent_transactions: raw.recent_transactions ?? [],
        })
      })
      .catch(() => setData(emptyData))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="space-y-6">
      <StatsCards data={data} />
      <ProfitLossWidget />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <StockChart data={data.fish_stock_summary} />
        <ActivityFeed transactions={data.recent_transactions} />
      </div>
    </div>
  )
}
