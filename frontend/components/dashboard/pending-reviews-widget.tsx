import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { timeAgo } from '@/lib/formatters'
import { Receipt } from '@/types/api'
import { ExternalLink, FileCheck } from 'lucide-react'

const receiptTypeLabel: Record<string, string> = {
  timbangan_ikan_basah: 'Timbangan',
  bon_penjualan: 'Bon Penjualan',
  bon_pengeluaran: 'Bon Pengeluaran',
  invoice: 'Invoice',
}

interface PendingReviewsWidgetProps {
  reviews: Receipt[]
}

export function PendingReviewsWidget({ reviews }: PendingReviewsWidgetProps) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-amber-100 text-[10px]">
            <FileCheck className="h-3 w-3 text-amber-600" />
          </span>
          Pending Review
        </CardTitle>
        <Link href="/reviews">
          <Button variant="ghost" size="sm" className="text-xs">Lihat Semua</Button>
        </Link>
      </CardHeader>
      <CardContent>
        {(reviews ?? []).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <span className="text-2xl mb-1">✅</span>
            <p className="text-sm">Tidak ada review pending</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {(reviews ?? []).map((review) => (
              <li key={review.id} className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                      {receiptTypeLabel[review.receipt_type] || review.receipt_type}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground capitalize">
                    via {review.submitted_via} · {timeAgo(review.submitted_at)}
                  </p>
                </div>
                <a
                  href={`/review/${review.review_token}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0"
                >
                  <Button variant="outline" size="sm" className="gap-1 text-xs">
                    <ExternalLink className="h-3 w-3" />
                    Review
                  </Button>
                </a>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
