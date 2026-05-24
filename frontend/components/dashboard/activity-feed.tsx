import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDateTime, formatKg, formatIDR } from '@/lib/formatters'
import { FishTransaction } from '@/types/api'
import { cn } from '@/lib/utils'

interface ActivityFeedProps {
  transactions: FishTransaction[]
}

const txBadge: Record<string, { label: string; cls: string }> = {
  buy:    { label: 'Masuk',  cls: 'bg-emerald-100 text-emerald-700' },
  sell:   { label: 'Keluar', cls: 'bg-rose-100 text-rose-700' },
  adjust: { label: 'Adjust', cls: 'bg-sky-100 text-sky-700' },
}

export function ActivityFeed({ transactions }: ActivityFeedProps) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-primary/10 text-[10px]">⚡</span>
          Transaksi Terbaru
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {(transactions ?? []).length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Belum ada transaksi</p>
        ) : (
          <div className="divide-y divide-border">
            {(transactions ?? []).map((tx) => {
              const badge = txBadge[tx.transaction_type] || { label: tx.transaction_type, cls: 'bg-muted text-muted-foreground' }
              return (
                <div key={tx.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold', badge.cls)}>
                      {badge.label}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {tx.fish_code}{tx.person_name ? ` · ${tx.person_name}` : ''}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(tx.transaction_date || tx.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold">{formatKg(tx.quantity)}</p>
                    {tx.total_amount ? (
                      <p className="text-xs text-muted-foreground">{formatIDR(tx.total_amount)}</p>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
