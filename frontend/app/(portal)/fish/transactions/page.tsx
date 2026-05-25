'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { fishAPI } from '@/lib/api'
import { FishTransaction } from '@/types/api'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/shared/status-badge'
import { formatDate, formatKg, formatIDR } from '@/lib/formatters'
import { ChevronLeft, ChevronRight, Search, Receipt, Ship, Image as ImageIcon, X } from 'lucide-react'
import { toast } from 'sonner'
import Image from 'next/image'

const PAGE_SIZE = 20

export default function FishTransactionsPage() {
  const router = useRouter()
  const [transactions, setTransactions] = useState<FishTransaction[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [previewImg, setPreviewImg] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(PAGE_SIZE),
      })
      if (typeFilter !== 'all') params.set('transaction_type', typeFilter)
      if (search) params.set('q', search)
      const res = await fishAPI.getTransactions(params.toString()) as { data: FishTransaction[]; total: number }
      setTransactions(res.data || [])
      setTotal(res.total || 0)
    } catch {
      toast.error('Gagal memuat transaksi')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [page, typeFilter])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    load()
  }

  const totalPages = Math.ceil(total / PAGE_SIZE) || 1

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Transaksi Ikan</h2>
          <p className="text-sm text-muted-foreground">
            Klik ikon bon untuk melihat foto receipt asal — {total.toLocaleString('id-ID')} transaksi
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <form onSubmit={handleSearch} className="flex gap-2">
          <Input
            placeholder="Cari kapal, mitra..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-48"
          />
          <Button type="submit" variant="outline" size="icon">
            <Search className="h-4 w-4" />
          </Button>
        </form>
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1) }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Tipe" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Tipe</SelectItem>
            <SelectItem value="buy">Masuk</SelectItem>
            <SelectItem value="sell">Keluar</SelectItem>
            <SelectItem value="adjust">Adjustment</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Tanggal</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Tipe</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Jenis Ikan</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Qty (kg)</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Harga/kg</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Total</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Kapal / Mitra</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Bon</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : transactions.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                      Tidak ada transaksi
                    </td>
                  </tr>
                ) : (
                  transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap text-xs">
                        {formatDate(tx.transaction_date || tx.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={tx.transaction_type} />
                      </td>
                      <td className="px-4 py-3 font-mono text-sm font-semibold text-primary">
                        {tx.fish_code}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {formatKg(tx.quantity)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs">
                        {tx.price_per_kg ? formatIDR(tx.price_per_kg) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs">
                        {tx.total_amount ? formatIDR(tx.total_amount) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {tx.vessel_name && (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <Ship className="h-3 w-3 shrink-0" />
                              {tx.vessel_name}
                            </span>
                          )}
                          {tx.person_name && !tx.vessel_name && (
                            <span className="text-xs">{tx.person_name}</span>
                          )}
                          {tx.person_name && tx.vessel_name && (
                            <span className="text-xs text-muted-foreground">· {tx.person_name}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {/* Receipt image thumbnail — click to preview */}
                          {tx.receipt_image_path && (
                            <button
                              onClick={() => setPreviewImg(tx.receipt_image_path!)}
                              className="relative h-8 w-8 rounded overflow-hidden border hover:ring-2 hover:ring-primary/50 transition-all shrink-0"
                              title="Lihat foto bon"
                            >
                              <Image
                                src={tx.receipt_image_path}
                                alt="bon"
                                fill
                                className="object-cover"
                                unoptimized
                              />
                            </button>
                          )}
                          {/* Link to review page */}
                          {tx.review_token ? (
                            <button
                              onClick={() => router.push(`/review/${tx.review_token}`)}
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                              title="Buka review bon"
                            >
                              <Receipt className="h-3 w-3" />
                              <span className="font-mono">{tx.review_token.slice(0, 8)}…</span>
                            </button>
                          ) : (
                            tx.receipt_image_path ? null : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )
                          )}
                          {!tx.receipt_image_path && !tx.review_token && (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <span className="text-xs text-muted-foreground">
                Halaman {page} dari {totalPages} · {total.toLocaleString('id-ID')} transaksi
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page <= 1}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Receipt image preview lightbox */}
      {previewImg && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPreviewImg(null)}
        >
          <div className="relative max-h-[90vh] max-w-lg w-full" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setPreviewImg(null)}
              className="absolute -top-3 -right-3 z-10 rounded-full bg-white p-1 shadow-lg hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="relative w-full rounded-lg overflow-hidden bg-white">
              <Image
                src={previewImg}
                alt="Foto bon"
                width={480}
                height={640}
                className="object-contain w-full"
                unoptimized
              />
            </div>
            <div className="flex justify-center mt-2">
              <a
                href={previewImg}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-white/80 hover:text-white"
              >
                <ImageIcon className="h-3 w-3" /> Buka gambar penuh
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
