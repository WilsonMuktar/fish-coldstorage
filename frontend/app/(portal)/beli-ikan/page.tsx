'use client'

import { useEffect, useState, useRef } from 'react'
import { beliIkanAPI, fishAPI } from '@/lib/api'
import { BeliIkanRecord, BeliIkanItem, Vessel, TimbanganRecord } from '@/types/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, ChevronDown, ChevronUp, Trash2, ShoppingCart, X } from 'lucide-react'
import { cn } from '@/lib/utils'

function fmt(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

interface FormItem {
  fish_code: string
  quantity_kg: string
  price_per_kg: string
}

const emptyItem = (): FormItem => ({ fish_code: '', quantity_kg: '', price_per_kg: '' })

export default function BeliIkanPage() {
  const [records, setRecords] = useState<BeliIkanRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Form state
  const [vessels, setVessels] = useState<Vessel[]>([])
  const [timbangans, setTimbangans] = useState<TimbanganRecord[]>([])
  const [vesselName, setVesselName] = useState('')
  const [buyDate, setBuyDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<FormItem[]>([emptyItem()])
  const [selectedTimIDs, setSelectedTimIDs] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    loadRecords()
    fishAPI.getVessels().then((r: unknown) => {
      const res = r as { data: unknown[] }
      setVessels((res.data || []) as Vessel[])
    }).catch(() => {})
    fishAPI.getTimbangan().then((r: unknown) => {
      const res = r as { data: unknown[] }
      setTimbangans((res.data || []) as TimbanganRecord[])
    }).catch(() => {})
  }, [])

  function loadRecords() {
    setLoading(true)
    beliIkanAPI
      .getAll()
      .then((r) => {
        const res = r as { data: BeliIkanRecord[] }
        setRecords(res.data || [])
      })
      .catch(() => setRecords([]))
      .finally(() => setLoading(false))
  }

  function resetForm() {
    setVesselName('')
    setBuyDate(new Date().toISOString().slice(0, 10))
    setNotes('')
    setItems([emptyItem()])
    setSelectedTimIDs([])
    setSaveError('')
  }

  function updateItem(i: number, field: keyof FormItem, val: string) {
    setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, [field]: val } : it))
  }

  function addItem() {
    setItems((prev) => [...prev, emptyItem()])
  }

  function removeItem(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i))
  }

  function toggleTim(id: string) {
    setSelectedTimIDs((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaveError('')
    const validItems = items.filter((it) => it.fish_code && parseFloat(it.quantity_kg) > 0)
    if (validItems.length === 0) {
      setSaveError('Minimal satu item ikan harus diisi')
      return
    }
    if (!vesselName) {
      setSaveError('Nama kapal harus diisi')
      return
    }
    const payload = {
      beli_ikan: {
        vessel_name: vesselName,
        date: buyDate,
        notes,
        timbangan_ids: selectedTimIDs,
        items: validItems.map((it) => ({
          fish_code: it.fish_code,
          quantity_kg: parseFloat(it.quantity_kg),
          price_per_kg: parseFloat(it.price_per_kg) || 0,
        })),
      },
    }
    setSaving(true)
    try {
      await beliIkanAPI.create(payload)
      resetForm()
      setShowForm(false)
      loadRecords()
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Gagal menyimpan')
    } finally {
      setSaving(false)
    }
  }

  const total = items.reduce((sum, it) => {
    const qty = parseFloat(it.quantity_kg) || 0
    const price = parseFloat(it.price_per_kg) || 0
    return sum + qty * price
  }, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>
            Beli Ikan
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Pencatatan pembelian ikan dari kapal (HPP)
          </p>
        </div>
      </div>

      {/* Create form — hidden, use header Upload Bon button instead */}
      {false && showForm && (
        <div
          className="rounded-xl p-5"
          style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
              Catat Pembelian Baru
            </h2>
            <button onClick={() => setShowForm(false)}>
              <X className="h-4 w-4" style={{ color: 'hsl(var(--muted-foreground))' }} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Nama Kapal *
                </label>
                <Input
                  list="vessel-list"
                  value={vesselName}
                  onChange={(e) => setVesselName(e.target.value)}
                  placeholder="Nama kapal..."
                  required
                />
                <datalist id="vessel-list">
                  {vessels.map((v) => <option key={v.id} value={v.name} />)}
                </datalist>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Tanggal Beli
                </label>
                <Input type="date" value={buyDate} onChange={(e) => setBuyDate(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Catatan
                </label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opsional..." />
              </div>
            </div>

            {/* Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Daftar Ikan *
                </label>
                <button type="button" onClick={addItem} className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1">
                  <Plus className="h-3 w-3" /> Tambah Baris
                </button>
              </div>
              <div className="space-y-2">
                {items.map((it, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                    <Input
                      placeholder="Kode ikan"
                      value={it.fish_code}
                      onChange={(e) => updateItem(i, 'fish_code', e.target.value)}
                    />
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Qty (kg)"
                      value={it.quantity_kg}
                      onChange={(e) => updateItem(i, 'quantity_kg', e.target.value)}
                    />
                    <Input
                      type="number"
                      min="0"
                      step="100"
                      placeholder="Harga/kg"
                      value={it.price_per_kg}
                      onChange={(e) => updateItem(i, 'price_per_kg', e.target.value)}
                    />
                    <button type="button" onClick={() => removeItem(i)} disabled={items.length === 1}>
                      <Trash2 className={cn('h-4 w-4', items.length === 1 ? 'opacity-20' : 'text-red-400')} />
                    </button>
                  </div>
                ))}
              </div>
              {total > 0 && (
                <p className="text-right text-sm font-semibold mt-2" style={{ color: 'hsl(var(--foreground))' }}>
                  Total: {fmt(total)}
                </p>
              )}
            </div>

            {/* Link timbangan */}
            {timbangans.length > 0 && (
              <div>
                <label className="text-xs font-medium mb-2 block" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Tautkan ke Timbangan (opsional)
                </label>
                <div className="max-h-40 overflow-y-auto space-y-1 rounded-lg p-2" style={{ border: '1px solid hsl(var(--border))' }}>
                  {timbangans.map((t) => {
                    const id = t.id
                    const checked = selectedTimIDs.includes(id)
                    return (
                      <label key={id} className="flex items-center gap-2 cursor-pointer rounded px-2 py-1 hover:bg-white/5">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleTim(id)}
                          className="accent-cyan-400"
                        />
                        <span className="text-xs" style={{ color: 'hsl(var(--foreground))' }}>
                          {t.vessel_name || '—'} · {fmtDate(t.timbang_date || t.weigh_date || t.created_at)} · {t.total_weight_kg || t.total_kg || 0} kg
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}

            {saveError && (
              <p className="text-xs text-red-400">{saveError}</p>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                Batal
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Menyimpan...' : 'Simpan'}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Records list */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ border: '1px solid hsl(var(--border))' }}
      >
        <div className="px-4 py-3" style={{ background: 'hsl(var(--card))', borderBottom: '1px solid hsl(var(--border))' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
            Riwayat Pembelian
          </h2>
        </div>

        {loading ? (
          <div className="space-y-2 p-4" style={{ background: 'hsl(var(--card))' }}>
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
          </div>
        ) : records.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-16 gap-3"
            style={{ background: 'hsl(var(--card))' }}
          >
            <ShoppingCart className="h-10 w-10 opacity-20" style={{ color: 'hsl(var(--muted-foreground))' }} />
            <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Belum ada catatan pembelian ikan
            </p>
          </div>
        ) : (
          <div style={{ background: 'hsl(var(--card))' }}>
            {records.map((rec) => {
              const expanded = expandedId === rec.id
              return (
                <div
                  key={rec.id}
                  style={{ borderBottom: '1px solid hsl(var(--border))' }}
                >
                  <button
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors text-left"
                    onClick={() => setExpandedId(expanded ? null : rec.id)}
                  >
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="text-sm font-medium" style={{ color: 'hsl(var(--foreground))' }}>
                          {rec.vessel_name || '—'}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                          {fmtDate(rec.buy_date)}
                          {rec.notes && ` · ${rec.notes}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-emerald-400">
                        {fmt(rec.total_amount)}
                      </span>
                      {expanded
                        ? <ChevronUp className="h-4 w-4" style={{ color: 'hsl(var(--muted-foreground))' }} />
                        : <ChevronDown className="h-4 w-4" style={{ color: 'hsl(var(--muted-foreground))' }} />
                      }
                    </div>
                  </button>

                  {expanded && rec.items && rec.items.length > 0 && (
                    <div className="px-4 pb-3">
                      <table className="w-full text-xs">
                        <thead>
                          <tr style={{ color: 'hsl(var(--muted-foreground))' }}>
                            <th className="text-left pb-1 font-medium">Kode Ikan</th>
                            <th className="text-right pb-1 font-medium">Qty (kg)</th>
                            <th className="text-right pb-1 font-medium">Harga/kg</th>
                            <th className="text-right pb-1 font-medium">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rec.items.map((it, i) => (
                            <tr key={i} style={{ color: 'hsl(var(--foreground))' }}>
                              <td className="py-0.5">{it.fish_code}</td>
                              <td className="text-right py-0.5">{it.quantity_kg.toFixed(1)}</td>
                              <td className="text-right py-0.5">{fmt(it.price_per_kg)}</td>
                              <td className="text-right py-0.5 font-medium">{fmt(it.total_amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
