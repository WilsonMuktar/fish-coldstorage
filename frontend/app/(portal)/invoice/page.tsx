'use client'

import { useEffect, useState } from 'react'
import { invoiceAPI } from '@/lib/api'
import { Invoice } from '@/types/api'
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
import { Plus, Loader2, Send } from 'lucide-react'
import { toast } from 'sonner'

export default function InvoicePage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    invoice_type: 'customer',
    counterparty_name: '',
    issue_date: new Date().toISOString().slice(0, 10),
    due_date: '',
    notes: '',
  })

  const load = async () => {
    try {
      const res = await invoiceAPI.getAll() as { data: Invoice[] }
      setInvoices(res.data || [])
    } catch {
      toast.error('Gagal memuat invoice')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      await invoiceAPI.create({ ...form, items: [] })
      toast.success('Invoice berhasil dibuat')
      setOpen(false)
      setForm({ invoice_type: 'customer', counterparty_name: '', issue_date: new Date().toISOString().slice(0, 10), due_date: '', notes: '' })
      load()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Gagal membuat invoice')
    } finally {
      setSubmitting(false)
    }
  }

  const handleIssue = async (id: string) => {
    try {
      await invoiceAPI.issue(id)
      toast.success('Invoice diterbitkan')
      load()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Gagal menerbitkan invoice')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Invoice</h2>
          <p className="text-sm text-muted-foreground">Kelola invoice pelanggan dan pemasok</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" /> Buat Invoice
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Buat Invoice Baru</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Tipe Invoice</Label>
                <Select value={form.invoice_type} onValueChange={(v) => setForm({ ...form, invoice_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="customer">Customer (AR)</SelectItem>
                    <SelectItem value="supplier">Supplier (AP)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Nama {form.invoice_type === 'customer' ? 'Pelanggan' : 'Pemasok'}</Label>
                <Input
                  value={form.counterparty_name}
                  onChange={(e) => setForm({ ...form, counterparty_name: e.target.value })}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tgl Terbit</Label>
                  <Input type="date" value={form.issue_date} onChange={(e) => setForm({ ...form, issue_date: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>Tgl Jatuh Tempo</Label>
                  <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} required />
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
                <TableHead>No. Invoice</TableHead>
                <TableHead>Tipe</TableHead>
                <TableHead>Mitra</TableHead>
                <TableHead>Tgl Terbit</TableHead>
                <TableHead>Jatuh Tempo</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <TableCell key={j}><div className="h-4 w-3/4 animate-pulse rounded bg-muted" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : invoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    Belum ada invoice
                  </TableCell>
                </TableRow>
              ) : (
                invoices.map((inv) => (
                  <TableRow key={inv.id} className={inv.status === 'overdue' ? 'bg-red-50' : ''}>
                    <TableCell className="font-mono text-sm">{inv.invoice_number}</TableCell>
                    <TableCell>
                      <span className={`text-xs font-medium ${inv.invoice_type === 'customer' ? 'text-blue-700' : 'text-orange-700'}`}>
                        {inv.invoice_type === 'customer' ? 'Customer' : 'Supplier'}
                      </span>
                    </TableCell>
                    <TableCell className="font-medium">{inv.counterparty_name}</TableCell>
                    <TableCell className="text-sm">{formatDate(inv.issue_date)}</TableCell>
                    <TableCell className="text-sm">{formatDate(inv.due_date)}</TableCell>
                    <TableCell className="text-right font-mono">{formatIDR(inv.total_amount)}</TableCell>
                    <TableCell className={`text-right font-mono ${inv.outstanding_amount > 0 ? 'font-semibold text-red-700' : 'text-green-700'}`}>
                      {formatIDR(inv.outstanding_amount)}
                    </TableCell>
                    <TableCell><StatusBadge status={inv.status} /></TableCell>
                    <TableCell>
                      {inv.status === 'draft' && (
                        <Button variant="outline" size="sm" className="gap-1" onClick={() => handleIssue(inv.id)}>
                          <Send className="h-3 w-3" /> Terbitkan
                        </Button>
                      )}
                    </TableCell>
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
