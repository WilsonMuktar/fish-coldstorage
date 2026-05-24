import { Card, CardContent } from '@/components/ui/card'
import { formatIDR, formatKg } from '@/lib/formatters'
import { DashboardData } from '@/types/api'
import { Fish, ClipboardCheck, TrendingUp, TrendingDown, Layers } from 'lucide-react'

interface StatsCardsProps {
  data: DashboardData
}

export function StatsCards({ data }: StatsCardsProps) {
  const rawKg = data.raw_fish_stock_kg || 0
  const sortedKg = data.sorted_fish_stock_kg || 0
  const totalKg = data.total_fish_stock_kg || 0

  const stats = [
    {
      label: 'Total Stok Ikan',
      value: formatKg(totalKg),
      sub: null as null | string,
      icon: Fish,
      gradient: 'from-cyan-500 to-teal-600',
      iconBg: 'bg-cyan-500/20',
      iconColor: 'text-cyan-300',
      breakdown: [
        { label: 'Mentah', kg: rawKg, icon: Fish },
        { label: 'Sortir', kg: sortedKg, icon: Layers },
      ],
    },
    {
      label: 'Pending Review',
      value: String(data.pending_reviews || 0),
      sub: 'Dokumen belum diverifikasi',
      icon: ClipboardCheck,
      gradient: 'from-amber-500 to-orange-600',
      iconBg: 'bg-amber-500/20',
      iconColor: 'text-amber-300',
      breakdown: undefined,
    },
    {
      label: 'Piutang (AR)',
      value: formatIDR(data.total_ar || 0),
      sub: 'Outstanding receivable',
      icon: TrendingUp,
      gradient: 'from-emerald-500 to-green-600',
      iconBg: 'bg-emerald-500/20',
      iconColor: 'text-emerald-300',
      breakdown: undefined,
    },
    {
      label: 'Hutang (AP)',
      value: formatIDR(data.total_ap || 0),
      sub: 'Outstanding payable',
      icon: TrendingDown,
      gradient: 'from-rose-500 to-red-600',
      iconBg: 'bg-rose-500/20',
      iconColor: 'text-rose-300',
      breakdown: undefined,
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map((stat) => {
        const Icon = stat.icon
        return (
          <Card
            key={stat.label}
            className={`relative overflow-hidden border-0 bg-gradient-to-br ${stat.gradient} text-white shadow-lg`}
          >
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-white/70 uppercase tracking-wide">{stat.label}</p>
                  <p className="mt-1.5 text-2xl font-bold text-white truncate">{stat.value}</p>
                  {stat.breakdown ? (
                    <div className="mt-2 flex gap-3">
                      {stat.breakdown.map(b => {
                        const BIcon = b.icon
                        return (
                          <div key={b.label} className="flex items-center gap-1 text-[11px] text-white/80">
                            <BIcon className="h-3 w-3 shrink-0 text-white/60" />
                            <span className="text-white/60">{b.label}</span>
                            <span className="font-semibold">{formatKg(b.kg)}</span>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="mt-1 text-[11px] text-white/60">{stat.sub}</p>
                  )}
                </div>
                <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${stat.iconBg} ring-1 ring-white/20`}>
                  <Icon className={`h-5 w-5 ${stat.iconColor}`} />
                </div>
              </div>
            </CardContent>
            <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/5" />
            <div className="pointer-events-none absolute -bottom-4 -left-4 h-16 w-16 rounded-full bg-white/5" />
          </Card>
        )
      })}
    </div>
  )
}
