'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { formatIDR, formatDate } from '@/lib/formatters'
import { CheckCircle, XCircle, ZoomIn, AlertTriangle, Building2, Plus, Upload } from 'lucide-react'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8002'

interface ReviewData {
  id: string
  receipt_type: 'bon_penjualan' | 'bon_pengeluaran' | 'timbangan_ikan_basah' | 'timbangan_sortir' | 'invoice' | 'beli_ikan' | 'beli_item' | 'bayar_jasa'
  image_url: string
  image_path: string
  status: string
  submitted_via: string
  submitted_at: string
  // extracted_data matches the bot's Intent model
  extracted_data: {
    type?: string
    confidence?: number
    // timbangan_ikan_basah
    timbangan?: {
      date?: string
      vessel_name?: string
      transports?: string
      fish_columns?: Array<{
        fish_code: string
        price_per_kg?: number
        weight_batches?: number[]
        total_weight: number
      }>
      total_weight?: number
      notes?: string
    }
    // timbangan_sortir
    sortir?: {
      date?: string
      vessel_name?: string
      transports?: string
      columns?: Array<{
        source_fish_code: string
        category?: string
        grade: string
        sorted_fish_code: string
        total_weight: number
      }>
      total_weight?: number
      notes?: string
    }
    // bon_penjualan / bon_pengeluaran
    receipt?: {
      receipt_type?: string
      receipt_no?: string
      date?: string
      vendor_name?: string
      items?: Array<{
        fish_code?: string
        item_name?: string
        quantity: number
        unit?: string
        unit_price?: number
        total_price?: number
      }>
      total_amount?: number
      notes?: string
    }
  }
  confirmed_data?: ReviewData['extracted_data']
  review_token?: string
}

interface EditableReceiptItem {
  fish_code: string
  item_name: string
  quantity: string
  unit: string
  unit_price: string
  total: string
}

interface EditableTimbanganRow {
  fish_type_code: string
  fish_type_name: string
  price_per_kg: string
  quantity_kg: string
}

interface EditableSortirRow {
  source_fish_code: string
  category: string   // SF | PC | SP
  grade: string      // 300-500, 1UP, 2UP, etc.
  sorted_fish_code: string
  total_weight: string
}

// SF is a freshness marker, dropped from the sorted code; PC/SP are kept
const deriveSortedCode = (source: string, category: string, grade: string): string => {
  const cat = category.trim().toUpperCase()
  const parts = [source.trim()]
  if (cat && cat !== 'SF') parts.push(cat)
  if (grade.trim()) parts.push(grade.trim())
  return parts.join(' ')
}

