'use client'

import { useEffect, useState } from 'react'
import { lendingAPI } from '@/lib/api'
import { LendingRecord } from '@/types/api'
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
import { formatDate, formatIDR } from '@/lib/formatters'
import { Plus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export default function LendingPage() {
  const [records, setRecords] = useState<LendingRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    counterparty_name: '',
    transaction_type: 'lend_out',
    amount: '',
    date: new Date().toISOString().slice(0, 10),
    notes: '',
  })

  const load = async () => {
    try {
      const res = await lendingAPI.getAll() as { data: LendingRecord[] }
      setRecords(res.data || [])
    } catch {
      toast.error('Gagal memuat data pinjaman')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      await lendingAPI.create({
        ...form,
        amount: parseFloat(form.amount),
      })
      toast.success('Transaksi pinjaman berhasil dicatat')
      setOpen(false)
      setForm({ counterparty_name: '', transaction_type: 'lend_out', amount: '', date: new Date().toISOString().slice(0, 10), notes: '' })
      load()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Pinjaman</h2>
          <p className="text-sm text-muted-foreground">Kelola transaksi pinjam-meminjam</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" /> Tambah Transaksi
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Tambah Transaksi Pinjaman</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Nama Mitra</Label>
                <Input value={form.counterparty_name} onChange={(e) => setForm({ ...form, counterparty_name: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Tipe Transaksi</Label>
                <Select value={form.transaction_type} onValueChange={(v) => setForm({ ...form, transaction_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lend_out">Meminjamkan</SelectItem>
                    <SelectItem value="receive_back">Terima Kembali</SelectItem>
                    <SelectItem value="borrow">Meminjam</SelectItem>
                    <SelectItem value="pay_back">Membayar Kembali</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Jumlah (Rp)</Label>
                  <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>Tanggal</Label>
                  <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Catatan</Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Opsional" />
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

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tanggal</TableHead>
                <TableHead>Mitra</TableHead>
                <TableHead>Tipe</TableHead>
                <TableHead className="text-right">Jumlah</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead>Catatan</TableHead>
                <TableHead>Dicatat Oleh</TableHead>
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
              ) : records.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    Belum ada transaksi pinjaman
                  </TableCell>
                </TableRow>
              ) : (
                records.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm whitespace-nowrap">{formatDate(r.date)}</TableCell>
                    <TableCell className="font-medium">{r.counterparty_name}</TableCell>
                    <TableCell><StatusBadge status={r.transaction_type} /></TableCell>
                    <TableCell className={`text-right font-mono ${r.transaction_type === 'lend_out' || r.transaction_type === 'borrow' ? 'text-red-700' : 'text-green-700'}`}>
                      {formatIDR(r.amount)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {r.balance !== undefined ? formatIDR(r.balance) : '-'}
                    </TableCell>
                    <TableCell className="max-w-32 truncate text-sm text-muted-foreground">{r.notes || '-'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.created_by}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
