'use client'

import { useEffect, useState } from 'react'
import { reviewAPI } from '@/lib/api'
import { Receipt } from '@/types/api'
import { Button } from '@/components/ui/button'
import { formatDateTime, timeAgo } from '@/lib/formatters'
import { RefreshCw, Clock, Inbox, ArrowRight } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

const TYPE_LABELS: Record<string, string> = {
  bon_penjualan: 'Bon Penjualan',
  bon_pengeluaran: 'Bon Pengeluaran',
  timbangan_ikan_basah: 'Timbangan Ikan',
  invoice: 'Invoice',
}

export default function PendingReviewPage() {
  const router = useRouter()
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const res = await reviewAPI.getPending() as { data: Receipt[] }
      setReceipts(res.data || [])
    } catch {
      toast.error('Gagal memuat review')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Pending Review</h2>
          <p className="text-sm text-muted-foreground">
            {loading ? '…' : `${receipts.length} bon menunggu ditinjau`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            <tr className="text-xs text-muted-foreground">
              <th className="text-left px-4 py-3 font-medium">Tipe Bon</th>
              <th className="text-left px-4 py-3 font-medium">Via</th>
              <th className="text-left px-4 py-3 font-medium">Waktu Masuk</th>
              <th className="w-24" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 4 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                    </td>
                  ))}
                </tr>
              ))
            ) : receipts.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Inbox className="h-8 w-8 opacity-30" />
                    <p>Tidak ada bon yang menunggu review</p>
                  </div>
                </td>
              </tr>
            ) : (
              receipts.map(r => {
                const ageMs = Date.now() - new Date(r.submitted_at).getTime()
                const ageHours = ageMs / 3600000
                return (
                  <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium">
                      {TYPE_LABELS[r.receipt_type] || r.receipt_type}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground capitalize">
                      {r.submitted_via || 'telegram'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs text-muted-foreground">{formatDateTime(r.submitted_at)}</div>
                      <div className={`text-[11px] font-medium ${ageHours > 24 ? 'text-red-500' : ageHours > 4 ? 'text-yellow-600' : 'text-muted-foreground/60'}`}>
                        <Clock className="inline h-2.5 w-2.5 mr-0.5" />{timeAgo(r.submitted_at)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" className="gap-1 h-7 text-xs" onClick={() => router.push(`/review/${r.review_token}`)}>
                        <ArrowRight className="h-3 w-3" /> Review
                      </Button>
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
