'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { expenseAPI } from '@/lib/api'
import { Expense } from '@/types/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, X, Receipt, Camera, ImageIcon, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8002'

type Category = 'beli_item' | 'bayar_jasa' | 'bon_pengeluaran' | ''

const CATEGORIES: { value: Category; label: string; color: string }[] = [
  { value: '', label: 'Semua', color: '' },
  { value: 'bon_pengeluaran', label: 'Bon Pengeluaran', color: 'text-blue-400' },
  { value: 'beli_item', label: 'Beli Item', color: 'text-orange-400' },
  { value: 'bayar_jasa', label: 'Bayar Jasa', color: 'text-purple-400' },
]

function fmt(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

function categoryLabel(c: string) {
  return CATEGORIES.find((x) => x.value === c)?.label ?? c
}

function categoryColor(c: string) {
  return CATEGORIES.find((x) => x.value === c)?.color ?? 'text-gray-400'
}

export default function PengeluaranPage() {
  const router = useRouter()
  const [records, setRecords] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Category>('')
  const [showForm, setShowForm] = useState(false)

  // Form state
  const [category, setCategory] = useState<'beli_item' | 'bayar_jasa'>('beli_item')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadRecords()
  }, [filter])

  function loadRecords() {
    setLoading(true)
    const params = filter ? `category=${filter}` : ''
    expenseAPI
      .getAll(params || undefined)
      .then((r) => {
        const res = r as { data: Expense[] }
        setRecords(res.data || [])
      })
      .catch(() => setRecords([]))
      .finally(() => setLoading(false))
  }

  function resetForm() {
    setCategory('beli_item')
    setDate(new Date().toISOString().slice(0, 10))
    setDescription('')
    setAmount('')
    setNotes('')
    setPhotoFile(null)
    setPhotoPreview(null)
    setSaveError('')
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    const url = URL.createObjectURL(file)
    setPhotoPreview(url)
  }

  function clearPhoto() {
    setPhotoFile(null)
    setPhotoPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaveError('')
    const amt = parseFloat(amount)
    if (!description) { setSaveError('Keterangan harus diisi'); return }
    if (!amt || amt <= 0) { setSaveError('Nominal harus diisi'); return }

    setSaving(true)
    try {
      const created = await expenseAPI.create({ date, category, description, amount: amt, notes }) as Expense
      if (photoFile && created?.id) {
        try {
          await expenseAPI.uploadPhoto(created.id, photoFile)
        } catch {
          // photo upload failure is non-fatal
        }
      }
      resetForm()
      setShowForm(false)
      loadRecords()
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Gagal menyimpan')
    } finally {
      setSaving(false)
    }
  }

  const total = records.reduce((s, r) => s + r.amount, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>
            Pengeluaran
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Beli item &amp; bayar jasa operasional
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
              Catat Pengeluaran Baru
            </h2>
            <button onClick={() => setShowForm(false)}>
              <X className="h-4 w-4" style={{ color: 'hsl(var(--muted-foreground))' }} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Category toggle */}
            <div>
              <label className="text-xs font-medium mb-2 block" style={{ color: 'hsl(var(--muted-foreground))' }}>
                Jenis *
              </label>
              <div className="flex gap-2">
                {(['beli_item', 'bayar_jasa'] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className={cn('px-4 py-1.5 rounded-lg text-xs font-medium transition-colors', category === c ? 'text-white' : 'hover:text-white')}
                    style={
                      category === c
                        ? { background: 'hsl(var(--sidebar-active))' }
                        : { color: 'hsl(var(--muted-foreground))', border: '1px solid hsl(var(--border))' }
                    }
                  >
                    {categoryLabel(c)}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className="text-xs font-medium mb-1 block" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Keterangan *
                </label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={category === 'beli_item' ? 'Contoh: Plastik 1 kg × 100 pcs' : 'Contoh: Jasa angkut kapal X'}
                  required
                />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Tanggal
                </label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Nominal (Rp) *
                </label>
                <Input
                  type="number"
                  min="0"
                  step="1000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Catatan
                </label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opsional..." />
              </div>
            </div>

            {/* Photo upload */}
            <div>
              <label className="text-xs font-medium mb-2 block" style={{ color: 'hsl(var(--muted-foreground))' }}>
                Foto Struk (opsional)
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoChange}
              />
              {photoPreview ? (
                <div className="relative inline-block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photoPreview ?? undefined}
                    alt="preview"
                    className="h-32 w-auto rounded-lg object-cover"
                    style={{ border: '1px solid hsl(var(--border))' }}
                  />
                  <button
                    type="button"
                    onClick={clearPhoto}
                    className="absolute -top-2 -right-2 rounded-full p-0.5 bg-red-500 text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-medium transition-colors hover:text-white"
                  style={{ border: '1px dashed hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
                >
                  <Camera className="h-4 w-4" />
                  Pilih foto struk
                </button>
              )}
            </div>

            {saveError && <p className="text-xs text-red-400">{saveError}</p>}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Batal</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</Button>
            </div>
          </form>
        </div>
      )}

      {/* Filter tabs + total */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ border: '1px solid hsl(var(--border))' }}
      >
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ background: 'hsl(var(--card))', borderBottom: '1px solid hsl(var(--border))' }}
        >
          <div className="flex gap-1">
            {CATEGORIES.map((c) => (
              <button
                key={c.value}
                onClick={() => setFilter(c.value)}
                className={cn('px-3 py-1 rounded-md text-xs font-medium transition-colors', filter === c.value ? 'text-white' : 'hover:text-white')}
                style={
                  filter === c.value
                    ? { background: 'hsl(var(--sidebar-active))' }
                    : { color: 'hsl(var(--muted-foreground))' }
                }
              >
                {c.label}
              </button>
            ))}
          </div>
          {!loading && records.length > 0 && (
            <span className="text-xs font-semibold" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Total: <span style={{ color: 'hsl(var(--foreground))' }}>{fmt(total)}</span>
            </span>
          )}
        </div>

        {loading ? (
          <div className="space-y-2 p-4" style={{ background: 'hsl(var(--card))' }}>
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
          </div>
        ) : records.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-16 gap-3"
            style={{ background: 'hsl(var(--card))' }}
          >
            <Receipt className="h-10 w-10 opacity-20" style={{ color: 'hsl(var(--muted-foreground))' }} />
            <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Belum ada catatan pengeluaran
            </p>
          </div>
        ) : (
          <div style={{ background: 'hsl(var(--card))' }}>
            {records.map((rec) => (
              <div
                key={rec.id}
                className="flex items-center justify-between px-4 py-3"
                style={{ borderBottom: '1px solid hsl(var(--border))' }}
              >
                <div className="flex items-center gap-3">
                  {/* Thumbnail or placeholder */}
                  {rec.photo_path ? (
                    <a
                      href={`${BASE_URL}/data/${rec.photo_path}`}
                      target="_blank"
                      rel="noreferrer"
                      className="relative shrink-0 group"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`${BASE_URL}/data/${rec.photo_path}`}
                        alt="struk"
                        className="h-10 w-10 rounded-md object-cover"
                        style={{ border: '1px solid hsl(var(--border))' }}
                      />
                      <div className="absolute inset-0 rounded-md bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <ExternalLink className="h-3 w-3 text-white" />
                      </div>
                    </a>
                  ) : (
                    <div
                      className="h-10 w-10 shrink-0 rounded-md flex items-center justify-center"
                      style={{ background: 'hsl(var(--muted))', border: '1px solid hsl(var(--border))' }}
                    >
                      <ImageIcon className="h-4 w-4 opacity-30" style={{ color: 'hsl(var(--muted-foreground))' }} />
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={cn('text-xs font-medium', categoryColor(rec.category))}>
                        {categoryLabel(rec.category)}
                      </span>
                      <span className="text-sm" style={{ color: 'hsl(var(--foreground))' }}>
                        {rec.description}
                      </span>
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      {fmtDate(rec.date)}{rec.notes ? ` · ${rec.notes}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm font-semibold" style={{ color: '#f87171' }}>
                    {fmt(rec.amount)}
                  </span>
                  {rec.review_token && (
                    <button
                      onClick={() => router.push(`/review/${rec.review_token}`)}
                      title="Lihat detail bon"
                      className="rounded-md p-1.5 transition-colors hover:text-white"
                      style={{ color: 'hsl(var(--muted-foreground))', border: '1px solid hsl(var(--border))' }}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
