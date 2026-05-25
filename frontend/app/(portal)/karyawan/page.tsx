'use client'

import { useEffect, useRef, useState } from 'react'
import { employeeAPI } from '@/lib/api'
import { Employee } from '@/types/api'
import { Card, CardContent } from '@/components/ui/card'
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/shared/status-badge'
import { formatDate } from '@/lib/formatters'
import { Plus, Loader2, QrCode, Printer } from 'lucide-react'
import { toast } from 'sonner'
import { QRCodeSVG } from 'qrcode.react'

export default function KaryawanPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [qrEmployee, setQrEmployee] = useState<Employee | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)
  const [form, setForm] = useState({
    name: '',
    phone: '',
    position: '',
    daily_salary: '',
    hire_date: new Date().toISOString().slice(0, 10),
    is_active: true,
  })

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      await employeeAPI.create({
        ...form,
        daily_salary: parseFloat(form.daily_salary) || 0,
      })
      toast.success('Karyawan berhasil ditambahkan')
      setOpen(false)
      setForm({ name: '', phone: '', position: '', daily_salary: '', hire_date: new Date().toISOString().slice(0, 10), is_active: true })
      load()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan')
    } finally {
      setSubmitting(false)
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
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" /> Tambah Karyawan
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Tambah Karyawan Baru</DialogTitle>
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

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama</TableHead>
                <TableHead>No. HP</TableHead>
                <TableHead>Jabatan</TableHead>
                <TableHead>Upah/Hari</TableHead>
                <TableHead>Tgl Bergabung</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-16">QR</TableHead>
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
              ) : employees.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    Belum ada karyawan
                  </TableCell>
                </TableRow>
              ) : (
                employees.map((emp) => (
                  <TableRow key={emp.id}>
                    <TableCell className="font-medium">{emp.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{emp.phone || '-'}</TableCell>
                    <TableCell>{emp.position}</TableCell>
                    <TableCell className="text-sm">
                      {emp.daily_salary ? `Rp ${new Intl.NumberFormat('id-ID').format(emp.daily_salary)}` : '-'}
                    </TableCell>
                    <TableCell className="text-sm">{formatDate(emp.hired_at || '')}</TableCell>
                    <TableCell><StatusBadge status={emp.is_active ? 'active' : 'inactive'} /></TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setQrEmployee(emp)}
                        title="Lihat QR"
                      >
                        <QrCode className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* QR detail dialog */}
      <Dialog open={!!qrEmployee} onOpenChange={(o) => !o && setQrEmployee(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>QR Absensi — {qrEmployee?.name}</DialogTitle>
          </DialogHeader>
          {qrEmployee && (
            <div className="flex flex-col items-center gap-3 py-2">
              <QRCodeSVG value={qrEmployee.id} size={200} level="M" />
              <p className="text-sm text-muted-foreground text-center">{qrEmployee.position}</p>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => {
                  const w = window.open('', '_blank')
                  if (!w) return
                  const svg = document.querySelector('[data-qr-dialog] svg')?.outerHTML || ''
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
        </DialogContent>
      </Dialog>

      {/* Hidden print grid for all QR codes */}
      <div ref={printRef} className="hidden">
        {active.map((emp) => (
          <div key={emp.id} className="item">
            <QRCodeSVG value={emp.id} size={120} level="M" />
            <p className="name">{emp.name}</p>
            <p className="pos">{emp.position}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
