'use client'

import { useEffect, useState } from 'react'
import { fishAPI } from '@/lib/api'
import { TimbanganRecord, Vessel } from '@/types/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/shared/status-badge'
import { formatDate, formatKg, formatIDR } from '@/lib/formatters'
import { Plus, Loader2, CheckCircle, ChevronDown, ChevronRight, ExternalLink, Anchor, Fish } from 'lucide-react'
import { toast } from 'sonner'

interface FishColumnRaw {
  fish_code?: string
  fish_type_code?: string
  price_per_kg?: number
  total_weight?: number
  quantity_kg?: number
  weight_batches?: number[]
}

export default function PerkapalPage() {
  const [timbangan, setTimbangan] = useState<TimbanganRecord[]>([])
  const [vessels, setVessels] = useState<Vessel[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [form, setForm] = useState({
    vessel_id: '',
    transport_number: '',
    weigh_date: new Date().toISOString().slice(0, 10),
  })

  const load = async () => {
    try {
      const [timRes, vesRes] = await Promise.all([
        fishAPI.getTimbangan(),
        fishAPI.getVessels(),
      ])
      setTimbangan((timRes as { data: TimbanganRecord[] }).data || [])
      setVessels((vesRes as { data: Vessel[] }).data || [])
    } catch {
      toast.error('Gagal memuat data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      await fishAPI.createTimbangan(form)
      toast.success('Timbangan berhasil dibuat')
      setOpen(false)
      setForm({ vessel_id: '', transport_number: '', weigh_date: new Date().toISOString().slice(0, 10) })
      load()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan')
    } finally {
      setSubmitting(false)
    }
  }

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const parseFishColumns = (record: TimbanganRecord): FishColumnRaw[] => {
    if (!record.fish_columns) return []
    try {
      const raw = typeof record.fish_columns === 'string'
        ? JSON.parse(record.fish_columns)
        : record.fish_columns
      return Array.isArray(raw) ? raw : []
    } catch {
      return []
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Stok Perkapal</h2>
          <p className="text-sm text-muted-foreground">Riwayat timbangan ikan per kapal dari bot & input manual</p>
        </div>
        {false && <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" /> Buat Timbangan Baru
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Buat Timbangan Baru</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Kapal</Label>
                <Select value={form.vessel_id} onValueChange={(v) => setForm({ ...form, vessel_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Pilih kapal" /></SelectTrigger>
                  <SelectContent>
                    {vessels.map((v) => (
                      <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>No. Transportasi</Label>
                <Input
                  value={form.transport_number}
                  onChange={(e) => setForm({ ...form, transport_number: e.target.value })}
                  placeholder="Opsional"
                />
              </div>
              <div className="space-y-2">
                <Label>Tanggal Timbang</Label>
                <Input
                  type="date"
                  value={form.weigh_date}
                  onChange={(e) => setForm({ ...form, weigh_date: e.target.value })}
                  required
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Simpan'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Tanggal</TableHead>
                <TableHead>Kapal</TableHead>
                <TableHead>No. Transport</TableHead>
                <TableHead className="text-right">Total KG</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10" />
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
              ) : timbangan.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                    <Anchor className="h-8 w-8 mx-auto mb-2 opacity-20" />
                    <p>Belum ada data timbangan</p>
                    <p className="text-xs mt-1">Data muncul otomatis setelah bot mengirim dan receipt disetujui</p>
                  </TableCell>
                </TableRow>
              ) : (
                timbangan.map((t) => {
                  const cols = parseFishColumns(t)
                  const isExpanded = expanded.has(t.id)
                  const reviewToken = t.review_token

                  return (
                    <>
                      <TableRow
                        key={t.id}
                        className="cursor-pointer hover:bg-muted/40"
                        onClick={() => cols.length > 0 && toggleExpand(t.id)}
                      >
                        <TableCell className="w-8 text-muted-foreground">
                          {cols.length > 0 ? (
                            isExpanded
                              ? <ChevronDown className="h-4 w-4" />
                              : <ChevronRight className="h-4 w-4" />
                          ) : null}
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-medium">
                          {formatDate(t.weigh_date || t.timbang_date || '')}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Anchor className="h-3.5 w-3.5 text-cyan-500 shrink-0" />
                            <span className="font-medium">{t.vessel_name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {t.transport_number || t.transports || '—'}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          {formatKg(t.total_kg ?? t.total_weight_kg ?? 0)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={t.status || 'approved'} />
                        </TableCell>
                        <TableCell>
                          {reviewToken && (
                            <a
                              href={`/review/${reviewToken}`}
                              target="_blank"
                              rel="noreferrer"
                              title="Lihat receipt"
                              onClick={e => e.stopPropagation()}
                              className="p-1 rounded hover:bg-muted inline-flex"
                            >
                              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                            </a>
                          )}
                        </TableCell>
                      </TableRow>

                      {/* Expanded fish breakdown */}
                      {isExpanded && cols.length > 0 && (
                        <TableRow key={`${t.id}-detail`} className="bg-muted/20 hover:bg-muted/20">
                          <TableCell />
                          <TableCell colSpan={6} className="py-2 pb-3">
                            <div className="rounded-lg border bg-background overflow-hidden">
                              <table className="w-full text-xs">
                                <thead className="bg-muted/40">
                                  <tr className="text-muted-foreground">
                                    <th className="text-left px-3 py-1.5 font-medium">Kode Ikan</th>
                                    <th className="text-right px-3 py-1.5 font-medium">Harga/kg</th>
                                    <th className="text-right px-3 py-1.5 font-medium">Berat (kg)</th>
                                    <th className="text-left px-3 py-1.5 font-medium">Batch</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y">
                                  {cols.map((col, idx) => {
                                    const code = col.fish_code || col.fish_type_code || '?'
                                    const qty = col.total_weight ?? col.quantity_kg ?? 0
                                    return (
                                      <tr key={idx} className="hover:bg-muted/20">
                                        <td className="px-3 py-1.5">
                                          <div className="flex items-center gap-1.5">
                                            <Fish className="h-3 w-3 text-cyan-500" />
                                            <span className="font-mono font-semibold text-primary">{code}</span>
                                          </div>
                                        </td>
                                        <td className="px-3 py-1.5 text-right font-mono">
                                          {col.price_per_kg ? formatIDR(col.price_per_kg) : '—'}
                                        </td>
                                        <td className="px-3 py-1.5 text-right font-mono font-semibold">
                                          {qty.toLocaleString('id-ID')} kg
                                        </td>
                                        <td className="px-3 py-1.5 text-muted-foreground">
                                          {col.weight_batches && col.weight_batches.length > 1
                                            ? col.weight_batches.join(' + ')
                                            : '—'}
                                        </td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                                <tfoot className="border-t bg-muted/20">
                                  <tr>
                                    <td colSpan={2} className="px-3 py-1.5 text-right font-semibold text-muted-foreground">Total:</td>
                                    <td className="px-3 py-1.5 text-right font-mono font-bold">
                                      {cols.reduce((s, c) => s + (c.total_weight ?? c.quantity_kg ?? 0), 0).toLocaleString('id-ID')} kg
                                    </td>
                                    <td />
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
