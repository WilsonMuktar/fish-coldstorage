'use client'

import { useEffect, useRef, useState } from 'react'
import { employeeAPI } from '@/lib/api'
import { Employee } from '@/types/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { StatusBadge } from '@/components/shared/status-badge'
import { formatDate } from '@/lib/formatters'
import { Plus, Loader2, Printer, Upload, User, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import Barcode from 'react-barcode'
import Image from 'next/image'

export default function KaryawanPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editEmployee, setEditEmployee] = useState<Employee | null>(null)
  const [qrEmployee, setQrEmployee] = useState<Employee | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const printRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pendingUploadId, setPendingUploadId] = useState<string | null>(null)
  const emptyForm = { name: '', phone: '', position: '', daily_salary: '', hire_date: new Date().toISOString().slice(0, 10), is_active: true }
  const [form, setForm] = useState(emptyForm)

  const load = async () => {
    try {
      const res = await employeeAPI.getAll() as { data: Employee[] }
      setEmployees(res.data || [])
    } catch {
      toast.error('Gagal memuat data karyawan')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const openEdit = (emp: Employee) => {
    setEditEmployee(emp)
    setForm({
      name: emp.name,
      phone: emp.phone || '',
      position: emp.position,
      daily_salary: String(emp.daily_salary || ''),
      hire_date: emp.hired_at ? emp.hired_at.slice(0, 10) : new Date().toISOString().slice(0, 10),
      is_active: emp.is_active,
    })
    setOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const payload = { ...form, daily_salary: parseFloat(form.daily_salary) || 0 }
      if (editEmployee) {
        await employeeAPI.update(editEmployee.id, payload)
        toast.success('Karyawan berhasil diupdate')
      } else {
        await employeeAPI.create(payload)
        toast.success('Karyawan berhasil ditambahkan')
      }
      setOpen(false)
      setEditEmployee(null)
      setForm(emptyForm)
      load()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (emp: Employee) => {
    if (!confirm(`Hapus karyawan "${emp.name}"? Data absensi terkait juga akan terhapus.`)) return
    setDeletingId(emp.id)
    try {
      await employeeAPI.delete(emp.id)
      toast.success('Karyawan dihapus')
      setEmployees((prev) => prev.filter((e) => e.id !== emp.id))
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Gagal menghapus')
    } finally {
      setDeletingId(null)
    }
  }

  const handlePhotoClick = (id: string) => {
    setPendingUploadId(id)
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !pendingUploadId) return
    e.target.value = ''
    setUploadingId(pendingUploadId)
    try {
      const res = await employeeAPI.uploadPhoto(pendingUploadId, file) as Employee
      setEmployees((prev) => prev.map((emp) =>
        emp.id === pendingUploadId ? { ...emp, photo_url: res.photo_url, photo_path: res.photo_path } : emp
      ))
      toast.success('Foto berhasil diupload')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Upload gagal')
    } finally {
      setUploadingId(null)
      setPendingUploadId(null)
    }
  }

  const printAllQR = () => {
    if (!printRef.current) return
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`
      <html><head><title>QR Karyawan</title>
      <style>
        body { font-family: sans-serif; margin: 0; }
        .grid { display: flex; flex-wrap: wrap; gap: 0; }
        .item { width: 33.3%; border: 1px solid #ddd; padding: 12px; text-align: center; box-sizing: border-box; page-break-inside: avoid; }
        .name { font-weight: bold; font-size: 13px; margin-top: 6px; }
        .pos { font-size: 11px; color: #666; }
        @media print { body { -webkit-print-color-adjust: exact; } }
      </style></head><body>
      <div class="grid">${printRef.current.innerHTML}</div>
      </body></html>`)
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 300)
  }

  const active = employees.filter((e) => e.is_active)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Karyawan</h2>
          <p className="text-sm text-muted-foreground">Total: {active.length} karyawan aktif</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={printAllQR}>
            <Printer className="h-4 w-4" /> Cetak QR
          </Button>
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEditEmployee(null); setForm(emptyForm) } }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" /> Tambah Karyawan
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editEmployee ? 'Edit Karyawan' : 'Tambah Karyawan Baru'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Nama Lengkap</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>No. HP</Label>
                    <Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Jabatan</Label>
                    <Input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} required />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Upah Harian (Rp)</Label>
                    <Input
                      type="number"
                      value={form.daily_salary}
                      onChange={(e) => setForm({ ...form, daily_salary: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Tgl Bergabung</Label>
                    <Input type="date" value={form.hire_date} onChange={(e) => setForm({ ...form, hire_date: e.target.value })} required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={form.is_active ? 'active' : 'inactive'}
                    onValueChange={(v) => setForm({ ...form, is_active: v === 'active' })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Aktif</SelectItem>
                      <SelectItem value="inactive">Tidak Aktif</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Simpan'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Hidden file input for photo upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-card overflow-hidden shadow-sm">
              <div className="aspect-square bg-muted animate-pulse" />
              <div className="p-3 space-y-2">
                <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      ) : employees.length === 0 ? (
        <div className="text-center text-muted-foreground py-16">Belum ada karyawan</div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {employees.map((emp) => (
            <div key={emp.id} className="group relative rounded-xl border bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow">
              {/* Photo area */}
              <div className="relative aspect-square bg-muted flex items-center justify-center overflow-hidden">
                {emp.photo_url ? (
                  <Image src={emp.photo_url} alt={emp.name} fill className="object-cover" unoptimized />
                ) : (
                  <User className="h-14 w-14 text-muted-foreground/30" />
                )}
                <button
                  onClick={() => handlePhotoClick(emp.id)}
                  disabled={uploadingId === emp.id}
                  className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/0 group-hover:bg-black/40 transition-colors text-transparent group-hover:text-white text-xs font-medium"
                >
                  {uploadingId === emp.id
                    ? <span className="text-white text-xs">Mengunggah...</span>
                    : <><Upload className="h-5 w-5" /><span>Ganti Foto</span></>
                  }
                </button>
              </div>
              {/* Info */}
              <div className="p-3">
                <div className="flex items-start justify-between gap-1">
                  <div className="min-w-0">
                    <p className="font-medium text-sm leading-tight truncate">{emp.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{emp.position}</p>
                  </div>
                  <StatusBadge status={emp.is_active ? 'active' : 'inactive'} />
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Sejak {formatDate(emp.hired_at || '')}</span>
                  <button
                    onClick={() => setQrEmployee(emp)}
                    className="text-xs text-primary hover:underline"
                    title="Lihat barcode"
                  >
                    QR
                  </button>
                </div>
                <div className="mt-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => openEdit(emp)}
                    className="flex-1 flex items-center justify-center gap-1 rounded py-1 text-xs hover:bg-muted text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="h-3 w-3" /> Edit
                  </button>
                  <button
                    onClick={() => handleDelete(emp)}
                    disabled={deletingId === emp.id}
                    className="flex-1 flex items-center justify-center gap-1 rounded py-1 text-xs hover:bg-red-50 text-muted-foreground hover:text-red-600"
                  >
                    {deletingId === emp.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                    Hapus
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Barcode detail dialog */}
      <Dialog open={!!qrEmployee} onOpenChange={(o) => !o && setQrEmployee(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Barcode Absensi — {qrEmployee?.name}</DialogTitle>
          </DialogHeader>
          {qrEmployee && (
            <div className="flex flex-col items-center gap-3 py-2">
              {qrEmployee.code ? (
                <Barcode value={String(qrEmployee.code)} width={2} height={80} fontSize={14} />
              ) : (
                <p className="text-sm text-muted-foreground">Kode belum tersedia, refresh halaman</p>
              )}
              <p className="text-sm text-muted-foreground text-center">{qrEmployee.position}</p>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => {
                  const w = window.open('', '_blank')
                  if (!w) return
                  const svg = document.querySelector('#barcode-dialog svg')?.outerHTML || ''
                  w.document.write(`<html><body style="display:flex;flex-direction:column;align-items:center;padding:20px;font-family:sans-serif">
                    ${svg}
                    <p style="font-weight:bold;margin-top:10px">${qrEmployee.name}</p>
                    <p style="color:#666;font-size:12px">${qrEmployee.position}</p>
                  </body></html>`)
                  w.document.close()
                  setTimeout(() => w.print(), 300)
                }}
              >
                <Printer className="h-4 w-4" /> Cetak
              </Button>
            </div>
          )}
          <div id="barcode-dialog" className="hidden">
            {qrEmployee?.code && <Barcode value={String(qrEmployee.code)} />}
          </div>
        </DialogContent>
      </Dialog>

      {/* Hidden print grid for all barcodes */}
      <div ref={printRef} className="hidden">
        {active.filter((e) => e.code).map((emp) => (
          <div key={emp.id} className="item">
            <Barcode value={String(emp.code)} width={1.5} height={60} fontSize={12} />
            <p className="name">{emp.name}</p>
            <p className="pos">{emp.position}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
