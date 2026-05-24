'use client'

import { useEffect, useState } from 'react'
import { titipanAPI } from '@/lib/api'
import { TitipanRecord } from '@/types/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/shared/status-badge'
import { formatDate, formatKg } from '@/lib/formatters'
import { toast } from 'sonner'

export default function TitipanPage() {
  const [titipan, setTitipan] = useState<TitipanRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    titipanAPI
      .getAll()
      .then((res) => setTitipan((res as { data: TitipanRecord[] }).data || []))
      .catch(() => toast.error('Gagal memuat data titipan'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Titipan</h2>
          <p className="text-sm text-muted-foreground">Kelola ikan titipan pelanggan</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pemilik</TableHead>
                <TableHead>No. HP</TableHead>
                <TableHead>Jenis Ikan</TableHead>
                <TableHead className="text-right">Awal (kg)</TableHead>
                <TableHead className="text-right">Saldo (kg)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tgl Masuk</TableHead>
                <TableHead>Catatan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <TableCell key={j}><div className="h-4 w-3/4 animate-pulse rounded bg-muted" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : titipan.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    Belum ada data titipan
                  </TableCell>
                </TableRow>
              ) : (
                titipan.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.owner_name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{t.owner_phone || '-'}</TableCell>
                    <TableCell>{t.fish_type_name}</TableCell>
                    <TableCell className="text-right font-mono">{formatKg(t.quantity_kg)}</TableCell>
                    <TableCell className="text-right font-mono font-semibold">{formatKg(t.balance_kg)}</TableCell>
                    <TableCell><StatusBadge status={t.status} /></TableCell>
                    <TableCell className="text-sm">{formatDate(t.created_at)}</TableCell>
                    <TableCell className="max-w-32 truncate text-sm text-muted-foreground">{t.notes || '-'}</TableCell>
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
