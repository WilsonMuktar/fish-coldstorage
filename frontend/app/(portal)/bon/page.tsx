'use client'

import { useEffect, useState } from 'react'
import { reviewAPI } from '@/lib/api'
import { Receipt } from '@/types/api'
import { Button } from '@/components/ui/button'
import { formatDateTime, timeAgo } from '@/lib/formatters'
import { ExternalLink, RefreshCw, Clock, CheckCircle2, XCircle, Inbox } from 'lucide-react'
import { toast } from 'sonner'

const TYPE_LABELS: Record<string, string> = {
  bon_penjualan: 'Bon Penjualan',
  bon_pengeluaran: 'Bon Pengeluaran',
  timbangan_ikan_basah: 'Timbangan Ikan',
  timbangan_sortir: 'Timbangan Sortir',
  beli_ikan: 'Beli Ikan',
  beli_item: 'Beli Item',
  bayar_jasa: 'Bayar Jasa',
  invoice: 'Invoice',
}

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: React.ComponentType<{ className?: string }> }> = {
  pending:  { label: 'Pending',   className: 'bg-yellow-100 text-yellow-800 border-yellow-200', icon: Clock },
  approved: { label: 'Disetujui', className: 'bg-green-100 text-green-800 border-green-200',   icon: CheckCircle2 },
  rejected: { label: 'Ditolak',   className: 'bg-red-100 text-red-800 border-red-200',          icon: XCircle },
}

type Filter = 'all' | 'pending' | 'approved' | 'rejected'

export default function BonPage() {
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')

  const load = async () => {
    setLoading(true)
    try {
      const res = await reviewAPI.getAll('limit=500') as { data: Receipt[] }
      setReceipts(res.data || [])
    } catch {
      toast.error('Gagal memuat daftar bon')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const displayed = filter === 'all' ? receipts : receipts.filter(r => r.status === filter)

  const counts = {
    all:      receipts.length,
    pending:  receipts.filter(r => r.status === 'pending').length,
    approved: receipts.filter(r => r.status === 'approved').length,
    rejected: receipts.filter(r => r.status === 'rejected').length,
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Daftar Bon</h2>
          <p className="text-sm text-muted-foreground">Semua bon masuk dari Telegram bot</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 rounded-xl border bg-muted/40 p-1 w-fit">
        {(['all', 'pending', 'approved', 'rejected'] as Filter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
              filter === f ? 'bg-white shadow-sm text-foreground dark:bg-card' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {f === 'all' ? 'Semua' : STATUS_CONFIG[f].label}
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
              filter === f ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
            }`}>
              {counts[f]}
            </span>
          </button>
        ))}
      </div>

      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            <tr className="text-xs text-muted-foreground">
              <th className="text-left px-4 py-3 font-medium">Tipe Bon</th>
              <th className="text-left px-4 py-3 font-medium">Tgl Bon</th>
              <th className="text-left px-4 py-3 font-medium">Via</th>
              <th className="text-left px-4 py-3 font-medium">Waktu Masuk</th>
              <th className="text-left px-4 py-3 font-medium">Ditinjau</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="w-20" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                    </td>
                  ))}
                </tr>
              ))
            ) : displayed.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Inbox className="h-8 w-8 opacity-30" />
                    <p>{filter === 'all' ? 'Belum ada bon masuk' : `Tidak ada bon ${STATUS_CONFIG[filter]?.label.toLowerCase()}`}</p>
                  </div>
                </td>
              </tr>
            ) : (
              displayed.map(r => {
                const cfg = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.pending
                const Icon = cfg.icon
                return (
                  <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium">
                      {TYPE_LABELS[r.receipt_type] || r.receipt_type}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {r.extracted_data?.timbangan?.date || r.extracted_data?.sortir?.date || r.extracted_data?.receipt?.date || '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground capitalize">
                      {r.submitted_via || 'telegram'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs text-muted-foreground">{formatDateTime(r.submitted_at)}</div>
                      <div className="text-[11px] text-muted-foreground/60">{timeAgo(r.submitted_at)}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {r.reviewed_at ? formatDateTime(r.reviewed_at) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.className}`}>
                        <Icon className="h-3 w-3" />
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <a href={`/review/${r.review_token}`} target="_blank" rel="noopener noreferrer">
                        <Button variant="ghost" size="sm" className="gap-1 h-7 text-xs">
                          <ExternalLink className="h-3 w-3" /> Buka
                        </Button>
                      </a>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
