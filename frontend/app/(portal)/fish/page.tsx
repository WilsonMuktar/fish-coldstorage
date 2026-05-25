'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { fishAPI, sortingAPI } from '@/lib/api'
import { FishStock, FishType, FishTransaction } from '@/types/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatKg, formatDate, formatIDR } from '@/lib/formatters'
import {
  Plus, Loader2, Ship, Receipt, X, ChevronRight, ChevronLeft,
  Image as ImageIcon, ExternalLink, Layers, ArrowRight, GitMerge, Trash2, RefreshCw,
} from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import Image from 'next/image'
import React from 'react'

interface FishTypeExtended extends FishType {
  is_sorted?: boolean
  source_fish_type_id?: string
  canonical_fish_type_id?: string
  grade?: string
}

interface SortingOutput {
  fish_type_id: string
  fish_type_code: string
  fish_type_name: string
  output_kg: number
}

interface SortingOperation {
  id: string
  source_fish_type_id: string
  source_fish_type_code: string
  source_fish_type_name: string
  input_kg: number
  waste_kg: number
  notes: string
  sort_date: string
  review_token?: string
  outputs: SortingOutput[]
  created_at: string
}

interface ReceiptGroup {
  vesselName: string
  receiptToken: string
  receiptImagePath: string
  date: string
  lines: FishTransaction[]
  totalKg: number
}

