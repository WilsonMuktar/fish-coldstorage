'use client'

/**
 * PortalSubmitModal
 *
 * Two-tab submission modal used by all portal "Tambah" actions that go through
 * the pending-review pipeline (same as the Telegram bot).
 *
 * Tab 1 — Upload Foto: user picks a photo, we call /v1/ocr-extract (OCR + Ollama),
 *   show a preview of extracted data, then submit to /v1/reviews/submit → redirect
 *   to the review page so the user can confirm/edit fields exactly as they would
 *   for a bot-submitted receipt.
 *
 * Tab 2 — Isi Manual: user fills in a minimal form (receipt type + fields). We
 *   build the intent_data manually and submit to /v1/reviews/submit → redirect.
 */

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ocrAPI, portalSubmitAPI } from '@/lib/api'
import {
  Camera,
  FileText,
  Loader2,
  CheckCircle,
  X,
  AlertTriangle,
  Plus,
  Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export type ReceiptTypeOption = {
  value: string
  label: string
}

export const RECEIPT_TYPE_OPTIONS: ReceiptTypeOption[] = [
  { value: 'timbangan_ikan_basah', label: 'Timbangan Ikan' },
  { value: 'timbangan_sortir', label: 'Timbangan Sortir' },
  { value: 'bon_penjualan', label: 'Bon Penjualan' },
  { value: 'bon_pengeluaran', label: 'Bon Pengeluaran' },
  { value: 'beli_ikan', label: 'Beli Ikan (HPP)' },
  { value: 'beli_item', label: 'Beli Item' },
  { value: 'bayar_jasa', label: 'Bayar Jasa' },
]

interface Props {
  open: boolean
  onClose: () => void
  /** Pre-select a receipt type (e.g. "timbangan_ikan_basah"). User can still change it. */
  defaultReceiptType?: string
  /** Called after a receipt is created, before redirect */
  onCreated?: (token: string) => void
}

type Tab = 'photo' | 'manual'

interface ManualRow {
  key: string
  value: string
}

function buildIntentFromManual(receiptType: string, date: string, rows: ManualRow[]): unknown {
  const fields: Record<string, string> = { date }
  for (const r of rows) {
    if (r.key.trim()) fields[r.key.trim()] = r.value
  }
  // Wrap in the shape the review service expects
  switch (receiptType) {
    case 'timbangan_ikan_basah':
      return { timbangan: { date, vessel_name: fields.vessel_name || '', transports: fields.transports || '', fish_columns: [], total_kg: 0 } }
    case 'timbangan_sortir':
      return { sortir: { date, vessel_name: fields.vessel_name || '', transports: fields.transports || '', columns: [], total_weight: 0 } }
    case 'bon_penjualan':
      return { receipt: { receipt_type: 'bon_penjualan', date, vendor_name: fields.vendor_name || '', receipt_no: fields.receipt_no || '', items: [], total_amount: 0 } }
    case 'bon_pengeluaran':
      return { receipt: { receipt_type: 'bon_pengeluaran', date, vendor_name: fields.vendor_name || '', items: [], total_amount: 0 } }
    case 'beli_ikan':
      return { beli_ikan: { date, vessel_name: fields.vessel_name || '', notes: fields.notes || '', timbangan_ids: [], items: [] } }
    case 'beli_item':
    case 'bayar_jasa':
      return { expense: { date, description: fields.description || '', amount: parseFloat(fields.amount || '0') || 0, notes: fields.notes || '' } }
    default:
      return fields
  }
}

const MANUAL_HINTS: Record<string, { label: string; placeholder: string }[]> = {
  timbangan_ikan_basah: [
    { label: 'Nama Kapal', placeholder: 'vessel_name' },
    { label: 'Transport', placeholder: 'transports' },
  ],
  timbangan_sortir: [
    { label: 'Nama Kapal', placeholder: 'vessel_name' },
    { label: 'Transport', placeholder: 'transports' },
  ],
  bon_penjualan: [
    { label: 'Kepada', placeholder: 'vendor_name' },
    { label: 'No. Bon', placeholder: 'receipt_no' },
  ],
  bon_pengeluaran: [
    { label: 'Vendor', placeholder: 'vendor_name' },
  ],
  beli_ikan: [
    { label: 'Nama Kapal', placeholder: 'vessel_name' },
    { label: 'Catatan', placeholder: 'notes' },
  ],
  beli_item: [
    { label: 'Keterangan', placeholder: 'description' },
    { label: 'Nominal', placeholder: 'amount' },
    { label: 'Catatan', placeholder: 'notes' },
  ],
  bayar_jasa: [
    { label: 'Keterangan', placeholder: 'description' },
    { label: 'Nominal', placeholder: 'amount' },
    { label: 'Catatan', placeholder: 'notes' },
  ],
}

export function PortalSubmitModal({ open, onClose, defaultReceiptType, onCreated }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('photo')
  const [receiptType, setReceiptType] = useState(defaultReceiptType || 'timbangan_ikan_basah')

  // Photo tab state
  const fileRef = useRef<HTMLInputElement>(null)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [ocrState, setOcrState] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [ocrResult, setOcrResult] = useState<unknown>(null)
  const [ocrError, setOcrError] = useState('')

  // Manual tab state
  const [manualDate, setManualDate] = useState(new Date().toISOString().slice(0, 10))
  const [manualRows, setManualRows] = useState<ManualRow[]>([{ key: '', value: '' }])

  // Shared submit state
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  function resetAll() {
    setTab('photo')
    setReceiptType(defaultReceiptType || 'timbangan_ikan_basah')
    setPhotoFile(null)
    setPhotoPreview(null)
    setOcrState('idle')
    setOcrResult(null)
    setOcrError('')
    setManualDate(new Date().toISOString().slice(0, 10))
    setManualRows([{ key: '', value: '' }])
    setSubmitting(false)
    setSubmitError('')
  }

  function handleClose() {
    resetAll()
    onClose()
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
    setOcrState('idle')
    setOcrResult(null)
    setOcrError('')
  }

  async function runOCR() {
    if (!photoFile) return
    setOcrState('running')
    setOcrError('')
    try {
      const result = await ocrAPI.extract(photoFile, receiptType)

      // Resolve the effective receipt type (OCR result may override)
      const r = result as { type?: string }
      const typeMap: Record<string, string> = {
        timbangan_ikan_basah: 'timbangan_ikan_basah',
        timbangan_sortir: 'timbangan_sortir',
        bon_penjualan: 'bon_penjualan',
        bon_pengeluaran: 'bon_pengeluaran',
        receipt: 'bon_pengeluaran',
      }
      const resolvedType = (r.type && typeMap[r.type]) ? typeMap[r.type] : receiptType

      setOcrResult(result)
      setOcrState('done')
      if (resolvedType !== receiptType) setReceiptType(resolvedType)

      // Auto-submit: go straight to review page
      await submitPhoto(result, resolvedType, photoFile)
    } catch (err: unknown) {
      setOcrError(err instanceof Error ? err.message : 'OCR gagal')
      setOcrState('error')
    }
  }

  async function submitPhoto(intentData: unknown, rType: string, file: File | null) {
    setSubmitting(true)
    setSubmitError('')
    try {
      const res = await portalSubmitAPI.submit(rType, intentData, file)
      if (onCreated) onCreated(res.review_token)
      handleClose()
      router.push(`/review/${res.review_token}`)
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Gagal membuat draft')
      setOcrState('done') // keep done state so user can retry submit manually
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSubmit() {
    setSubmitting(true)
    setSubmitError('')
    try {
      let intentData: unknown
      let imageFile: File | null = null

      if (tab === 'photo') {
        intentData = ocrResult
        imageFile = photoFile
      } else {
        intentData = buildIntentFromManual(receiptType, manualDate, manualRows)
        imageFile = photoFile  // optional photo attached to manual entry
      }

      const res = await portalSubmitAPI.submit(receiptType, intentData, imageFile)
      if (onCreated) onCreated(res.review_token)
      handleClose()
      router.push(`/review/${res.review_token}`)
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Gagal membuat draft')
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmitPhoto = tab === 'photo' && photoFile !== null
  const canSubmitManual = tab === 'manual'

  const hints = MANUAL_HINTS[receiptType] || []

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Tambah Bon / Transaksi</DialogTitle>
        </DialogHeader>

        {/* Receipt type selector */}
        <div>
          <label className="text-xs font-medium mb-1.5 block" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Jenis Bon
          </label>
          <select
            value={receiptType}
            onChange={(e) => setReceiptType(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {RECEIPT_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Tabs */}
        <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid hsl(var(--border))' }}>
          {([['photo', 'Upload Foto + OCR'], ['manual', 'Isi Manual']] as [Tab, string][]).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn('flex-1 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1.5', tab === t ? 'text-white' : 'hover:text-white')}
              style={tab === t ? { background: 'hsl(var(--sidebar-active))' } : { color: 'hsl(var(--muted-foreground))' }}
            >
              {t === 'photo' ? <Camera className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
              {label}
            </button>
          ))}
        </div>

        {/* Shared hidden file input — always mounted so fileRef works from both tabs */}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />

        {/* Photo tab */}
        {tab === 'photo' && (
          <div className="space-y-3">

            {!photoPreview ? (
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full flex flex-col items-center justify-center gap-2 rounded-xl py-10 text-sm transition-colors hover:text-white"
                style={{ border: '2px dashed hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
              >
                <Camera className="h-8 w-8 opacity-50" />
                <span>Ketuk untuk pilih foto struk</span>
                <span className="text-xs opacity-60">JPG, PNG, HEIC didukung</span>
              </button>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoPreview} alt="preview" className="max-h-48 w-full rounded-lg object-contain" style={{ border: '1px solid hsl(var(--border))' }} />
                  <button
                    onClick={() => { setPhotoFile(null); setPhotoPreview(null); setOcrState('idle'); setOcrResult(null); if (fileRef.current) fileRef.current.value = '' }}
                    className="absolute -top-2 -right-2 rounded-full bg-red-500 text-white p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>

                {ocrState === 'idle' && (
                  <Button onClick={runOCR} className="w-full gap-2" variant="outline">
                    <Camera className="h-4 w-4" /> Jalankan OCR Otomatis
                  </Button>
                )}
                {(ocrState === 'running' || (ocrState === 'done' && submitting)) && (
                  <div className="flex items-center justify-center gap-2 py-3 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {ocrState === 'running' ? 'Menganalisis gambar... (bisa 30–90 detik)' : 'Menyimpan dan membuka halaman review...'}
                  </div>
                )}
                {ocrState === 'done' && !submitting && (
                  <div className="rounded-lg px-3 py-2 flex items-center gap-2" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)' }}>
                    <CheckCircle className="h-4 w-4 shrink-0 text-emerald-400" />
                    <span className="text-xs text-emerald-400 font-medium">OCR selesai — data akan tampil di halaman review</span>
                  </div>
                )}
                {ocrState === 'error' && (
                  <div className="space-y-2">
                    <div className="rounded-lg px-3 py-2 flex items-center gap-2" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' }}>
                      <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: '#f59e0b' }} />
                      <span className="text-xs" style={{ color: '#f59e0b' }}>OCR gagal: {ocrError}. Foto tetap bisa disimpan untuk diisi manual di halaman review.</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Manual tab */}
        {tab === 'manual' && (
          <div className="space-y-3">
            {/* Photo upload — optional, same file input as photo tab */}
            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: 'hsl(var(--muted-foreground))' }}>
                Foto Struk (opsional)
              </label>
              {photoPreview ? (
                <div className="relative inline-block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoPreview} alt="preview" className="h-24 w-auto rounded-lg object-cover" style={{ border: '1px solid hsl(var(--border))' }} />
                  <button
                    type="button"
                    onClick={() => { setPhotoFile(null); setPhotoPreview(null); if (fileRef.current) fileRef.current.value = '' }}
                    className="absolute -top-2 -right-2 rounded-full bg-red-500 text-white p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors hover:text-white"
                  style={{ border: '1px dashed hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
                >
                  <Camera className="h-3.5 w-3.5" /> Pilih foto struk
                </button>
              )}
            </div>

            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'hsl(var(--muted-foreground))' }}>Tanggal</label>
              <Input type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} />
            </div>

            {hints.length > 0 && (
              <div className="space-y-2">
                {hints.map((h) => (
                  <div key={h.placeholder}>
                    <label className="text-xs font-medium mb-1 block" style={{ color: 'hsl(var(--muted-foreground))' }}>{h.label}</label>
                    <Input
                      placeholder={h.label}
                      value={manualRows.find(r => r.key === h.placeholder)?.value || ''}
                      onChange={(e) => setManualRows(prev => {
                        const idx = prev.findIndex(r => r.key === h.placeholder)
                        if (idx >= 0) {
                          const next = [...prev]
                          next[idx] = { ...next[idx], value: e.target.value }
                          return next
                        }
                        return [...prev, { key: h.placeholder, value: e.target.value }]
                      })}
                    />
                  </div>
                ))}
              </div>
            )}

            <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Data tambahan (isian lengkap tersedia di halaman review setelah disimpan sebagai draft)
            </p>
          </div>
        )}

        {submitError && (
          <p className="text-xs text-red-400">{submitError}</p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={handleClose}>Batal</Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || (tab === 'photo' && !canSubmitPhoto) || ocrState === 'running'}
          >
            {submitting ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Menyimpan...</> : 'Simpan & Review'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
