'use client'

import { useEffect, useState } from 'react'
import { invoiceAPI } from '@/lib/api'
import { InstallmentSchedule } from '@/types/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/shared/status-badge'
import { formatDate, formatIDR } from '@/lib/formatters'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export default function CicilanPage() {
  const [schedules, setSchedules] = useState<InstallmentSchedule[]>([])
  const [loading, setLoading] = useState(true)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [selectedSchedule, setSelectedSchedule] = useState<InstallmentSchedule | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [paymentForm, setPaymentForm] = useState({ amount: '', notes: '' })

  const load = async () => {
    try {
      const res = await invoiceAPI.getAllSchedules() as { data: InstallmentSchedule[] }
      setSchedules(res.data || [])
    } catch {
      toast.error('Gagal memuat cicilan')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const customerSchedules = schedules.filter((s) => s.invoice_type === 'ar')
  const supplierSchedules = schedules.filter((s) => s.invoice_type === 'ap')

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedSchedule) return
    setSubmitting(true)
    try {
      await invoiceAPI.paySchedule(selectedSchedule.id, {
        amount: parseFloat(paymentForm.amount),
        notes: paymentForm.notes,
        payment_date: new Date().toISOString().slice(0, 10),
      })
      toast.success('Pembayaran berhasil dicatat')
      setPaymentOpen(false)
      setPaymentForm({ amount: '', notes: '' })
      load()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Gagal mencatat pembayaran')
    } finally {
      setSubmitting(false)
    }
  }

  const ScheduleTable = ({ data }: { data: InstallmentSchedule[] }) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>No. Invoice</TableHead>
          <TableHead>Mitra</TableHead>
          <TableHead>Jatuh Tempo</TableHead>
          <TableHead className="text-right">Tagihan</TableHead>
          <TableHead className="text-right">Terbayar</TableHead>
          <TableHead className="text-right">Sisa</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Aksi</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <TableRow key={i}>
              {Array.from({ length: 8 }).map((_, j) => (
                <TableCell key={j}><div className="h-4 w-3/4 animate-pulse rounded bg-muted" /></TableCell>
              ))}
            </TableRow>
          ))
        ) : data.length === 0 ? (
          <TableRow>
            <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
              Tidak ada data cicilan
            </TableCell>
          </TableRow>
        ) : (
          data.map((s) => {
            const outstanding = s.amount_due - s.amount_paid
            return (
              <TableRow key={s.id} className={s.status === 'overdue' ? 'bg-red-50' : ''}>
                <TableCell className="font-mono text-sm">{s.invoice_no}</TableCell>
                <TableCell className="font-medium">{s.person_name}</TableCell>
                <TableCell className={`text-sm ${s.status === 'overdue' ? 'font-semibold text-red-700' : ''}`}>
                  {formatDate(s.due_date)}
                </TableCell>
                <TableCell className="text-right font-mono">{formatIDR(s.amount_due)}</TableCell>
                <TableCell className="text-right font-mono text-green-700">{formatIDR(s.amount_paid)}</TableCell>
                <TableCell className="text-right font-mono font-semibold">{formatIDR(outstanding)}</TableCell>
                <TableCell><StatusBadge status={s.status} /></TableCell>
                <TableCell>
                  {s.status !== 'paid' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedSchedule(s)
                        setPaymentForm({ amount: String(outstanding), notes: '' })
                        setPaymentOpen(true)
                      }}
                    >
                      Bayar
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            )
          })
        )}
      </TableBody>
    </Table>
  )

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Cicilan</h2>
        <p className="text-sm text-muted-foreground">Kelola jadwal pembayaran piutang dan hutang</p>
      </div>

      <Tabs defaultValue="customer">
        <TabsList>
          <TabsTrigger value="customer">
            Piutang (AR) <span className="ml-1.5 rounded-full bg-blue-100 px-1.5 text-xs text-blue-800">{customerSchedules.length}</span>
          </TabsTrigger>
          <TabsTrigger value="supplier">
            Hutang (AP) <span className="ml-1.5 rounded-full bg-orange-100 px-1.5 text-xs text-orange-800">{supplierSchedules.length}</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="customer">
          <Card>
            <CardContent className="p-0">
              <ScheduleTable data={customerSchedules} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="supplier">
          <Card>
            <CardContent className="p-0">
              <ScheduleTable data={supplierSchedules} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Catat Pembayaran</DialogTitle>
          </DialogHeader>
          {selectedSchedule && (
            <div className="mb-4 rounded-md bg-muted p-3 text-sm">
              <p><strong>Invoice:</strong> {selectedSchedule.invoice_no}</p>
              <p><strong>Mitra:</strong> {selectedSchedule.person_name}</p>
              <p><strong>Sisa:</strong> {formatIDR(selectedSchedule.amount_due - selectedSchedule.amount_paid)}</p>
            </div>
          )}
          <form onSubmit={handlePayment} className="space-y-4">
            <div className="space-y-2">
              <Label>Jumlah Pembayaran (Rp)</Label>
              <Input
                type="number"
                value={paymentForm.amount}
                onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Catatan</Label>
              <Input
                value={paymentForm.notes}
                onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                placeholder="Opsional"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPaymentOpen(false)}>Batal</Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Simpan'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