function groupByReceipt(txns: FishTransaction[]): ReceiptGroup[] {
  const map = new Map<string, ReceiptGroup>()
  for (const tx of txns) {
    const key = tx.receipt_id || tx.id
    if (!map.has(key)) {
      map.set(key, {
        vesselName: tx.vessel_name || '',
        receiptToken: tx.review_token || '',
        receiptImagePath: tx.receipt_image_path || '',
        date: tx.transaction_date || tx.created_at,
        lines: [],
        totalKg: 0,
      })
    }
    const g = map.get(key)!
    g.lines.push(tx)
    g.totalKg += tx.quantity
  }
  return Array.from(map.values()).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

const SORT_PAGE_SIZE = 10

export default function FishPage() {
  const router = useRouter()
  const [stocks, setStocks] = useState<FishStock[]>([])
  const [fishTypes, setFishTypes] = useState<FishTypeExtended[]>([])
  const [loading, setLoading] = useState(true)

  // Alias management
  const [aliasOpen, setAliasOpen] = useState(false)
  const [aliasSaving, setAliasSaving] = useState<string | null>(null)

  // Detail panel
  const [detailStock, setDetailStock] = useState<FishStock | null>(null)
  const [detailTxns, setDetailTxns] = useState<FishTransaction[]>([])
  const [detailSortOps, setDetailSortOps] = useState<SortingOperation[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailTotal, setDetailTotal] = useState(0)
  const [previewImg, setPreviewImg] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'in' | 'sort' | 'out'>('in')

  // Sortir history section
  const [sortirOps, setSortirOps] = useState<SortingOperation[]>([])
  const [sortirTotal, setSortirTotal] = useState(0)
  const [sortirPage, setSortirPage] = useState(0)
  const [sortirLoading, setSortirLoading] = useState(false)

  // Sortir create dialog
  const [sortirOpen, setSortirOpen] = useState(false)
  const [sortirSaving, setSortirSaving] = useState(false)
  const [formSource, setFormSource] = useState('')
  const [formInputKg, setFormInputKg] = useState('')
  const [formWasteKg, setFormWasteKg] = useState('0')
  const [formDate, setFormDate] = useState(new Date().toISOString().slice(0, 10))
  const [formNotes, setFormNotes] = useState('')
  const [formOutputs, setFormOutputs] = useState<{ fish_type_id: string; output_kg: string }[]>([
    { fish_type_id: '', output_kg: '' },
  ])

  // ── Derived lookups ────────────────────────────────────────────────────────

  const ftById = useMemo(() => new Map(fishTypes.map(ft => [ft.id, ft])), [fishTypes])

  const resolveCanonical = useCallback((id: string) => {
    const ft = ftById.get(id)
    return ft?.canonical_fish_type_id || id
  }, [ftById])

  // Raw stocks: non-sorted fish only (sorted fish are shown as sub-rows)
  const rawStocks = useMemo(() =>
    stocks.filter(s => !ftById.get(s.fish_type_id)?.is_sorted),
    [stocks, ftById]
  )

  // sortedBySource: canonicalSourceId → [{ft, qty, updatedAt}]
  const sortedBySource = useMemo(() => {
    const map = new Map<string, Array<{ ft: FishTypeExtended; qty: number; updatedAt: string | null }>>()
    const stockByFtId = new Map(stocks.map(s => [s.fish_type_id, s]))
    for (const ft of fishTypes) {
      if (!ft.is_sorted || !ft.source_fish_type_id) continue
      const canonicalSrc = resolveCanonical(ft.source_fish_type_id)
      if (!map.has(canonicalSrc)) map.set(canonicalSrc, [])
      const s = stockByFtId.get(ft.id)
      map.get(canonicalSrc)!.push({ ft, qty: s?.total_quantity ?? 0, updatedAt: s?.updated_at ?? null })
    }
    // Sort variants by code within each group
    map.forEach(variants => variants.sort((a, b) => a.ft.code.localeCompare(b.ft.code)))
    return map
  }, [fishTypes, stocks, resolveCanonical])

  const rawTypes = useMemo(() => fishTypes.filter(t => !t.is_sorted), [fishTypes])
  const sortedVariantsFor = useCallback((sourceId: string) =>
    fishTypes.filter(t => t.is_sorted && t.source_fish_type_id === sourceId),
    [fishTypes]
  )

  // ── Data loading ───────────────────────────────────────────────────────────

  const load = async () => {
    try {
      const [stockRes, typeRes] = await Promise.all([
        fishAPI.getStock(),
        fishAPI.getTypes(),
      ])
      setStocks((stockRes as { data: FishStock[] }).data || [])
      setFishTypes(((typeRes as { data: FishTypeExtended[] }).data || []))
    } catch {
      toast.error('Gagal memuat data stok ikan')
    } finally {
      setLoading(false)
    }
  }

  const loadSortirOps = useCallback(async (p: number) => {
    setSortirLoading(true)
    try {
      const res = await sortingAPI.getAll(`limit=${SORT_PAGE_SIZE}&offset=${p * SORT_PAGE_SIZE}`) as { data: SortingOperation[]; total: number }
      setSortirOps(res.data || [])
      setSortirTotal(res.total || 0)
    } catch {
      toast.error('Gagal memuat data sortir')
    } finally {
      setSortirLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [])
  useEffect(() => { loadSortirOps(sortirPage) }, [loadSortirOps, sortirPage])

  // ── Detail panel ───────────────────────────────────────────────────────────

  const openDetail = async (stock: FishStock) => {
    setDetailStock(stock)
    setActiveTab('in')
    setDetailLoading(true)
    setDetailTxns([])
    setDetailSortOps([])
    try {
      const params = new URLSearchParams({ fish_type_id: stock.fish_type_id, limit: '200', offset: '0' })
      const [txRes, sortRes] = await Promise.all([
        fishAPI.getTransactions(params.toString()) as Promise<{ data: FishTransaction[]; total: number }>,
        sortingAPI.getByFishType(stock.fish_type_id) as Promise<{ data: SortingOperation[]; total: number }>,
      ])
      setDetailTxns(txRes.data || [])
      setDetailTotal(txRes.total || 0)
      setDetailSortOps(sortRes.data || [])
    } catch {
      toast.error('Gagal memuat riwayat transaksi')
    } finally {
      setDetailLoading(false)
    }
  }

  const closeDetail = () => { setDetailStock(null); setDetailTxns([]); setDetailSortOps([]) }

  // ── Alias management ───────────────────────────────────────────────────────

  const setCanonical = async (aliasId: string, canonicalId: string | null) => {
    setAliasSaving(aliasId)
    try {
      await fishAPI.updateCanonical(aliasId, canonicalId)
      setFishTypes(prev => prev.map(ft =>
        ft.id === aliasId ? { ...ft, canonical_fish_type_id: canonicalId ?? undefined } : ft
      ))
      load()
      toast.success(canonicalId ? 'Alias berhasil ditautkan' : 'Alias dihapus')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan')
    } finally {
      setAliasSaving(null)
    }
  }

  // ── Sortir form ────────────────────────────────────────────────────────────

  const addOutputRow = () => setFormOutputs(prev => [...prev, { fish_type_id: '', output_kg: '' }])
  const removeOutputRow = (i: number) => setFormOutputs(prev => prev.filter((_, idx) => idx !== i))
  const updateOutput = (i: number, field: 'fish_type_id' | 'output_kg', val: string) =>
    setFormOutputs(prev => prev.map((o, idx) => idx === i ? { ...o, [field]: val } : o))

  const totalOutputKg = formOutputs.reduce((s, o) => s + (parseFloat(o.output_kg) || 0), 0)
  const totalAccountedKg = totalOutputKg + (parseFloat(formWasteKg) || 0)
  const inputKg = parseFloat(formInputKg) || 0
  const unaccounted = inputKg - totalAccountedKg

  const openCreateSortir = () => {
    setFormSource('')
    setFormInputKg('')
    setFormWasteKg('0')
    setFormDate(new Date().toISOString().slice(0, 10))
    setFormNotes('')
    setFormOutputs([{ fish_type_id: '', output_kg: '' }])
    setSortirOpen(true)
  }

  const handleSaveSortir = async () => {
    if (!formSource) { toast.error('Pilih ikan mentah asal'); return }
    if (!formInputKg || inputKg <= 0) { toast.error('Input berat wajib diisi'); return }
    const validOutputs = formOutputs.filter(o => o.fish_type_id && parseFloat(o.output_kg) > 0)
    if (validOutputs.length === 0) { toast.error('Minimal satu output sortir'); return }
    if (totalAccountedKg > inputKg + 0.001) {
      toast.error(`Total output (${totalAccountedKg.toFixed(2)} kg) melebihi input (${inputKg.toFixed(2)} kg)`)
      return
    }
    setSortirSaving(true)
    try {
      await sortingAPI.create({
        source_fish_type_id: formSource,
        input_kg: inputKg,
        waste_kg: parseFloat(formWasteKg) || 0,
        notes: formNotes,
        sort_date: formDate,
        outputs: validOutputs.map(o => ({ fish_type_id: o.fish_type_id, output_kg: parseFloat(o.output_kg) })),
      })
      toast.success('Operasi sortir disimpan')
      setSortirOpen(false)
      load()
      loadSortirOps(0)
      setSortirPage(0)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Gagal menyimpan')
    } finally {
      setSortirSaving(false)
    }
  }

  const selectedRawVariants = formSource ? sortedVariantsFor(formSource) : []
  const inTxns = detailTxns.filter(t => t.transaction_type === 'buy')
  const sellTxns = detailTxns.filter(t => t.transaction_type === 'sell' || t.transaction_type === 'adjust')
  const totalIn = inTxns.reduce((s, t) => s + t.quantity, 0)
  const totalSold = sellTxns.reduce((s, t) => s + t.quantity, 0)
  const receiptGroups = groupByReceipt(inTxns)
  const totalSortirPages = Math.ceil(sortirTotal / SORT_PAGE_SIZE)

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex gap-4 h-full">

      {/* ── Left column: stock table + sortir history ── */}
      <div className={`flex-1 min-w-0 space-y-6 transition-all ${detailStock ? 'lg:max-w-[55%]' : ''}`}>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Stok Ikan</h2>
            <p className="text-sm text-muted-foreground">Klik baris untuk lihat asal stok per receipt &amp; kapal</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setAliasOpen(true)}>
              <GitMerge className="h-3.5 w-3.5" /> Kelola Alias
            </Button>
            <Link href="/fish/transactions">
              <Button variant="outline" size="sm">Semua Transaksi</Button>
            </Link>
            <Button size="sm" className="gap-1.5" onClick={openCreateSortir}>
              <Layers className="h-3.5 w-3.5" /> Catat Sortir
            </Button>
          </div>
        </div>

        {/* Stock table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Stok per Jenis Ikan</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kode</TableHead>
                  <TableHead>Jenis Ikan</TableHead>
                  <TableHead className="text-right">Stok (kg)</TableHead>
                  <TableHead>Terakhir Update</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 5 }).map((_, j) => (
                        <TableCell key={j}><div className="h-4 w-3/4 animate-pulse rounded bg-muted" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : rawStocks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Belum ada stok
                    </TableCell>
                  </TableRow>
                ) : (
                  rawStocks.map((s) => {
                    const isActive = detailStock?.fish_type_id === s.fish_type_id
                    const variants = sortedBySource.get(s.fish_type_id) || []
                    const sortedTotal = variants.reduce((acc, v) => acc + v.qty, 0)
                    return (
                      <React.Fragment key={s.fish_type_id}>
                        {/* Raw fish row */}
                        <TableRow
                          className={`cursor-pointer transition-colors ${isActive ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-muted/40'}`}
                          onClick={() => isActive ? closeDetail() : openDetail(s)}
                        >
                          <TableCell>
                            <span className="font-mono text-sm font-bold text-primary">
                              {s.all_codes || s.fish_code}
                            </span>
                          </TableCell>
                          <TableCell className="font-medium">{s.fish_name}</TableCell>
                          <TableCell className="text-right">
                            <span className="font-mono font-semibold">{formatKg(s.total_quantity - s.sorted_kg)}</span>
                            {s.sorted_kg > 0 && (
                              <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                                sortir: {formatKg(s.sorted_kg)}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {s.updated_at ? formatDate(s.updated_at) : '—'}
                          </TableCell>
                          <TableCell>
                            <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isActive ? 'rotate-90' : ''}`} />
                          </TableCell>
                        </TableRow>

                        {/* Sorted variant sub-rows */}
                        {variants.map(({ ft, qty, updatedAt }) => (
                          <TableRow key={ft.id} className="bg-cyan-50/40 hover:bg-cyan-50/60 border-t-0">
                            <TableCell className="py-1.5">
                              <div className="flex items-center gap-1.5 pl-5">
                                <span className="text-cyan-300 text-xs select-none">└</span>
                                <span className="font-mono text-xs font-semibold text-cyan-700">{ft.code}</span>
                              </div>
                            </TableCell>
                            <TableCell className="py-1.5 text-xs text-muted-foreground">{ft.name}</TableCell>
                            <TableCell className="py-1.5 text-right font-mono text-xs font-medium text-cyan-700">
                              {formatKg(qty)}
                            </TableCell>
                            <TableCell className="py-1.5 text-xs text-muted-foreground">
                              {updatedAt ? formatDate(updatedAt) : '—'}
                            </TableCell>
                            <TableCell />
                          </TableRow>
                        ))}
                      </React.Fragment>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Sortir history */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <Layers className="h-4 w-4 text-cyan-500" />
              Riwayat Sortir
              <span className="text-xs font-normal text-muted-foreground ml-1">({sortirTotal.toLocaleString('id-ID')} operasi)</span>
            </h3>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => loadSortirOps(sortirPage)}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/40">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Tanggal</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Ikan Asal</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Input (kg)</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Output Grade</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Susut (kg)</th>
                      <th className="px-2 py-2 w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {sortirLoading ? (
                      Array.from({ length: 4 }).map((_, i) => (
                        <tr key={i}>
                          {Array.from({ length: 6 }).map((_, j) => (
                            <td key={j} className="px-4 py-2.5">
                              <div className="h-3 w-16 animate-pulse rounded bg-muted" />
                            </td>
                          ))}
                        </tr>
                      ))
                    ) : sortirOps.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground text-sm">
                          <Layers className="mx-auto h-7 w-7 mb-2 opacity-25" />
                          Belum ada operasi sortir
                        </td>
                      </tr>
                    ) : (
                      sortirOps.map(op => (
                        <tr key={op.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-2.5 text-xs whitespace-nowrap text-muted-foreground">
                            {formatDate(op.sort_date)}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="font-mono text-xs font-semibold text-primary">{op.source_fish_type_code}</span>
                            <span className="text-xs text-muted-foreground ml-1">{op.source_fish_type_name}</span>
                          </td>
                          <td className="px-4 py-2.5 text-right text-xs font-medium">
                            {op.input_kg.toLocaleString('id-ID', { maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex flex-wrap gap-1">
                              {(op.outputs || []).map(o => (
                                <Badge key={o.fish_type_id} variant="outline"
                                  className="text-[10px] gap-0.5 px-1.5 h-4 font-mono text-cyan-700 border-cyan-200 bg-cyan-50/50">
                                  {o.fish_type_code}
                                  <ArrowRight className="h-2.5 w-2.5 mx-0.5 text-muted-foreground" />
                                  {o.output_kg.toLocaleString('id-ID', { maximumFractionDigits: 2 })} kg
                                </Badge>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-right text-xs text-muted-foreground">
                            {op.waste_kg > 0
                              ? op.waste_kg.toLocaleString('id-ID', { maximumFractionDigits: 2 })
                              : '—'}
                          </td>
                          <td className="px-2 py-2.5 text-center">
                            {op.review_token && (
                              <button
                                onClick={() => router.push(`/review/${op.review_token}`)}
                                className="inline-flex items-center text-primary hover:text-primary/70"
                                title="Lihat bon sortir">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {totalSortirPages > 1 && (
                <div className="flex items-center justify-between border-t px-4 py-2">
                  <p className="text-xs text-muted-foreground">
                    Halaman {sortirPage + 1} dari {totalSortirPages}
                  </p>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" className="h-7 w-7 p-0"
                      onClick={() => setSortirPage(p => p - 1)} disabled={sortirPage === 0}>
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 w-7 p-0"
                      onClick={() => setSortirPage(p => p + 1)} disabled={sortirPage >= totalSortirPages - 1}>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Detail panel ── */}
      {detailStock && (
        <div className="hidden lg:flex lg:w-[45%] shrink-0 flex-col border rounded-xl bg-card shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b px-4 py-3 bg-muted/30">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-primary text-lg">{detailStock.fish_code}</span>
                <span className="font-medium">{detailStock.fish_name}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Stok saat ini: <strong className="text-foreground">{formatKg(detailStock.total_quantity)}</strong>
                {detailTotal > 0 && <> · {detailTotal} transaksi</>}
              </p>
            </div>
            <button onClick={closeDetail} className="p-1.5 rounded hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          </div>

          {!detailLoading && (
            <div className="flex divide-x border-b text-center text-xs">
              <div className="flex-1 py-2.5">
                <p className="text-muted-foreground">Stok Saat Ini</p>
                <p className="font-semibold text-sm text-emerald-600">{formatKg(detailStock.total_quantity)}</p>
              </div>
              <div className="flex-1 py-2.5">
                <p className="text-muted-foreground">Sortir</p>
                <p className="font-semibold text-sm text-cyan-600">
                  {formatKg(detailSortOps.reduce((s, op) => s + op.input_kg, 0))}
                </p>
              </div>
              <div className="flex-1 py-2.5">
                <p className="text-muted-foreground">Terjual</p>
                <p className="font-semibold text-sm text-rose-600">{formatKg(totalSold)}</p>
              </div>
            </div>
          )}

          <div className="flex border-b text-sm">
            {([
              { key: 'in', label: `Masuk (${inTxns.length}) · ${formatKg(totalIn)}` },
              { key: 'sort', label: `Sortir (${detailSortOps.length})` },
              { key: 'out', label: `Terjual (${sellTxns.length})` },
            ] as const).map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 py-2 text-xs font-medium transition-colors ${activeTab === tab.key ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            {detailLoading ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="rounded-lg border p-3 space-y-2 animate-pulse">
                    <div className="h-4 w-32 bg-muted rounded" />
                    <div className="h-3 w-48 bg-muted rounded" />
                  </div>
                ))}
              </div>
            ) : activeTab === 'in' ? (
              receiptGroups.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Receipt className="h-8 w-8 mb-2 opacity-30" />
                  <p className="text-sm">Belum ada transaksi masuk</p>
                </div>
              ) : (
                <div className="p-3 space-y-2">
                  {receiptGroups.map((g, i) => (
                    <div key={i} className="rounded-lg border bg-card overflow-hidden hover:shadow-sm transition-shadow">
                      <div className="flex items-center gap-3 px-3 py-2.5 bg-muted/30">
                        {g.receiptImagePath ? (
                          <button
                            onClick={() => setPreviewImg(g.receiptImagePath)}
                            className="relative h-10 w-10 shrink-0 rounded overflow-hidden border hover:ring-2 hover:ring-primary/40 transition-all"
                          >
                            <Image src={g.receiptImagePath} alt="bon" fill className="object-cover" unoptimized />
                          </button>
                        ) : (
                          <div className="h-10 w-10 shrink-0 rounded border bg-muted flex items-center justify-center">
                            <Receipt className="h-4 w-4 text-muted-foreground/50" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {g.vesselName && (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold">
                                <Ship className="h-3 w-3 text-cyan-500" />
                                {g.vesselName}
                              </span>
                            )}
                            <span className="text-xs text-muted-foreground">{formatDate(g.date)}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Badge variant="outline" className="text-xs h-5 px-1.5 font-mono text-emerald-700 border-emerald-200 bg-emerald-50">
                              +{formatKg(g.totalKg)}
                            </Badge>
                            {g.receiptToken && (
                              <button
                                onClick={() => router.push(`/review/${g.receiptToken}`)}
                                className="inline-flex items-center gap-0.5 text-[10px] text-primary hover:underline">
                                <ExternalLink className="h-2.5 w-2.5" />
                                {g.receiptToken.slice(0, 8)}…
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                      {g.lines.length > 1 && (
                        <div className="divide-y">
                          {g.lines.map(tx => (
                            <div key={tx.id} className="flex items-center justify-between px-3 py-1.5 text-xs">
                              <span className="font-mono font-semibold text-primary">{tx.fish_code}</span>
                              <span className="text-muted-foreground">{formatKg(tx.quantity)}</span>
                              {tx.price_per_kg ? <span className="text-muted-foreground">{formatIDR(tx.price_per_kg)}/kg</span> : <span />}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
            ) : activeTab === 'sort' ? (
              detailSortOps.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Layers className="h-8 w-8 mb-2 opacity-30" />
                  <p className="text-sm">Belum ada operasi sortir</p>
                </div>
              ) : (
                <div className="p-3 space-y-2">
                  {detailSortOps.map(op => {
                    const isSource = op.source_fish_type_id === detailStock?.fish_type_id
                    return (
                      <div key={op.id} className="rounded-lg border bg-card overflow-hidden">
                        <div className="flex items-center gap-2 px-3 py-2.5 bg-muted/30">
                          <Layers className="h-3.5 w-3.5 text-cyan-500 shrink-0" />
                          <span className="text-xs text-muted-foreground">{formatDate(op.sort_date)}</span>
                          {isSource ? (
                            <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-amber-700 border-amber-200 bg-amber-50 ml-auto">
                              -{formatKg(op.input_kg)} input
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-cyan-700 border-cyan-200 bg-cyan-50 ml-auto">
                              dari {op.source_fish_type_code}
                            </Badge>
                          )}
                        </div>
                        <div className="px-3 py-2 text-xs space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono font-semibold">{op.source_fish_type_code}</span>
                            <span className="text-muted-foreground">{formatKg(op.input_kg)}</span>
                            <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                            {(op.outputs || []).map(o => (
                              <span key={o.fish_type_id}
                                className={`font-mono font-semibold ${o.fish_type_id === detailStock?.fish_type_id ? 'text-cyan-600' : 'text-foreground'}`}>
                                {o.fish_type_code} {formatKg(o.output_kg)}
                              </span>
                            ))}
                            {op.waste_kg > 0 && (
                              <span className="text-muted-foreground">+susut {formatKg(op.waste_kg)}</span>
                            )}
                          </div>
                          {op.notes && (
                            <p className="text-muted-foreground">
                              {op.review_token ? (
                                <button
                                  onClick={() => router.push(`/review/${op.review_token}`)}
                                  className="underline underline-offset-2 hover:text-primary transition-colors">
                                  {op.notes}
                                </button>
                              ) : op.notes}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            ) : (
              sellTxns.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Receipt className="h-8 w-8 mb-2 opacity-30" />
                  <p className="text-sm">Belum ada transaksi penjualan</p>
                </div>
              ) : (
                <div className="p-3">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground">
                        <th className="text-left pb-2">Tanggal</th>
                        <th className="text-left pb-2">Tipe</th>
                        <th className="text-right pb-2">Qty (kg)</th>
                        <th className="text-left pb-2">Mitra</th>
                        <th className="w-6" />
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {sellTxns.map(tx => (
                        <tr key={tx.id}>
                          <td className="py-1.5 text-muted-foreground">{formatDate(tx.transaction_date)}</td>
                          <td className="py-1.5">
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${tx.transaction_type === 'sell' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                              {tx.transaction_type === 'sell' ? 'Jual' : 'Adjust'}
                            </span>
                          </td>
                          <td className="py-1.5 text-right font-mono font-semibold text-rose-600">
                            -{formatKg(tx.quantity)}
                          </td>
                          <td className="py-1.5 text-muted-foreground">{tx.person_name || '—'}</td>
                          <td className="py-1.5 text-center">
                            {tx.review_token && (
                              <button
                                onClick={() => router.push(`/review/${tx.review_token}`)}
                                className="inline-flex items-center text-primary hover:text-primary/70"
                                title="Lihat bon">
                                <ExternalLink className="h-3 w-3" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>

          <div className="border-t px-4 py-2 bg-muted/20">
            <Link href={`/fish/transactions?fish_type_id=${detailStock.fish_type_id}`}
              className="text-xs text-primary hover:underline flex items-center gap-1">
              <ExternalLink className="h-3 w-3" /> Lihat semua transaksi {detailStock.fish_code}
            </Link>
          </div>
        </div>
      )}

      {/* ── Sortir create dialog ── */}
      <Dialog open={sortirOpen} onOpenChange={setSortirOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Catat Sortir Ikan</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Ikan Mentah Asal <span className="text-red-500">*</span></Label>
                <Select value={formSource} onValueChange={v => { setFormSource(v); setFormOutputs([{ fish_type_id: '', output_kg: '' }]) }}>
                  <SelectTrigger><SelectValue placeholder="Pilih jenis ikan..." /></SelectTrigger>
                  <SelectContent>
                    {rawTypes.map(rt => (
                      <SelectItem key={rt.id} value={rt.id}>{rt.code} — {rt.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Tanggal Sortir</Label>
                <Input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Berat Input (kg) <span className="text-red-500">*</span></Label>
                <Input type="number" step="0.01" min="0" value={formInputKg}
                  onChange={e => setFormInputKg(e.target.value)} placeholder="100" />
              </div>
              <div className="space-y-1">
                <Label>Susut / Buangan (kg)</Label>
                <Input type="number" step="0.01" min="0" value={formWasteKg}
                  onChange={e => setFormWasteKg(e.target.value)} placeholder="0" />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Output Grade <span className="text-red-500">*</span></Label>
                <button onClick={addOutputRow} className="text-xs text-primary hover:underline flex items-center gap-1">
                  <Plus className="h-3 w-3" /> Tambah baris
                </button>
              </div>
              {formOutputs.map((o, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Select value={o.fish_type_id} onValueChange={v => updateOutput(i, 'fish_type_id', v)}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder={formSource ? 'Pilih grade...' : 'Pilih ikan asal dulu'} />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedRawVariants.length > 0
                        ? selectedRawVariants.map(sv => (
                          <SelectItem key={sv.id} value={sv.id}>{sv.code} ({sv.grade || 'sortir'})</SelectItem>
                        ))
                        : fishTypes.filter(t => t.is_sorted).map(sv => (
                          <SelectItem key={sv.id} value={sv.id}>{sv.code}</SelectItem>
                        ))
                      }
                    </SelectContent>
                  </Select>
                  <Input type="number" step="0.01" min="0" value={o.output_kg}
                    onChange={e => updateOutput(i, 'output_kg', e.target.value)}
                    placeholder="kg" className="w-24" />
                  {formOutputs.length > 1 && (
                    <button onClick={() => removeOutputRow(i)} className="text-red-400 hover:text-red-600 p-1">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
              {inputKg > 0 && (
                <div className={`text-xs rounded p-2 flex justify-between ${Math.abs(unaccounted) < 0.01 ? 'bg-green-50 text-green-700' : unaccounted < 0 ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                  <span>Input: <strong>{inputKg.toFixed(2)} kg</strong></span>
                  <span>Output+Susut: <strong>{totalAccountedKg.toFixed(2)} kg</strong></span>
                  <span>{unaccounted > 0.01 ? `Sisa: ${unaccounted.toFixed(2)} kg` : unaccounted < -0.01 ? `Lebih: ${Math.abs(unaccounted).toFixed(2)} kg ⚠` : '✓ Balance'}</span>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <Label>Catatan</Label>
              <Input value={formNotes} onChange={e => setFormNotes(e.target.value)}
                placeholder="Operator, shift, kondisi sortir..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSortirOpen(false)}>Batal</Button>
            <Button onClick={handleSaveSortir} disabled={sortirSaving}>
              {sortirSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Simpan Sortir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Alias management dialog ── */}
      <Dialog open={aliasOpen} onOpenChange={setAliasOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitMerge className="h-4 w-4" /> Kelola Alias Kode Ikan
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-2">
            Tandai kode ikan yang merupakan alias dari kode lain. Stok keduanya akan dijumlahkan dan ditampilkan bersama, contoh: <strong>BDR / BH</strong>.
          </p>
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background border-b">
                <tr className="text-muted-foreground text-xs">
                  <th className="text-left py-2 font-medium">Kode</th>
                  <th className="text-left py-2 font-medium">Nama</th>
                  <th className="text-left py-2 font-medium">Alias dari (Kode Utama)</th>
                  <th className="w-16" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {fishTypes.map(ft => {
                  const currentCanonical = ft.canonical_fish_type_id
                    ? fishTypes.find(x => x.id === ft.canonical_fish_type_id)
                    : null
                  const isSaving = aliasSaving === ft.id
                  const isCanonicalTarget = fishTypes.some(x => x.canonical_fish_type_id === ft.id)
                  return (
                    <tr key={ft.id} className={isCanonicalTarget ? 'bg-muted/20' : ''}>
                      <td className="py-2 pr-3">
                        <span className="font-mono font-bold text-primary">{ft.code}</span>
                        {isCanonicalTarget && (
                          <span className="ml-1.5 text-[10px] text-muted-foreground bg-muted px-1 rounded">utama</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground">{ft.name}</td>
                      <td className="py-2 pr-3">
                        {isCanonicalTarget ? (
                          <span className="text-xs text-muted-foreground italic">—</span>
                        ) : (
                          <Select
                            value={currentCanonical?.id ?? '__none__'}
                            onValueChange={(val) => setCanonical(ft.id, val === '__none__' ? null : val)}
                            disabled={isSaving}
                          >
                            <SelectTrigger className="h-7 text-xs w-40">
                              <SelectValue placeholder="Tidak ada" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">— Tidak ada —</SelectItem>
                              {fishTypes
                                .filter(x => x.id !== ft.id && !x.canonical_fish_type_id)
                                .map(x => (
                                  <SelectItem key={x.id} value={x.id}>{x.code} — {x.name}</SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        )}
                      </td>
                      <td className="py-2 text-center">
                        {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto text-muted-foreground" />}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAliasOpen(false)}>Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Receipt image lightbox ── */}
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
            <div className="rounded-lg overflow-hidden bg-white">
              <Image src={previewImg} alt="Foto bon" width={480} height={640}
                className="object-contain w-full" unoptimized />
            </div>
            <div className="flex justify-center mt-2">
              <a href={previewImg} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-white/80 hover:text-white">
                <ImageIcon className="h-3 w-3" /> Buka gambar penuh
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
