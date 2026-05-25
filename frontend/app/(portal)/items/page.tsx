'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { itemAPI } from '@/lib/api'
import { ItemStock, ItemTransaction } from '@/types/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDate, formatIDR } from '@/lib/formatters'
import { ExternalLink, X, ChevronRight, Receipt } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

export default function ItemsPage() {
  const router = useRouter()
  const [stocks, setStocks] = useState<ItemStock[]>([])
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<ItemStock | null>(null)
  const [txns, setTxns] = useState<ItemTransaction[]>([])
  const [txLoading, setTxLoading] = useState(false)

  useEffect(() => {
    itemAPI
      .getStock()
      .then((res) => setStocks((res as { data: ItemStock[] }).data || []))
      .catch(() => toast.error('Gagal memuat stok item'))
      .finally(() => setLoading(false))
  }, [])

  const openDetail = async (s: ItemStock) => {
    setDetail(s)
    setTxns([])
    setTxLoading(true)
    try {
      const res = await itemAPI.getTransactions(`item_id=${s.item_id}&limit=200`) as { data: ItemTransaction[] }
      setTxns(res.data || [])
    } catch {
      toast.error('Gagal memuat transaksi')
    } finally {
      setTxLoading(false)
    }
  }

  return (
    <div className="flex gap-4">
      {/* ── Item stock table ── */}
      <div className="flex-1 min-w-0 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Stok Item</h2>
            <p className="text-sm text-muted-foreground">Kelola stok barang dan perlengkapan</p>
          </div>
          <Link href="/items/transactions">
            <Button variant="outline" size="sm">Lihat Semua Transaksi</Button>
          </Link>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kode</TableHead>
                  <TableHead>Nama Item</TableHead>
                  <TableHead>Kategori</TableHead>
                  <TableHead>Satuan</TableHead>
                  <TableHead className="text-right">Stok</TableHead>
                  <TableHead>Update</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <TableCell key={j}><div className="h-4 w-3/4 animate-pulse rounded bg-muted" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : stocks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      Belum ada data stok
                    </TableCell>
                  </TableRow>
                ) : (
                  stocks.map((s) => {
                    const isActive = detail?.item_id === s.item_id
                    return (
                      <TableRow
                        key={s.item_id}
                        className={`cursor-pointer transition-colors ${isActive ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-muted/40'}`}
                        onClick={() => isActive ? setDetail(null) : openDetail(s)}
                      >
                        <TableCell className="font-mono text-sm font-semibold text-primary">
                          {s.item_code || '—'}
                        </TableCell>
                        <TableCell className="font-medium">{s.item_name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{s.category_name || '—'}</TableCell>
                        <TableCell className="text-sm">{s.unit || '—'}</TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          {(s.quantity ?? 0).toLocaleString('id-ID')}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {s.updated_at ? formatDate(s.updated_at) : '—'}
                        </TableCell>
                        <TableCell>
                          <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isActive ? 'rotate-90' : ''}`} />
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* ── Detail panel ── */}
      {detail && (
        <div className="w-[420px] shrink-0 flex flex-col border rounded-xl bg-card shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b px-4 py-3 bg-muted/30">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-primary">{detail.item_code}</span>
                <span className="font-medium">{detail.item_name}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Stok: <strong className="text-foreground">{detail.quantity.toLocaleString('id-ID')} {detail.unit}</strong>
                {detail.category_name && <> · {detail.category_name}</>}
              </p>
            </div>
            <button onClick={() => setDetail(null)} className="p-1.5 rounded hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="px-4 py-2 border-b bg-muted/10">
              <p className="text-xs font-medium text-muted-foreground">Riwayat Bon / Transaksi</p>
            </div>
            {txLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-12 animate-pulse rounded bg-muted" />
                ))}
              </div>
            ) : txns.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Receipt className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-sm">Belum ada transaksi</p>
              </div>
            ) : (
              <div className="divide-y">
                {txns.map(tx => (
                  <div key={tx.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          tx.transaction_type === 'in' ? 'bg-emerald-100 text-emerald-700'
                          : tx.transaction_type === 'out' ? 'bg-rose-100 text-rose-700'
                          : 'bg-amber-100 text-amber-700'
                        }`}>
                          {tx.transaction_type === 'in' ? 'Masuk' : tx.transaction_type === 'out' ? 'Keluar' : 'Adjust'}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {tx.transaction_date ? formatDate(tx.transaction_date) : formatDate(tx.created_at)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-xs font-mono font-semibold">
                          {tx.transaction_type === 'out' ? '-' : '+'}{tx.quantity.toLocaleString('id-ID')} {detail.unit}
                        </span>
                        {tx.unit_price ? (
                          <span className="text-xs text-muted-foreground">@ {formatIDR(tx.unit_price)}</span>
                        ) : null}
                      </div>
                      {tx.notes && (
                        <p className="text-[11px] text-muted-foreground truncate">{tx.notes}</p>
                      )}
                    </div>
                    {tx.review_token && (
                      <button
                        onClick={() => router.push(`/review/${tx.review_token}`)}
                        className="shrink-0 text-primary hover:text-primary/70"
                        title="Lihat bon">
                        <ExternalLink className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
