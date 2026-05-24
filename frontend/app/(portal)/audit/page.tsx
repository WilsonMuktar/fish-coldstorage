'use client'

import { useCallback, useEffect, useState } from 'react'
import { request } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { formatDateTime, timeAgo } from '@/lib/formatters'
import { RefreshCw, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { toast } from 'sonner'

interface AuditEntry {
  id: string
  entity_type: string
  entity_id: string
  action: string
  actor_id?: string
  actor_name: string
  changes?: Record<string, unknown>
  created_at: string
}

const ENTITY_TYPES = [
  { value: 'all', label: 'Semua' },
  { value: 'fish_type', label: 'Jenis Ikan' },
  { value: 'fish_transaction', label: 'Transaksi Ikan' },
  { value: 'receipt', label: 'Review Bon' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'vessel', label: 'Kapal' },
]

const ACTION_COLORS: Record<string, string> = {
  create:       'bg-green-100 text-green-800',
  update:       'bg-blue-100 text-blue-800',
  delete:       'bg-red-100 text-red-800',
  approve:      'bg-emerald-100 text-emerald-800',
  reject:       'bg-orange-100 text-orange-800',
  upload_photo: 'bg-purple-100 text-purple-800',
}

const ACTION_LABELS: Record<string, string> = {
  create:       'Buat',
  update:       'Ubah',
  delete:       'Hapus',
  approve:      'Setujui',
  reject:       'Tolak',
  upload_photo: 'Upload Foto',
}

const ENTITY_LABELS: Record<string, string> = {
  fish_type:        'Jenis Ikan',
  fish_transaction: 'Transaksi Ikan',
  receipt:          'Bon',
  invoice:          'Invoice',
  vessel:           'Kapal',
}

const PAGE_SIZE = 30

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [entityType, setEntityType] = useState('all')
  const [search, setSearch] = useState('')

  const load = useCallback(async (p: number, et: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(p * PAGE_SIZE) })
      if (et && et !== 'all') params.set('entity_type', et)
      const res = await request<{ data: AuditEntry[]; total: number }>(
        `/v1/audit?${params}`
      )
      setEntries(res.data || [])
      setTotal(res.total || 0)
    } catch {
      toast.error('Gagal memuat log aktivitas')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(page, entityType) }, [load, page, entityType])

  const handleEntityTypeChange = (val: string) => {
    setEntityType(val)
    setPage(0)
  }

  const filtered = search.trim()
    ? entries.filter(e =>
        e.actor_name.toLowerCase().includes(search.toLowerCase()) ||
        e.action.toLowerCase().includes(search.toLowerCase()) ||
        e.entity_type.toLowerCase().includes(search.toLowerCase()) ||
        JSON.stringify(e.changes || {}).toLowerCase().includes(search.toLowerCase())
      )
    : entries

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Log Aktivitas</h2>
          <p className="text-sm text-muted-foreground">
            Riwayat semua perubahan data — {total.toLocaleString('id-ID')} entri
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => load(page, entityType)} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={entityType} onValueChange={handleEntityTypeChange}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Semua entitas" />
          </SelectTrigger>
          <SelectContent>
            {ENTITY_TYPES.map(et => (
              <SelectItem key={et.value} value={et.value}>{et.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cari aktor, aksi, perubahan..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Waktu</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Aktor</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Aksi</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Entitas</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Detail Perubahan</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 5 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                      Belum ada log aktivitas
                    </td>
                  </tr>
                ) : (
                  filtered.map(entry => (
                    <tr key={entry.id} className="hover:bg-muted/30 transition-colors">
                      {/* Time */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-xs font-medium">{timeAgo(entry.created_at)}</div>
                        <div className="text-xs text-muted-foreground">{formatDateTime(entry.created_at)}</div>
                      </td>

                      {/* Actor */}
                      <td className="px-4 py-3">
                        <span className="font-medium text-foreground">
                          {entry.actor_name || <span className="text-muted-foreground italic">sistem</span>}
                        </span>
                      </td>

                      {/* Action badge */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${ACTION_COLORS[entry.action] || 'bg-gray-100 text-gray-700'}`}>
                          {ACTION_LABELS[entry.action] || entry.action}
                        </span>
                      </td>

                      {/* Entity */}
                      <td className="px-4 py-3">
                        <div className="text-xs font-medium">
                          {ENTITY_LABELS[entry.entity_type] || entry.entity_type}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {entry.entity_id === '00000000-0000-0000-0000-000000000000'
                            ? '—'
                            : entry.entity_id.slice(0, 8) + '…'}
                        </div>
                      </td>

                      {/* Changes */}
                      <td className="px-4 py-3 max-w-xs">
                        {entry.changes && Object.keys(entry.changes).length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(entry.changes).map(([k, v]) => (
                              <Badge key={k} variant="outline" className="text-xs font-normal">
                                <span className="font-medium mr-1">{k}:</span>
                                <span className="text-muted-foreground truncate max-w-[120px]">
                                  {String(v)}
                                </span>
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <p className="text-xs text-muted-foreground">
                Halaman {page + 1} dari {totalPages} · {total.toLocaleString('id-ID')} entri
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline" size="sm"
                  onClick={() => setPage(p => p - 1)}
                  disabled={page === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline" size="sm"
                  onClick={() => setPage(p => p + 1)}
                  disabled={page >= totalPages - 1}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
