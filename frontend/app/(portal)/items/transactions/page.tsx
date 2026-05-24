'use client'

import { useEffect, useState } from 'react'
import { itemAPI } from '@/lib/api'
import { ItemTransaction } from '@/types/api'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/shared/status-badge'
import { formatDateTime, formatIDR } from '@/lib/formatters'
import { toast } from 'sonner'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'

export default function ItemTransactionsPage() {
  const [transactions, setTransactions] = useState<ItemTransaction[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    itemAPI
      .getTransactions()
      .then((res) => setTransactions((res as { data: ItemTransaction[] }).data || []))
      .catch(() => toast.error('Gagal memuat transaksi item'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Transaksi Item</h2>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tanggal</TableHead>
                <TableHead>Tipe</TableHead>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Harga</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Mitra</TableHead>
                <TableHead>Catatan</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <TableCell key={j}><div className="h-4 w-3/4 animate-pulse rounded bg-muted" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : transactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    Belum ada transaksi
                  </TableCell>
                </TableRow>
              ) : (
                transactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="text-xs whitespace-nowrap">{formatDateTime(tx.created_at)}</TableCell>
                    <TableCell><StatusBadge status={tx.transaction_type} /></TableCell>
                    <TableCell>{tx.item_name}</TableCell>
                    <TableCell className="text-right">{tx.quantity.toLocaleString('id-ID')}</TableCell>
                    <TableCell className="text-right font-mono">
                      {tx.unit_price ? formatIDR(tx.unit_price) : '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {tx.total_amount ? formatIDR(tx.total_amount) : '-'}
                    </TableCell>
                    <TableCell>{tx.counterparty_name || '-'}</TableCell>
                    <TableCell className="max-w-32 truncate text-sm text-muted-foreground">
                      {tx.notes || '-'}
                    </TableCell>
                    <TableCell className="text-center">
                      {tx.review_token && (
                        <Link href={`/review/${tx.review_token}`}
                          className="inline-flex items-center text-primary hover:text-primary/70"
                          title="Lihat bon">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
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