export default function ReviewPage() {
  const params = useParams()
  const router = useRouter()
  const token = params?.token as string

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState<ReviewData | null>(null)
  const [done, setDone] = useState<'approved' | 'rejected' | 'revised' | null>(null)
  const [isRevising, setIsRevising] = useState(false)

  // Image zoom
  const [imgZoom, setImgZoom] = useState(false)

  // Photo upload
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  // Reject dialog
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Login gate — shown before approve/reject if not authenticated
  const [loginOpen, setLoginOpen] = useState(false)
  const [loginPhone, setLoginPhone] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [pendingAction, setPendingAction] = useState<'approve' | 'reject' | null>(null)

  const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL || 'http://localhost:8001'

  const isLoggedIn = () =>
    typeof window !== 'undefined' && !!localStorage.getItem('auth_token')

  // Editable form fields
  const [receiptNumber, setReceiptNumber] = useState('')
  const [receiptDate, setReceiptDate] = useState('')
  const [vendorOrCustomer, setVendorOrCustomer] = useState('')
  const [notes, setNotes] = useState('')
  const [receiptItems, setReceiptItems] = useState<EditableReceiptItem[]>([])

  // Timbangan fields
  const [vesselName, setVesselName] = useState('')
  const [vesselId, setVesselId] = useState('')        // selected from dropdown
  const [newVesselName, setNewVesselName] = useState('') // typed when adding new
  const [transportNumber, setTransportNumber] = useState('')
  const [timbanganDate, setTimbanganDate] = useState('')
  const [timbanganRows, setTimbanganRows] = useState<EditableTimbanganRow[]>([])

  // Sortir fields
  const [sortirDate, setSortirDate] = useState('')
  const [sortirVesselName, setSortirVesselName] = useState('')
  const [sortirVesselId, setSortirVesselId] = useState('')
  const [sortirNewVesselName, setSortirNewVesselName] = useState('')
  const [sortirTransports, setSortirTransports] = useState('')
  const [sortirRows, setSortirRows] = useState<EditableSortirRow[]>([])

  // Sorted fish types for dropdowns (is_sorted=true)
  const [sortedFishTypes, setSortedFishTypes] = useState<{ code: string; name: string; source_fish_type_code: string; grade: string }[]>([])
  const FISH_NEW = '__new__'

  // Vessel list for dropdown
  const [vessels, setVessels] = useState<{ id: string; name: string }[]>([])
  const VESSEL_NEW = '__new__'

  // Stock info for bon_penjualan items
  interface StockInfo { available_kg: number; is_sorted: boolean; exists: boolean }
  const [stockMap, setStockMap] = useState<Record<string, StockInfo>>({})
  const [stockLoading, setStockLoading] = useState(false)

  // Invoice fields
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [invoiceCustomer, setInvoiceCustomer] = useState('')
  const [invoiceItems, setInvoiceItems] = useState<Array<{ description: string; quantity: string; unit_price: string; total: string }>>([])
  const [taxAmount, setTaxAmount] = useState('')

  // Beli Ikan fields
  const [beliIkanVessel, setBeliIkanVessel] = useState('')
  const [beliIkanDate, setBeliIkanDate] = useState('')
  const [beliIkanNotes, setBeliIkanNotes] = useState('')
  const [beliIkanItems, setBeliIkanItems] = useState<Array<{ fish_code: string; quantity_kg: string; price_per_kg: string }>>([])

  // Expense (beli_item / bayar_jasa) fields
  const [expenseDate, setExpenseDate] = useState('')
  const [expenseDescription, setExpenseDescription] = useState('')
  const [expenseAmount, setExpenseAmount] = useState('')
  const [expenseNotes, setExpenseNotes] = useState('')
  const [expenseSubcategory, setExpenseSubcategory] = useState<'bayar_jasa' | 'beli_item'>('bayar_jasa')

  useEffect(() => {
    fetch(`${BASE_URL}/v1/public/vessels`)
      .then(r => r.ok ? r.json() : { data: [] })
      .then(d => setVessels((d.data || []) as { id: string; name: string }[]))
      .catch(() => {})
    fetch(`${BASE_URL}/v1/public/fish-types?is_sorted=true`)
      .then(r => r.ok ? r.json() : { data: [] })
      .then(d => setSortedFishTypes((d.data || []) as { code: string; name: string; source_fish_type_code: string; grade: string }[]))
      .catch(() => {})
  }, [])

  // Fetch stock for each item when bon_penjualan items change
  useEffect(() => {
    if (data?.receipt_type !== 'bon_penjualan' || receiptItems.length === 0) return
    const codes = [...new Set(receiptItems.map(i => i.fish_code).filter(Boolean))]
    if (codes.length === 0) return
    setStockLoading(true)
    Promise.all(
      codes.map(code =>
        fetch(`${BASE_URL}/v1/public/stock/${encodeURIComponent(code)}`)
          .then(r => r.ok ? r.json() : { fish_code: code, available_kg: 0, is_sorted: false, exists: false })
          .catch(() => ({ fish_code: code, available_kg: 0, is_sorted: false, exists: false }))
      )
    ).then(results => {
      const map: Record<string, StockInfo> = {}
      results.forEach(d => { map[d.fish_code] = { available_kg: d.available_kg, is_sorted: d.is_sorted, exists: d.exists } })
      setStockMap(map)
    }).finally(() => setStockLoading(false))
  }, [data?.receipt_type, receiptItems, BASE_URL])

  // Vessel matching — runs after both data and vessels list are loaded
  useEffect(() => {
    if (!data || vessels.length === 0) return
    const effective = (data.confirmed_data && Object.keys(data.confirmed_data).length > 0)
      ? data.confirmed_data : data.extracted_data

    if (data.receipt_type === 'timbangan_ikan_basah') {
      const name = effective?.timbangan?.vessel_name || ''
      const matched = vessels.find(v => v.name.toLowerCase() === name.toLowerCase())
      if (matched) {
        setVesselId(matched.id)
      } else if (name) {
        setVesselId(VESSEL_NEW)
        setNewVesselName(name)
      }
    } else if (data.receipt_type === 'timbangan_sortir') {
      const name = effective?.sortir?.vessel_name || ''
      const matched = vessels.find(v => v.name.toLowerCase() === name.toLowerCase())
      if (matched) {
        setSortirVesselId(matched.id)
      } else if (name) {
        setSortirVesselId(VESSEL_NEW)
        setSortirNewVesselName(name)
      }
    }
  }, [data, vessels]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!token) return
    fetch(`${BASE_URL}/v1/reviews/${token}`)
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Token tidak valid' }))
          throw new Error(err.error || 'Token tidak valid atau sudah kedaluwarsa')
        }
        return res.json()
      })
      .then((d: ReviewData) => {
        // Build image_url if backend didn't include it (fallback)
        if (!d.image_url && d.image_path) {
          d.image_url = `${BASE_URL}/data/${d.image_path}`
        }
        setData(d)
        populateForm(d)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [token])

  const populateForm = (d: ReviewData) => {
    // Prefer confirmed_data (reviewer-edited) over extracted_data (raw OCR)
    const effective = (d.confirmed_data && Object.keys(d.confirmed_data).length > 0)
      ? d.confirmed_data
      : d.extracted_data

    if (d.receipt_type === 'timbangan_sortir') {
      const s = effective?.sortir
      setSortirDate(s?.date || '')
      setSortirVesselName(s?.vessel_name || '') // raw name — vessel dropdown matched later
      setSortirTransports(s?.transports || '')
      setSortirRows(
        (s?.columns || []).map(col => ({
          source_fish_code: col.source_fish_code,
          category: col.category || 'SF',
          grade: col.grade,
          sorted_fish_code: col.sorted_fish_code ||
            deriveSortedCode(col.source_fish_code, col.category || 'SF', col.grade),
          total_weight: String(col.total_weight),
        }))
      )
    } else if (d.receipt_type === 'timbangan_ikan_basah') {
      const t = effective?.timbangan
      const name = t?.vessel_name || ''
      setVesselName(name)
      setTransportNumber(t?.transports || '')
      setTimbanganDate(t?.date || '')
      setTimbanganRows(
        (t?.fish_columns || []).map((fc: {
          fish_code?: string; fish_type_code?: string; fish_type_name?: string;
          price_per_kg?: number; total_weight?: number; quantity_kg?: number
        }) => ({
          fish_type_code: fc.fish_type_code || fc.fish_code || '',
          fish_type_name: fc.fish_type_name || fc.fish_type_code || fc.fish_code || '',
          price_per_kg: String(fc.price_per_kg || 0),
          quantity_kg: String(fc.quantity_kg ?? fc.total_weight ?? 0),
        }))
      )
    } else if (d.receipt_type === 'invoice') {
      // Invoice not yet sent by bot — leave blank
    } else if (d.receipt_type === 'beli_ikan') {
      const b = (effective as { beli_ikan?: { vessel_name?: string; date?: string; notes?: string; items?: Array<{ fish_code?: string; quantity_kg?: number; price_per_kg?: number }> } })?.beli_ikan
      setBeliIkanVessel(b?.vessel_name || '')
      setBeliIkanDate(b?.date || '')
      setBeliIkanNotes(b?.notes || '')
      setBeliIkanItems((b?.items || []).map(it => ({
        fish_code: it.fish_code || '',
        quantity_kg: String(it.quantity_kg || 0),
        price_per_kg: String(it.price_per_kg || 0),
      })))
    } else if (d.receipt_type === 'beli_item' || d.receipt_type === 'bayar_jasa') {
      const ex = (effective as { expense?: { date?: string; description?: string; amount?: number; notes?: string } })?.expense
      setExpenseDate(ex?.date || '')
      setExpenseDescription(ex?.description || '')
      setExpenseAmount(String(ex?.amount || 0))
      setExpenseNotes(ex?.notes || '')
    } else {
      // bon_penjualan / bon_pengeluaran
      const r = effective?.receipt
      setReceiptNumber(r?.receipt_no || '')
      setReceiptDate(r?.date || '')
      setVendorOrCustomer(r?.vendor_name || '')
      setNotes(r?.notes || '')
      if (d.receipt_type === 'bon_pengeluaran') {
        const sub = (effective?.receipt as { subcategory?: string })?.subcategory
        setExpenseSubcategory((sub === 'beli_item' ? 'beli_item' : 'bayar_jasa') as 'bayar_jasa' | 'beli_item')
      }
      setReceiptItems(
        (r?.items || []).map((item) => ({
          fish_code: item.fish_code || '',
          item_name: item.item_name || '',
          quantity: String(item.quantity),
          unit: item.unit || 'kg',
          unit_price: String(item.unit_price || 0),
          total: String(item.total_price || 0),
        }))
      )
    }
  }

  const lowConf = (_field: string) => false // confidence not tracked in current bot output

  const stockIssues = receiptItems
    .filter(item => item.fish_code && stockMap[item.fish_code] !== undefined)
    .map(item => {
      const info = stockMap[item.fish_code]
      if (!info.exists) return { code: item.fish_code, reason: 'Kode ikan tidak ditemukan di sistem' }
      if (!info.is_sorted) return { code: item.fish_code, reason: 'Bukan ikan sortir — hanya ikan sortir yang dapat dijual' }
      if (info.available_kg < (parseFloat(item.quantity) || 0))
        return { code: item.fish_code, reason: `Stok ${info.available_kg.toLocaleString('id-ID')} kg, dibutuhkan ${(parseFloat(item.quantity)||0).toLocaleString('id-ID')} kg` }
      return null
    })
    .filter(Boolean) as { code: string; reason: string }[]

  const hasStockIssue = data?.receipt_type === 'bon_penjualan' && stockIssues.length > 0

  const buildApprovePayload = () => {
    if (!data) return {}
    if (data.receipt_type === 'timbangan_sortir') {
      const resolvedVessel = sortirVesselId === VESSEL_NEW
        ? sortirNewVesselName
        : (vessels.find(v => v.id === sortirVesselId)?.name || sortirVesselName)
      return {
        sortir: {
          date: sortirDate,
          vessel_name: resolvedVessel,
          transports: sortirTransports,
          columns: sortirRows.map(r => ({
            source_fish_code: r.source_fish_code,
            category: r.category,
            grade: r.grade,
            sorted_fish_code: r.sorted_fish_code || deriveSortedCode(r.source_fish_code, r.category, r.grade),
            total_weight: parseFloat(r.total_weight) || 0,
          })),
          total_weight: sortirRows.reduce((s, r) => s + (parseFloat(r.total_weight) || 0), 0),
        },
      }
    } else if (data.receipt_type === 'timbangan_ikan_basah') {
      const resolvedVesselName = vesselId === VESSEL_NEW
        ? newVesselName
        : (vessels.find(v => v.id === vesselId)?.name || vesselName)
      return {
        timbangan: {
          date: timbanganDate,
          vessel_name: resolvedVesselName,
          transports: transportNumber,
          fish_columns: timbanganRows.map((r) => ({
            fish_type_code: r.fish_type_code,
            fish_type_name: r.fish_type_name,
            price_per_kg: parseFloat(r.price_per_kg) || 0,
            quantity_kg: parseFloat(r.quantity_kg) || 0,
          })),
          total_kg: timbanganRows.reduce((s, r) => s + (parseFloat(r.quantity_kg) || 0), 0),
        },
      }
    } else if (data.receipt_type === 'beli_ikan') {
      return {
        beli_ikan: {
          vessel_name: beliIkanVessel,
          date: beliIkanDate,
          notes: beliIkanNotes,
          timbangan_ids: [],
          items: beliIkanItems.map(it => ({
            fish_code: it.fish_code,
            quantity_kg: parseFloat(it.quantity_kg) || 0,
            price_per_kg: parseFloat(it.price_per_kg) || 0,
          })),
        },
      }
    } else if (data.receipt_type === 'beli_item' || data.receipt_type === 'bayar_jasa') {
      return {
        expense: {
          date: expenseDate,
          description: expenseDescription,
          amount: parseFloat(expenseAmount) || 0,
          notes: expenseNotes,
        },
      }
    } else if (data.receipt_type === 'invoice') {
      const items = invoiceItems.map((i) => ({
        description: i.description,
        quantity: parseFloat(i.quantity) || 0,
        unit_price: parseFloat(i.unit_price) || 0,
        total: parseFloat(i.total) || 0,
      }))
      const subtotal = items.reduce((s, i) => s + i.total, 0)
      return {
        invoice: {
          invoice_number: invoiceNumber,
          date: invoiceDate,
          due_date: dueDate,
          customer: invoiceCustomer,
          items,
          subtotal,
          tax: parseFloat(taxAmount) || 0,
          total: subtotal + (parseFloat(taxAmount) || 0),
        },
      }
    } else {
      const items = receiptItems.map((i) => {
        const qty = parseFloat(i.quantity) || 0
        const price = parseFloat(i.unit_price) || 0
        return {
          fish_code: i.fish_code,
          item_name: i.item_name,
          quantity: qty,
          unit: i.unit,
          unit_price: price,
          total_price: qty * price,
        }
      })
      const total = items.reduce((s, i) => s + i.total_price, 0)
      return {
        receipt: {
          receipt_no: receiptNumber,
          date: receiptDate,
          vendor_name: vendorOrCustomer,
          items,
          total_amount: total,
          notes,
          ...(data.receipt_type === 'bon_pengeluaran' ? { subcategory: expenseSubcategory } : {}),
        },
      }
    }
  }

  const authHeaders = (): Record<string, string> => {
    const t = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null
    return t ? { Authorization: `Bearer ${t}` } : {}
  }

  const handleLogin = async () => {
    setLoginError('')
    setLoginLoading(true)
    try {
      const res = await fetch(`${AUTH_URL}/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: loginPhone, password: loginPassword }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Login gagal')
      localStorage.setItem('auth_token', json.access_token)
      if (json.refresh_token) localStorage.setItem('refresh_token', json.refresh_token)
      if (json.user) localStorage.setItem('auth_user', JSON.stringify(json.user))
      document.cookie = `auth_token=${json.access_token}; path=/; max-age=86400`
      setLoginOpen(false)
      setLoginPhone('')
      setLoginPassword('')
      // Resume the action that triggered login
      if (pendingAction === 'approve') handleApprove()
      if (pendingAction === 'reject') setRejectOpen(true)
      setPendingAction(null)
    } catch (e: unknown) {
      setLoginError(e instanceof Error ? e.message : 'Login gagal')
    } finally {
      setLoginLoading(false)
    }
  }

  const requireLogin = (action: 'approve' | 'reject') => {
    if (isLoggedIn()) return true
    setPendingAction(action)
    setLoginOpen(true)
    return false
  }

  const handleApprove = async () => {
    if (!requireLogin('approve')) return
    if (!data) return
    setSubmitting(true)
    try {
      const payload = { confirmed_data: buildApprovePayload() }
      const res = await fetch(`${BASE_URL}/v1/reviews/${token}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Gagal menyetujui' }))
        throw new Error(err.error)
      }
      setIsRevising(false)
      setDone('approved')
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Terjadi kesalahan')
    } finally {
      setSubmitting(false)
    }
  }

  const handleStartRevise = async () => {
    if (!requireLogin('approve')) return
    if (!data) return
    if (!confirm('Revisi akan membatalkan efek stok dari bon ini dan membukanya kembali untuk diedit. Lanjutkan?')) return
    setSubmitting(true)
    try {
      const res = await fetch(`${BASE_URL}/v1/reviews/${token}/revise`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Gagal merevisi' }))
        throw new Error(err.error)
      }
      // confirmed_data is kept on the server — just flip status locally
      setData(prev => prev ? { ...prev, status: 'pending' } : prev)
      setIsRevising(true)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Terjadi kesalahan')
    } finally {
      setSubmitting(false)
    }
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !data) return
    e.target.value = ''
    setUploadingPhoto(true)
    try {
      const form = new FormData()
      form.append('photo', file)
      const res = await fetch(`${BASE_URL}/v1/reviews/${token}/photo`, {
        method: 'POST',
        body: form,
      })
      if (!res.ok) throw new Error('Upload gagal')
      const result = await res.json() as { image_url: string }
      setData((prev) => prev ? { ...prev, image_url: result.image_url } : prev)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Upload gagal')
    } finally {
      setUploadingPhoto(false)
    }
  }

  const handleReject = async () => {
    if (!requireLogin('reject')) return
    if (!data || !rejectReason.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch(`${BASE_URL}/v1/reviews/${token}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ reason: rejectReason }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Gagal menolak' }))
        throw new Error(err.error)
      }
      setDone('rejected')
      setRejectOpen(false)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Terjadi kesalahan')
    } finally {
      setSubmitting(false)
    }
  }

  const updateReceiptItem = (idx: number, field: keyof EditableReceiptItem, value: string) => {
    setReceiptItems((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }
      // Auto-calc total
      if (field === 'quantity' || field === 'unit_price') {
        const qty = parseFloat(field === 'quantity' ? value : next[idx].quantity) || 0
        const price = parseFloat(field === 'unit_price' ? value : next[idx].unit_price) || 0
        next[idx].total = String(qty * price)
      }
      return next
    })
  }

  const updateTimbanganRow = (idx: number, field: keyof EditableTimbanganRow, value: string) => {
    setTimbanganRows((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }
      return next
    })
  }

  const updateInvoiceItem = (idx: number, field: string, value: string) => {
    setInvoiceItems((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }
      if (field === 'quantity' || field === 'unit_price') {
        const qty = parseFloat(field === 'quantity' ? value : next[idx].quantity) || 0
        const price = parseFloat(field === 'unit_price' ? value : next[idx].unit_price) || 0
        next[idx].total = String(qty * price)
      }
      return next
    })
  }

  // === Render states ===
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="mx-auto max-w-5xl space-y-4">
          <Skeleton className="h-10 w-48" />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Skeleton className="h-96" />
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md text-center">
          <div className="mb-4 flex justify-center">
            <div className="rounded-full bg-red-100 p-4">
              <XCircle className="h-8 w-8 text-red-600" />
            </div>
          </div>
          <h1 className="text-xl font-bold text-gray-900">Receipt Tidak Ditemukan</h1>
          <p className="mt-2 text-gray-600">{error}</p>
          <p className="mt-4 text-sm text-gray-500">
            Token tidak valid atau receipt tidak ditemukan.
          </p>
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md text-center">
          <div className="mb-4 flex justify-center">
            <div className={`rounded-full p-4 ${done === 'approved' ? 'bg-green-100' : 'bg-red-100'}`}>
              {done === 'approved' ? (
                <CheckCircle className="h-8 w-8 text-green-600" />
              ) : (
                <XCircle className="h-8 w-8 text-red-600" />
              )}
            </div>
          </div>
          <h1 className="text-xl font-bold text-gray-900">
            {done === 'approved' ? 'Bon telah disetujui' : 'Bon telah ditolak'}
          </h1>
          <p className="mt-2 text-gray-600">
            {done === 'approved'
              ? 'Data telah disimpan ke sistem. Terima kasih!'
              : 'Bon telah ditolak. Pengirim akan mendapat notifikasi.'}
          </p>
          <Button className="mt-6" onClick={() => router.push('/')}>
            Kembali ke Beranda
          </Button>
        </div>
      </div>
    )
  }

  if (!data) return null

  const isAlreadyProcessed = data.status === 'approved' || data.status === 'rejected'

  const receiptTypeLabels: Record<string, string> = {
    bon_penjualan: 'Bon Penjualan',
    bon_pengeluaran: 'Bon Pengeluaran',
    timbangan_ikan_basah: 'Timbangan Ikan',
    timbangan_sortir: 'Timbangan Sortir',
    invoice: 'Invoice',
    beli_ikan: 'Beli Ikan (HPP)',
    beli_item: 'Beli Item',
    bayar_jasa: 'Bayar Jasa',
  }

  const hasLowConfidence = (data.extracted_data?.confidence ?? 1) < 0.7

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b bg-white shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-primary">
              <Building2 className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold">Review Bon</p>
              <p className="text-xs text-gray-500">
                {receiptTypeLabels[data.receipt_type]} · via {data.submitted_via || 'telegram'}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {isAlreadyProcessed && !isRevising ? (
              <>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${
                  data.status === 'approved'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                }`}>
                  {data.status === 'approved'
                    ? <><CheckCircle className="h-4 w-4" /> Sudah Disetujui</>
                    : <><XCircle className="h-4 w-4" /> Sudah Ditolak</>}
                </span>
                {data.status === 'approved' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleStartRevise}
                    disabled={submitting}
                    className="gap-1 border-orange-200 text-orange-700 hover:bg-orange-50"
                  >
                    <AlertTriangle className="h-4 w-4" />
                    Revisi
                  </Button>
                )}
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { if (requireLogin('reject')) setRejectOpen(true) }}
                  className="gap-1 border-red-200 text-red-700 hover:bg-red-50"
                  disabled={submitting}
                >
                  <XCircle className="h-4 w-4" />
                  Tolak
                </Button>
                <Button
                  size="sm"
                  onClick={handleApprove}
                  className="gap-1 bg-green-600 hover:bg-green-700"
                  disabled={submitting || hasStockIssue}
                >
                  <CheckCircle className="h-4 w-4" />
                  Setujui
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl space-y-4 p-4">
        {isRevising && (
          <div className="flex items-center gap-3 rounded-lg border border-orange-200 bg-orange-50 p-3">
            <AlertTriangle className="h-4 w-4 shrink-0 text-orange-600" />
            <p className="text-sm text-orange-800 font-medium">
              Mode Revisi — efek stok dari bon ini sudah dibatalkan. Edit data dan klik Setujui untuk menerapkan kembali.
            </p>
          </div>
        )}
        {isAlreadyProcessed && !isRevising && (
          <div className={`flex items-center gap-3 rounded-lg border p-3 ${
            data.status === 'approved'
              ? 'border-green-200 bg-green-50 text-green-800'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}>
            {data.status === 'approved'
              ? <CheckCircle className="h-4 w-4 shrink-0" />
              : <XCircle className="h-4 w-4 shrink-0" />}
            <p className="text-sm font-medium">
              {data.status === 'approved'
                ? 'Receipt ini sudah disetujui dan datanya telah disimpan ke sistem. Ditampilkan sebagai arsip.'
                : 'Receipt ini sudah ditolak. Ditampilkan sebagai arsip.'}
            </p>
          </div>
        )}
        {hasLowConfidence && !isAlreadyProcessed && (
          <div className="flex items-center gap-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3">
            <AlertTriangle className="h-4 w-4 shrink-0 text-yellow-600" />
            <p className="text-sm text-yellow-800">
              Beberapa data terdeteksi dengan keyakinan rendah. Harap periksa field yang disorot kuning.
            </p>
          </div>
        )}
        {hasStockIssue && !isAlreadyProcessed && (
          <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3">
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
            <div className="text-sm text-red-800">
              <p className="font-semibold mb-1">Tidak dapat disetujui:</p>
              {stockIssues.map((issue, i) => (
                <p key={i}><span className="font-medium">{issue.code}</span>: {issue.reason}</p>
              ))}
            </div>
          </div>
        )}
        {stockLoading && data?.receipt_type === 'bon_penjualan' && (
          <div className="text-xs text-gray-500 px-1">Memeriksa stok...</div>
        )}

        {/* Two-column layout */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Left: Image */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">Gambar Bon</p>
            <div
              className="relative cursor-zoom-in overflow-hidden rounded-lg border bg-white shadow-sm"
              onClick={() => setImgZoom(true)}
            >
              {data.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={data.image_url}
                  alt="Bon"
                  className="w-full object-contain"
                  style={{ maxHeight: '600px' }}
                />
              ) : (
                <div className="flex h-64 items-center justify-center text-gray-400">
                  <p>Tidak ada gambar</p>
                </div>
              )}
              <div className="absolute bottom-2 right-2 rounded bg-black/50 p-1">
                <ZoomIn className="h-4 w-4 text-white" />
              </div>
            </div>
            {(isRevising || data.status === 'pending') && (
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 py-2 text-sm text-gray-600 hover:bg-gray-100">
                {uploadingPhoto
                  ? <span>Mengunggah...</span>
                  : <><Upload className="h-4 w-4" /><span>Ganti Foto Bon</span></>
                }
                <input type="file" accept="image/*" className="hidden" disabled={uploadingPhoto} onChange={handlePhotoUpload} />
              </label>
            )}
          </div>

          {/* Right: Form */}
          <div className="space-y-4">
            {/* BON PENJUALAN / BON PENGELUARAN */}
            {(data.receipt_type === 'bon_penjualan' || data.receipt_type === 'bon_pengeluaran') && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">No. Bon</Label>
                    <Input
                      value={receiptNumber}
                      onChange={(e) => setReceiptNumber(e.target.value)}
                      className={cn('h-9', lowConf('receipt_number') && 'border-yellow-400 bg-yellow-50')}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Tanggal</Label>
                    <Input
                      type="date"
                      value={receiptDate}
                      onChange={(e) => setReceiptDate(e.target.value)}
                      className={cn('h-9', lowConf('date') && 'border-yellow-400 bg-yellow-50')}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">
                    {data.receipt_type === 'bon_penjualan' ? 'Kepada' : 'Vendor/Pemasok'}
                  </Label>
                  <Input
                    value={vendorOrCustomer}
                    onChange={(e) => setVendorOrCustomer(e.target.value)}
                    className={cn(
                      'h-9',
                      (lowConf('vendor') || lowConf('customer')) && 'border-yellow-400 bg-yellow-50'
                    )}
                  />
                </div>

                {/* Subcategory selector for bon_pengeluaran */}
                {data.receipt_type === 'bon_pengeluaran' && (
                  <div className="space-y-1">
                    <Label className="text-xs">Kategori Pengeluaran</Label>
                    <div className="flex gap-2">
                      {([['bayar_jasa', 'Bayar Jasa'], ['beli_item', 'Beli Item']] as const).map(([val, label]) => (
                        <button
                          key={val}
                          type="button"
                          disabled={isAlreadyProcessed}
                          onClick={() => setExpenseSubcategory(val)}
                          className={cn('px-4 py-1.5 rounded-lg text-xs font-medium transition-colors', expenseSubcategory === val ? 'text-white' : '')}
                          style={expenseSubcategory === val
                            ? { background: 'hsl(var(--sidebar-active))' }
                            : { color: 'hsl(var(--muted-foreground))', border: '1px solid hsl(var(--border))' }
                          }
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Items table */}
                <div className="space-y-2">
                  <Label className="text-xs">Item</Label>
                  <div className="rounded-md border overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="p-2 text-left font-medium">
                            {data.receipt_type === 'bon_penjualan' ? 'Kode Ikan' : 'Nama Item'}
                          </th>
                          <th className="p-2 text-right font-medium">Qty</th>
                          <th className="p-2 text-left font-medium">Satuan</th>
                          <th className="p-2 text-right font-medium">Harga/Satuan</th>
                          <th className="p-2 text-right font-medium">Subtotal</th>
                          <th className="p-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {receiptItems.map((item, idx) => (
                          <tr key={idx} className="border-t">
                            <td className="p-1">
                              {data.receipt_type === 'bon_penjualan' ? (
                                <select
                                  value={sortedFishTypes.some(f => f.code === item.fish_code) ? item.fish_code : FISH_NEW}
                                  onChange={e => {
                                    if (e.target.value !== FISH_NEW) {
                                      updateReceiptItem(idx, 'fish_code', e.target.value)
                                    }
                                  }}
                                  className="h-7 w-full text-xs rounded border border-input bg-background px-1"
                                >
                                  {sortedFishTypes.map(f => (
                                    <option key={f.code} value={f.code}>{f.code}</option>
                                  ))}
                                  {!sortedFishTypes.some(f => f.code === item.fish_code) && (
                                    <option value={FISH_NEW}>{item.fish_code || '— pilih —'}</option>
                                  )}
                                </select>
                              ) : (
                                <Input
                                  value={item.item_name}
                                  onChange={e => updateReceiptItem(idx, 'item_name', e.target.value)}
                                  className="h-7 text-xs"
                                />
                              )}
                            </td>
                            <td className="p-1">
                              <Input
                                type="number"
                                value={item.quantity}
                                onChange={(e) => updateReceiptItem(idx, 'quantity', e.target.value)}
                                className="h-7 w-16 text-xs text-right"
                              />
                            </td>
                            <td className="p-1">
                              <Input
                                value={item.unit}
                                onChange={(e) => updateReceiptItem(idx, 'unit', e.target.value)}
                                className="h-7 w-14 text-xs"
                              />
                            </td>
                            <td className="p-1">
                              <Input
                                type="number"
                                value={item.unit_price}
                                onChange={(e) => updateReceiptItem(idx, 'unit_price', e.target.value)}
                                className="h-7 w-24 text-xs text-right"
                              />
                            </td>
                            <td className="p-2 text-right font-mono text-xs">
                              {formatIDR((parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0))}
                            </td>
                            <td className="p-1">
                              <button
                                type="button"
                                onClick={() => setReceiptItems((prev) => prev.filter((_, i) => i !== idx))}
                                className="text-red-400 hover:text-red-600"
                              >
                                ×
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="border-t bg-gray-50">
                        <tr>
                          <td colSpan={4} className="p-2 text-right font-medium">Total:</td>
                          <td className="p-2 text-right font-mono font-semibold">
                            {formatIDR(receiptItems.reduce((s, i) => s + (parseFloat(i.quantity) || 0) * (parseFloat(i.unit_price) || 0), 0))}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full text-xs"
                    onClick={() =>
                      setReceiptItems((prev) => [
                        ...prev,
                        { fish_code: '', item_name: '', quantity: '0', unit: 'kg', unit_price: '0', total: '0' },
                      ])
                    }
                  >
                    + Tambah Item
                  </Button>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Catatan</Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="text-sm"
                  />
                </div>
              </>
            )}

            {/* TIMBANGAN SORTIR */}
            {data.receipt_type === 'timbangan_sortir' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Tanggal Sortir</Label>
                    <Input
                      type="date"
                      value={sortirDate}
                      onChange={e => setSortirDate(e.target.value)}
                      className="h-9"
                      disabled={isAlreadyProcessed}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">No. Transportasi</Label>
                    <Input
                      value={sortirTransports}
                      onChange={e => setSortirTransports(e.target.value)}
                      className="h-9"
                      disabled={isAlreadyProcessed}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Kapal</Label>
                  <Select
                    value={sortirVesselId}
                    onValueChange={v => { setSortirVesselId(v); if (v !== VESSEL_NEW) setSortirNewVesselName('') }}
                    disabled={isAlreadyProcessed}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Pilih kapal..." />
                    </SelectTrigger>
                    <SelectContent>
                      {vessels.map(v => (
                        <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                      ))}
                      <SelectItem value={VESSEL_NEW}>
                        <span className="flex items-center gap-1.5 text-cyan-600">
                          <Plus className="h-3.5 w-3.5" /> Kapal baru...
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {sortirVesselId === VESSEL_NEW && (
                    <Input
                      value={sortirNewVesselName}
                      onChange={e => setSortirNewVesselName(e.target.value)}
                      placeholder="Nama kapal baru"
                      className="h-9 mt-1 text-sm"
                      autoFocus
                      disabled={isAlreadyProcessed}
                    />
                  )}
                </div>

                {/* Sortir columns table */}
                <div className="space-y-2">
                  <Label className="text-xs">Hasil Sortir</Label>
                  <div className="rounded-md border overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="p-2 text-left font-medium">Kode Sumber</th>
                          <th className="p-2 text-left font-medium">Kat.</th>
                          <th className="p-2 text-left font-medium">Grade</th>
                          <th className="p-2 text-left font-medium">Kode Sortir</th>
                          <th className="p-2 text-right font-medium">Total (kg)</th>
                          <th className="p-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortirRows.map((row, idx) => (
                          <tr key={idx} className="border-t">
                            <td className="p-1">
                              <Input
                                value={row.source_fish_code}
                                onChange={e => setSortirRows(prev => {
                                  const next = [...prev]
                                  const updated = { ...next[idx], source_fish_code: e.target.value }
                                  updated.sorted_fish_code = deriveSortedCode(e.target.value, updated.category, updated.grade)
                                  next[idx] = updated; return next
                                })}
                                className="h-7 w-20 text-xs"
                                disabled={isAlreadyProcessed}
                              />
                            </td>
                            <td className="p-1">
                              <select
                                value={row.category}
                                onChange={e => setSortirRows(prev => {
                                  const next = [...prev]
                                  const updated = { ...next[idx], category: e.target.value }
                                  updated.sorted_fish_code = deriveSortedCode(updated.source_fish_code, e.target.value, updated.grade)
                                  next[idx] = updated; return next
                                })}
                                className="h-7 w-14 text-xs rounded border border-input bg-background px-1"
                                disabled={isAlreadyProcessed}
                              >
                                <option value="SF">SF</option>
                                <option value="PC">PC</option>
                                <option value="SP">SP</option>
                                <option value="R">R</option>
                              </select>
                            </td>
                            <td className="p-1">
                              <Input
                                value={row.grade}
                                onChange={e => setSortirRows(prev => {
                                  const next = [...prev]
                                  const updated = { ...next[idx], grade: e.target.value }
                                  updated.sorted_fish_code = deriveSortedCode(updated.source_fish_code, updated.category, e.target.value)
                                  next[idx] = updated; return next
                                })}
                                className="h-7 w-20 text-xs"
                                placeholder="300-500"
                                disabled={isAlreadyProcessed}
                              />
                            </td>
                            <td className="p-1">
                              <select
                                value={row.sorted_fish_code}
                                onChange={e => setSortirRows(prev => {
                                  const next = [...prev]
                                  next[idx] = { ...next[idx], sorted_fish_code: e.target.value }
                                  return next
                                })}
                                className={`h-7 w-36 text-xs rounded border px-1 font-mono ${
                                  row.sorted_fish_code && !sortedFishTypes.some(f => f.code === row.sorted_fish_code)
                                    ? 'border-green-400 bg-green-50 text-green-700 font-semibold'
                                    : 'border-input bg-background'
                                }`}
                                disabled={isAlreadyProcessed}
                              >
                                {!row.sorted_fish_code && (
                                  <option value="">— pilih atau buat —</option>
                                )}
                                {sortedFishTypes.map(f => (
                                  <option key={f.code} value={f.code}>{f.code}</option>
                                ))}
                                {row.sorted_fish_code && !sortedFishTypes.some(f => f.code === row.sorted_fish_code) && (
                                  <option value={row.sorted_fish_code}>+ Buat baru: {row.sorted_fish_code}</option>
                                )}
                              </select>
                            </td>
                            <td className="p-1">
                              <Input
                                type="number"
                                step="0.1"
                                value={row.total_weight}
                                onChange={e => setSortirRows(prev => {
                                  const next = [...prev]; next[idx] = { ...next[idx], total_weight: e.target.value }; return next
                                })}
                                className="h-7 w-20 text-xs text-right"
                                disabled={isAlreadyProcessed}
                              />
                            </td>
                            <td className="p-1">
                              {!isAlreadyProcessed && (
                                <button
                                  type="button"
                                  onClick={() => setSortirRows(prev => prev.filter((_, i) => i !== idx))}
                                  className="text-red-400 hover:text-red-600"
                                >×</button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="border-t bg-gray-50">
                        <tr>
                          <td colSpan={4} className="p-2 text-right font-medium">Grand Total:</td>
                          <td className="p-2 text-right font-mono font-semibold">
                            {sortirRows.reduce((s, r) => s + (parseFloat(r.total_weight) || 0), 0).toLocaleString('id-ID')} kg
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  {!isAlreadyProcessed && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full text-xs"
                      onClick={() => setSortirRows(prev => [
                        ...prev,
                        { source_fish_code: '', category: 'SF', grade: '', sorted_fish_code: '', total_weight: '0' },
                      ])}
                    >
                      + Tambah Baris
                    </Button>
                  )}
                </div>

                <div className="rounded-md border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
                  Setelah disetujui: jenis ikan sortir baru akan dibuat otomatis jika belum ada, stok RAW akan dikurangi, dan stok sortir akan ditambahkan.
                </div>
              </>
            )}

            {/* TIMBANGAN */}
            {data.receipt_type === 'timbangan_ikan_basah' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Tanggal Timbang</Label>
                    <Input
                      type="date"
                      value={timbanganDate}
                      onChange={(e) => setTimbanganDate(e.target.value)}
                      className={cn('h-9', lowConf('date') && 'border-yellow-400 bg-yellow-50')}
                      disabled={isAlreadyProcessed}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">No. Transportasi</Label>
                    <Input
                      value={transportNumber}
                      onChange={(e) => setTransportNumber(e.target.value)}
                      placeholder="COLT DIESEL, PICK UP..."
                      className="h-9"
                      disabled={isAlreadyProcessed}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Kapal</Label>
                  <Select
                    value={vesselId}
                    onValueChange={v => {
                      setVesselId(v)
                      if (v !== VESSEL_NEW) setNewVesselName('')
                    }}
                    disabled={isAlreadyProcessed}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Pilih kapal..." />
                    </SelectTrigger>
                    <SelectContent>
                      {vessels.map(v => (
                        <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                      ))}
                      <SelectItem value={VESSEL_NEW}>
                        <span className="flex items-center gap-1.5 text-cyan-600">
                          <Plus className="h-3.5 w-3.5" /> Kapal baru...
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {vesselId === VESSEL_NEW && (
                    <Input
                      value={newVesselName}
                      onChange={(e) => setNewVesselName(e.target.value)}
                      placeholder="Nama kapal baru"
                      className="h-9 mt-1 text-sm"
                      autoFocus
                      disabled={isAlreadyProcessed}
                    />
                  )}
                </div>

                {/* Fish columns table */}
                <div className="space-y-2">
                  <Label className="text-xs">Data Ikan</Label>
                  <div className="rounded-md border overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="p-2 text-left font-medium">Kode Ikan</th>
                          <th className="p-2 text-right font-medium">Harga/kg</th>
                          <th className="p-2 text-right font-medium">Berat (kg)</th>
                          <th className="p-2 text-right font-medium">Subtotal</th>
                          <th className="p-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {timbanganRows.map((row, idx) => (
                          <tr key={idx} className="border-t">
                            <td className="p-1">
                              <Input
                                value={row.fish_type_code}
                                onChange={(e) => updateTimbanganRow(idx, 'fish_type_code', e.target.value)}
                                className="h-7 w-24 text-xs"
                              />
                            </td>
                            <td className="p-1">
                              <Input
                                type="number"
                                value={row.price_per_kg}
                                onChange={(e) => updateTimbanganRow(idx, 'price_per_kg', e.target.value)}
                                className="h-7 w-28 text-xs text-right"
                              />
                            </td>
                            <td className="p-1">
                              <Input
                                type="number"
                                step="0.01"
                                value={row.quantity_kg}
                                onChange={(e) => updateTimbanganRow(idx, 'quantity_kg', e.target.value)}
                                className="h-7 w-24 text-xs text-right"
                              />
                            </td>
                            <td className="p-2 text-right font-mono text-xs">
                              {formatIDR((parseFloat(row.price_per_kg) || 0) * (parseFloat(row.quantity_kg) || 0))}
                            </td>
                            <td className="p-1">
                              <button
                                type="button"
                                onClick={() => setTimbanganRows((prev) => prev.filter((_, i) => i !== idx))}
                                className="text-red-400 hover:text-red-600"
                              >
                                ×
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="border-t bg-gray-50">
                        <tr>
                          <td colSpan={2} className="p-2 text-right font-medium">Total KG:</td>
                          <td className="p-2 text-right font-mono font-semibold">
                            {timbanganRows.reduce((s, r) => s + (parseFloat(r.quantity_kg) || 0), 0).toLocaleString('id-ID')} kg
                          </td>
                          <td className="p-2 text-right font-mono font-semibold">
                            {formatIDR(timbanganRows.reduce((s, r) => s + (parseFloat(r.price_per_kg) || 0) * (parseFloat(r.quantity_kg) || 0), 0))}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full text-xs"
                    onClick={() =>
                      setTimbanganRows((prev) => [
                        ...prev,
                        { fish_type_code: '', fish_type_name: '', price_per_kg: '0', quantity_kg: '0' },
                      ])
                    }
                  >
                    + Tambah Baris
                  </Button>
                </div>

                {/* Weight batches detail (read-only, from bot) */}
                {data.extracted_data?.timbangan?.fish_columns?.some(fc => fc.weight_batches && fc.weight_batches.length > 1) && (
                  <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
                    <p className="mb-1 font-medium text-gray-700">Detail Batch (dari bot):</p>
                    {data.extracted_data.timbangan.fish_columns.map((fc, i) => fc.weight_batches && fc.weight_batches.length > 1 && (
                      <p key={i}><span className="font-medium">{fc.fish_code}:</span> {fc.weight_batches.join(' + ')} = {fc.total_weight} kg</p>
                    ))}
                  </div>
                )}

                {data.extracted_data?.timbangan?.notes && (
                  <div className="rounded-md border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
                    <span className="font-medium">Catatan bot: </span>{data.extracted_data.timbangan.notes}
                  </div>
                )}
              </>
            )}

            {/* INVOICE */}
            {data.receipt_type === 'invoice' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">No. Invoice</Label>
                    <Input
                      value={invoiceNumber}
                      onChange={(e) => setInvoiceNumber(e.target.value)}
                      className={cn('h-9', lowConf('invoice_number') && 'border-yellow-400 bg-yellow-50')}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Tanggal</Label>
                    <Input
                      type="date"
                      value={invoiceDate}
                      onChange={(e) => setInvoiceDate(e.target.value)}
                      className={cn('h-9', lowConf('date') && 'border-yellow-400 bg-yellow-50')}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Jatuh Tempo</Label>
                    <Input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className={cn('h-9', lowConf('due_date') && 'border-yellow-400 bg-yellow-50')}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Pelanggan</Label>
                    <Input
                      value={invoiceCustomer}
                      onChange={(e) => setInvoiceCustomer(e.target.value)}
                      className={cn('h-9', lowConf('customer') && 'border-yellow-400 bg-yellow-50')}
                    />
                  </div>
                </div>

                {/* Invoice items */}
                <div className="space-y-2">
                  <Label className="text-xs">Item Invoice</Label>
                  <div className="rounded-md border overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="p-2 text-left font-medium">Deskripsi</th>
                          <th className="p-2 text-right font-medium">Qty</th>
                          <th className="p-2 text-right font-medium">Harga</th>
                          <th className="p-2 text-right font-medium">Total</th>
                          <th className="p-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoiceItems.map((item, idx) => (
                          <tr key={idx} className="border-t">
                            <td className="p-1">
                              <Input
                                value={item.description}
                                onChange={(e) => updateInvoiceItem(idx, 'description', e.target.value)}
                                className="h-7 text-xs"
                              />
                            </td>
                            <td className="p-1">
                              <Input
                                type="number"
                                value={item.quantity}
                                onChange={(e) => updateInvoiceItem(idx, 'quantity', e.target.value)}
                                className="h-7 w-16 text-xs text-right"
                              />
                            </td>
                            <td className="p-1">
                              <Input
                                type="number"
                                value={item.unit_price}
                                onChange={(e) => updateInvoiceItem(idx, 'unit_price', e.target.value)}
                                className="h-7 w-24 text-xs text-right"
                              />
                            </td>
                            <td className="p-1">
                              <Input
                                type="number"
                                value={item.total}
                                onChange={(e) => updateInvoiceItem(idx, 'total', e.target.value)}
                                className="h-7 w-24 text-xs text-right"
                              />
                            </td>
                            <td className="p-1">
                              <button
                                type="button"
                                onClick={() => setInvoiceItems((prev) => prev.filter((_, i) => i !== idx))}
                                className="text-red-400 hover:text-red-600"
                              >
                                ×
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="border-t bg-gray-50">
                        <tr>
                          <td colSpan={3} className="p-2 text-right">Subtotal:</td>
                          <td className="p-2 text-right font-mono">
                            {formatIDR(invoiceItems.reduce((s, i) => s + (parseFloat(i.total) || 0), 0))}
                          </td>
                          <td></td>
                        </tr>
                        <tr>
                          <td colSpan={3} className="p-2 text-right">Pajak:</td>
                          <td className="p-2">
                            <Input
                              type="number"
                              value={taxAmount}
                              onChange={(e) => setTaxAmount(e.target.value)}
                              className="h-7 w-24 text-xs text-right ml-auto"
                            />
                          </td>
                          <td></td>
                        </tr>
                        <tr>
                          <td colSpan={3} className="p-2 text-right font-semibold">Total:</td>
                          <td className="p-2 text-right font-mono font-semibold">
                            {formatIDR(
                              invoiceItems.reduce((s, i) => s + (parseFloat(i.total) || 0), 0) +
                              (parseFloat(taxAmount) || 0)
                            )}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full text-xs"
                    onClick={() =>
                      setInvoiceItems((prev) => [
                        ...prev,
                        { description: '', quantity: '0', unit_price: '0', total: '0' },
                      ])
                    }
                  >
                    + Tambah Item
                  </Button>
                </div>
              </>
            )}

            {/* BELI IKAN */}
            {data.receipt_type === 'beli_ikan' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Nama Kapal</Label>
                    <Input value={beliIkanVessel} onChange={e => setBeliIkanVessel(e.target.value)} className="h-9" disabled={isAlreadyProcessed} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Tanggal Beli</Label>
                    <Input type="date" value={beliIkanDate} onChange={e => setBeliIkanDate(e.target.value)} className="h-9" disabled={isAlreadyProcessed} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Catatan</Label>
                  <Input value={beliIkanNotes} onChange={e => setBeliIkanNotes(e.target.value)} className="h-9" disabled={isAlreadyProcessed} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Daftar Ikan</Label>
                  <div className="rounded-md border overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="p-2 text-left font-medium">Kode Ikan</th>
                          <th className="p-2 text-right font-medium">Qty (kg)</th>
                          <th className="p-2 text-right font-medium">Harga/kg</th>
                          <th className="p-2 text-right font-medium">Subtotal</th>
                          <th className="p-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {beliIkanItems.map((it, idx) => (
                          <tr key={idx} className="border-t">
                            <td className="p-1"><Input value={it.fish_code} onChange={e => setBeliIkanItems(prev => { const n=[...prev]; n[idx]={...n[idx],fish_code:e.target.value}; return n })} className="h-7 w-20 text-xs" disabled={isAlreadyProcessed} /></td>
                            <td className="p-1"><Input type="number" value={it.quantity_kg} onChange={e => setBeliIkanItems(prev => { const n=[...prev]; n[idx]={...n[idx],quantity_kg:e.target.value}; return n })} className="h-7 w-20 text-xs text-right" disabled={isAlreadyProcessed} /></td>
                            <td className="p-1"><Input type="number" value={it.price_per_kg} onChange={e => setBeliIkanItems(prev => { const n=[...prev]; n[idx]={...n[idx],price_per_kg:e.target.value}; return n })} className="h-7 w-24 text-xs text-right" disabled={isAlreadyProcessed} /></td>
                            <td className="p-1 text-right font-mono text-xs pr-2">{formatIDR((parseFloat(it.quantity_kg)||0)*(parseFloat(it.price_per_kg)||0))}</td>
                            <td className="p-1">{!isAlreadyProcessed && <button type="button" onClick={() => setBeliIkanItems(prev => prev.filter((_,i)=>i!==idx))} className="text-red-400 hover:text-red-600">×</button>}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="border-t bg-gray-50">
                        <tr>
                          <td colSpan={3} className="p-2 text-right font-medium">Grand Total:</td>
                          <td className="p-2 text-right font-mono font-semibold">
                            {formatIDR(beliIkanItems.reduce((s,it)=>(parseFloat(it.quantity_kg)||0)*(parseFloat(it.price_per_kg)||0)+s,0))}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  {!isAlreadyProcessed && (
                    <Button type="button" variant="outline" size="sm" className="w-full text-xs"
                      onClick={() => setBeliIkanItems(prev => [...prev, { fish_code: '', quantity_kg: '0', price_per_kg: '0' }])}>
                      + Tambah Baris
                    </Button>
                  )}
                </div>
              </>
            )}

            {/* BELI ITEM / BAYAR JASA */}
            {(data.receipt_type === 'beli_item' || data.receipt_type === 'bayar_jasa') && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Tanggal</Label>
                    <Input type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)} className="h-9" disabled={isAlreadyProcessed} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Nominal (Rp)</Label>
                    <Input type="number" value={expenseAmount} onChange={e => setExpenseAmount(e.target.value)} className="h-9 text-right" disabled={isAlreadyProcessed} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Keterangan</Label>
                  <Input value={expenseDescription} onChange={e => setExpenseDescription(e.target.value)} className="h-9" disabled={isAlreadyProcessed} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Catatan</Label>
                  <Input value={expenseNotes} onChange={e => setExpenseNotes(e.target.value)} className="h-9" disabled={isAlreadyProcessed} />
                </div>
              </>
            )}

            {/* Action buttons (bottom) — hidden when already processed */}
            {!isAlreadyProcessed && (
              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={() => { if (requireLogin('reject')) setRejectOpen(true) }}
                  className="flex-1 gap-2 border-red-200 text-red-700 hover:bg-red-50"
                  disabled={submitting}
                >
                  <XCircle className="h-4 w-4" /> Tolak
                </Button>
                <Button
                  onClick={handleApprove}
                  className="flex-1 gap-2 bg-green-600 hover:bg-green-700"
                  disabled={submitting || hasStockIssue}
                >
                  <CheckCircle className="h-4 w-4" /> Setujui
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Image zoom modal */}
      {imgZoom && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setImgZoom(false)}
        >
          <div className="relative max-h-full max-w-full overflow-auto" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={data.image_url} alt="Bon (zoom)" className="max-w-full" />
            <button
              className="absolute right-2 top-2 rounded-full bg-white p-1 shadow"
              onClick={() => setImgZoom(false)}
            >
              <XCircle className="h-5 w-5 text-gray-700" />
            </button>
          </div>
        </div>
      )}

      {/* Login gate dialog */}
      <Dialog open={loginOpen} onOpenChange={v => { setLoginOpen(v); if (!v) setPendingAction(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Login untuk melanjutkan
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Masukkan kredensial Anda agar aksi ini tercatat atas nama Anda di log aktivitas.
          </p>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium">Nomor HP</label>
              <input
                type="tel"
                value={loginPhone}
                onChange={e => setLoginPhone(e.target.value)}
                placeholder="08xxxxxxxxxx"
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Password</label>
              <input
                type="password"
                value={loginPassword}
                onChange={e => setLoginPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
              />
            </div>
            {loginError && (
              <p className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{loginError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setLoginOpen(false); setPendingAction(null) }}>Batal</Button>
            <Button onClick={handleLogin} disabled={loginLoading || !loginPhone || !loginPassword}>
              {loginLoading ? 'Masuk...' : 'Masuk & Lanjutkan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tolak Bon</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-gray-600">Berikan alasan penolakan agar pengirim dapat memperbaiki bon.</p>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Contoh: Gambar tidak jelas, nominal tidak sesuai, tanggal salah..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Batal</Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={submitting || !rejectReason.trim()}
            >
              {submitting ? 'Menolak...' : 'Tolak Bon'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
