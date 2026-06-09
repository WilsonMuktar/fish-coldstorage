'use client'

import { useEffect, useState } from 'react'
import { reportAPI } from '@/lib/api'
import { ProfitLossStats } from '@/types/api'
import { Skeleton } from '@/components/ui/skeleton'
import { TrendingUp, TrendingDown, ShoppingCart, Receipt, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatIDR } from '@/lib/formatters'

type Period = 'today' | 'week' | 'month' | 'last_month' | 'all'

const periods: { key: Period; label: string }[] = [
  { key: 'today', label: 'Hari Ini' },
  { key: 'week', label: 'Minggu Ini' },
  { key: 'last_month', label: 'Bulan Lalu' },
  { key: 'month', label: 'Bulan Ini' },
  { key: 'all', label: 'Semua' },
]


function fmtKg(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}t kg`
  return `${n.toFixed(0)} kg`
}

function ProfitBadge({ value, pct }: { value: number; pct?: number }) {
  const positive = value >= 0
  return (
    <div
      className="flex items-center gap-1.5 rounded-full px-3 py-1.5"
      style={{ background: positive ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)' }}
    >
      {positive
        ? <TrendingUp className="h-4 w-4" style={{ color: '#10b981' }} />
        : <TrendingDown className="h-4 w-4" style={{ color: '#ef4444' }} />
      }
      {pct !== undefined && (
        <span className="text-sm font-semibold" style={{ color: positive ? '#10b981' : '#ef4444' }}>
          {pct.toFixed(1)}%
        </span>
      )}
    </div>
  )
}

export function ProfitLossWidget() {
  const [period, setPeriod] = useState<Period>('month')
  const [data, setData] = useState<ProfitLossStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError(false)
    reportAPI
      .getProfitLoss(period)
      .then((d) => setData(d as ProfitLossStats))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [period])

  const netPositive = (data?.net_profit ?? 0) >= 0
  const grossPositive = (data?.gross_profit ?? 0) >= 0

  return (
    <div
      className="rounded-xl p-5"
      style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
    >
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
            Laba / Rugi
          </h3>
          <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Pendapatan (Penjualan ikan) − HPP (Pembelian ikan) − Pengeluaran
          </p>
        </div>
        {/* Period tabs */}
        <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid hsl(var(--border))' }}>
          {periods.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={cn('px-3 py-1 text-xs font-medium transition-colors', period === p.key ? 'text-white' : 'hover:text-white')}
              style={
                period === p.key
                  ? { background: 'hsl(var(--sidebar-active))' }
                  : { color: 'hsl(var(--muted-foreground))', background: 'transparent' }
              }
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 rounded-lg" />
          <div className="grid grid-cols-3 gap-3">
            <Skeleton className="h-20 rounded-lg" />
            <Skeleton className="h-20 rounded-lg" />
            <Skeleton className="h-20 rounded-lg" />
          </div>
          <Skeleton className="h-14 rounded-lg" />
        </div>
      ) : error || !data ? (
        <div className="flex h-32 items-center justify-center text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
          Gagal memuat data
        </div>
      ) : (
        <div className="space-y-3">
          {/* Net Profit — most prominent */}
          <div
            className="rounded-lg p-4 flex items-center justify-between"
            style={{
              background: netPositive ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
              border: `1px solid ${netPositive ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
            }}
          >
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                Laba Bersih
              </p>
              <p className="text-2xl font-bold" style={{ color: netPositive ? '#10b981' : '#ef4444' }}>
                {formatIDR(data.net_profit)}
              </p>
            </div>
            <ProfitBadge value={data.net_profit} />
          </div>

          {/* Revenue / COGS / OpEx — three columns */}
          <div className="grid grid-cols-3 gap-3">
            <div
              className="rounded-lg p-3"
              style={{ background: 'hsl(var(--muted))', border: '1px solid hsl(var(--border))' }}
            >
              <div className="flex items-center gap-1.5 mb-2">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>Pendapatan (Penjualan ikan)</span>
              </div>
              <p className="text-sm font-bold" style={{ color: 'hsl(var(--foreground))' }}>{formatIDR(data.revenue)}</p>
              <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>{fmtKg(data.sold_kg)} terjual</p>
            </div>

            <div
              className="rounded-lg p-3"
              style={{ background: 'hsl(var(--muted))', border: '1px solid hsl(var(--border))' }}
            >
              <div className="flex items-center gap-1.5 mb-2">
                <ShoppingCart className="h-3.5 w-3.5 text-orange-400" />
                <span className="text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>HPP (Pembelian ikan)</span>
              </div>
              <p className="text-sm font-bold" style={{ color: 'hsl(var(--foreground))' }}>{formatIDR(data.cogs)}</p>
              <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>{fmtKg(data.bought_kg)} dibeli</p>
            </div>

            <div
              className="rounded-lg p-3"
              style={{ background: 'hsl(var(--muted))', border: '1px solid hsl(var(--border))' }}
            >
              <div className="flex items-center gap-1.5 mb-2">
                <Receipt className="h-3.5 w-3.5 text-purple-400" />
                <span className="text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>Pengeluaran</span>
              </div>
              <p className="text-sm font-bold" style={{ color: 'hsl(var(--foreground))' }}>{formatIDR(data.opex)}</p>
              <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                Laba kotor: <span style={{ color: grossPositive ? '#10b981' : '#ef4444' }}>{formatIDR(data.gross_profit)}</span>
              </p>
            </div>
          </div>

          {/* Unpaid timbangan warning */}
          {data.unpaid_timbangan_kg > 0 && (
            <div
              className="rounded-lg px-3 py-2 flex items-center gap-2"
              style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' }}
            >
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" style={{ color: '#f59e0b' }} />
              <p className="text-xs" style={{ color: '#f59e0b' }}>
                <span className="font-semibold">{fmtKg(data.unpaid_timbangan_kg)}</span> timbangan belum ada Beli Ikan — HPP (Pembelian ikan) belum tercatat
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
