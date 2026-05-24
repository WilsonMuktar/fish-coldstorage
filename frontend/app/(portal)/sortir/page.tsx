'use client'

import { useCallback, useEffect, useState } from 'react'
import { fishAPI, sortingAPI } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Plus, Trash2, ChevronLeft, ChevronRight, RefreshCw, Layers, ArrowRight } from 'lucide-react'
import { formatDate } from '@/lib/formatters'

interface FishType {
  id: string
  code: string
  name: string
  is_sorted: boolean
  source_fish_type_id?: string
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
  created_by_name: string
  outputs: SortingOutput[]
  created_at: string
}

const PAGE_SIZE = 20

export default function SortirPage() {
  const [ops, setOps] = useState<SortingOperation[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)

  const [fishTypes, setFishTypes] = useState<FishType[]>([])
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  // form
  const [formSource, setFormSource] = useState('')
  const [formInputKg, setFormInputKg] = useState('')
  const [formWasteKg, setFormWasteKg] = useState('0')
  const [formDate, setFormDate] = useState(new Date().toISOString().slice(0, 10))
  const [formNotes, setFormNotes] = useState('')
  const [formOutputs, setFormOutputs] = useState<{ fish_type_id: string; output_kg: string }[]>([
    { fish_type_id: '', output_kg: '' },
  ])

  const loadOps = useCallback(async (p: number) => {
    setLoading(true)
    try {
      const res = await sortingAPI.getAll(`limit=${PAGE_SIZE}&offset=${p * PAGE_SIZE}`) as { data: SortingOperation[]; total: number }
      setOps(res.data || [])
      setTotal(res.total || 0)
    } catch {
      toast.error('Gagal memuat data sortir')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadOps(page) }, [loadOps, page])

  useEffect(() => {
    fishAPI.getTypes().then(res => {
      setFishTypes(((res as { data: FishType[] }).data || []))
    }).catch(() => {})
  }, [])

  const rawTypes = fishTypes.filter(t => !t.is_sorted)
  const sortedVariantsFor = (sourceId: string) => fishTypes.filter(t => t.is_sorted && t.source_fish_type_id === sourceId)

  const addOutputRow = () => setFormOutputs(prev => [...prev, { fish_type_id: '', output_kg: '' }])
  const removeOutputRow = (i: number) => setFormOutputs(prev => prev.filter((_, idx) => idx !== i))
  const updateOutput = (i: number, field: 'fish_type_id' | 'output_kg', val: string) =>
    setFormOutputs(prev => prev.map((o, idx) => idx === i ? { ...o, [field]: val } : o))

  const totalOutputKg = formOutputs.reduce((s, o) => s + (parseFloat(o.output_kg) || 0), 0)
  const totalAccountedKg = totalOutputKg + (parseFloat(formWasteKg) || 0)
  const inputKg = parseFloat(formInputKg) || 0
  const unaccounted = inputKg - totalAccountedKg

  const openCreate = () => {
    setFormSource('')
    setFormInputKg('')
    setFormWasteKg('0')
    setFormDate(new Date().toISOString().slice(0, 10))
    setFormNotes('')
    setFormOutputs([{ fish_type_id: '', output_kg: '' }])
    setOpen(true)
  }

  const handleSave = async () => {
    if (!formSource) { toast.error('Pilih ikan mentah asal'); return }
    if (!formInputKg || inputKg <= 0) { toast.error('Input berat wajib diisi'); return }
    const validOutputs = formOutputs.filter(o => o.fish_type_id && parseFloat(o.output_kg) > 0)
    if (validOutputs.length === 0) { toast.error('Minimal satu output sortir'); return }
    if (totalAccountedKg > inputKg + 0.001) {
      toast.error(`Total output (${totalAccountedKg.toFixed(2)} kg) melebihi input (${inputKg.toFixed(2)} kg)`)
      return
    }

    setSaving(true)
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
      setOpen(false)
      loadOps(0)
      setPage(0)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Gagal menyimpan')
    } finally {
      setSaving(false)
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const selectedRawVariants = formSource ? sortedVariantsFor(formSource) : []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Sortir Ikan</h2>
          <p className="text-sm text-muted-foreground">
            Catat proses sortir ikan mentah menjadi grade — {total.toLocaleString('id-ID')} operasi
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => loadOps(page)} className="gap-2">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" /> Catat Sortir
          </Button>
        </div>
      </div>

      {/* Operations table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Tanggal</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Ikan Asal</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Input (kg)</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Output Grade</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Susut (kg)</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Catatan</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><div className="h-4 w-20 animate-pulse rounded bg-muted" /></td>
                      ))}
                    </tr>
                  ))
                ) : ops.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                      <Layers className="mx-auto h-8 w-8 mb-2 opacity-30" />
                      Belum ada operasi sortir
                    </td>
                  </tr>
                ) : (
                  ops.map(op => (
                    <tr key={op.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap text-xs">
                        {formatDate(op.sort_date)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono font-semibold text-primary">{op.source_fish_type_code}</span>
                        <span className="text-xs text-muted-foreground ml-1">{op.source_fish_type_name}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {op.input_kg.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {(op.outputs || []).map(o => (
                            <Badge key={o.fish_type_id} variant="outline" className="text-xs gap-1">
                              <span className="font-mono font-semibold">{o.fish_type_code}</span>
                              <ArrowRight className="h-2.5 w-2.5 text-muted-foreground" />
                              <span>{o.output_kg.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} kg</span>
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                        {op.waste_kg > 0 ? op.waste_kg.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs truncate">
                        {op.notes || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <p className="text-xs text-muted-foreground">
                Halaman {page + 1} dari {totalPages}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page === 0}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Catat Sortir Ikan</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Ikan Mentah Asal <span className="text-red-500">*</span></Label>
                <Select value={formSource} onValueChange={v => { setFormSource(v); setFormOutputs([{ fish_type_id: '', output_kg: '' }]) }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih jenis ikan..." />
                  </SelectTrigger>
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
                <Input
                  type="number" step="0.01" min="0"
                  value={formInputKg}
                  onChange={e => setFormInputKg(e.target.value)}
                  placeholder="100"
                />
              </div>
              <div className="space-y-1">
                <Label>Susut / Buangan (kg)</Label>
                <Input
                  type="number" step="0.01" min="0"
                  value={formWasteKg}
                  onChange={e => setFormWasteKg(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>

            {/* Output rows */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Output Grade <span className="text-red-500">*</span></Label>
                <button onClick={addOutputRow} className="text-xs text-primary hover:underline flex items-center gap-1">
                  <Plus className="h-3 w-3" /> Tambah baris
                </button>
              </div>
              {formOutputs.map((o, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Select
                    value={o.fish_type_id}
                    onValueChange={v => updateOutput(i, 'fish_type_id', v)}
                  >
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
                  <Input
                    type="number" step="0.01" min="0"
                    value={o.output_kg}
                    onChange={e => updateOutput(i, 'output_kg', e.target.value)}
                    placeholder="kg"
                    className="w-24"
                  />
                  {formOutputs.length > 1 && (
                    <button onClick={() => removeOutputRow(i)} className="text-red-400 hover:text-red-600 p-1">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}

              {/* Balance indicator */}
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
              <Input value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder="Operator, shift, kondisi sortir..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Menyimpan...' : 'Simpan Sortir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
