'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FishStock } from '@/types/api'

interface StockChartProps {
  data: FishStock[]
}

const COLORS = [
  '#0ea5e9', '#06b6d4', '#14b8a6', '#10b981',
  '#22c55e', '#84cc16', '#eab308', '#f97316',
  '#ef4444', '#ec4899', '#a855f7', '#6366f1',
]

export function StockChart({ data }: StockChartProps) {
  // Only show fish with stock > 0, fallback to all if empty
  const chartData = (data ?? [])
    .filter((s) => s.total_quantity > 0)
    .map((s) => ({ name: s.fish_code, qty: s.total_quantity, fullName: s.fish_name }))

  const noStock = chartData.length === 0

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-primary/10 text-[10px]">📊</span>
          Stok Ikan per Jenis
        </CardTitle>
      </CardHeader>
      <CardContent>
        {noStock ? (
          <div className="flex h-56 flex-col items-center justify-center text-muted-foreground">
            <span className="text-3xl mb-2">🐟</span>
            <p className="text-sm">Belum ada stok masuk</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${(v / 1000).toFixed(v >= 1000 ? 1 : 0)}${v >= 1000 ? 'k' : ''}`}
              />
              <Tooltip
                formatter={(value: number, _name: string, props: { payload?: { fullName?: string } }) => [
                  `${value.toLocaleString('id-ID')} kg`,
                  props.payload?.fullName || 'Stok',
                ]}
                contentStyle={{
                  borderRadius: '8px',
                  border: '1px solid hsl(var(--border))',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  fontSize: 12,
                }}
                cursor={{ fill: 'hsl(var(--muted))', radius: 4 }}
              />
              <Bar dataKey="qty" radius={[5, 5, 0, 0]} maxBarSize={40}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
