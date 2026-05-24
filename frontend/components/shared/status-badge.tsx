import { cn } from '@/lib/utils'

const statusConfig: Record<string, { label: string; cls: string }> = {
  // Transactions
  buy:            { label: 'Masuk',      cls: 'bg-emerald-100 text-emerald-800' },
  sell:           { label: 'Keluar',     cls: 'bg-rose-100 text-rose-800' },
  adjust:         { label: 'Adjustment', cls: 'bg-purple-100 text-purple-800' },
  // Legacy / fallback
  masuk:          { label: 'Masuk',      cls: 'bg-emerald-100 text-emerald-800' },
  keluar:         { label: 'Keluar',     cls: 'bg-rose-100 text-rose-800' },
  adjustment:     { label: 'Adjustment', cls: 'bg-purple-100 text-purple-800' },
  // Reviews / receipts
  pending:        { label: 'Pending',    cls: 'bg-yellow-100 text-yellow-800' },
  reviewing:      { label: 'Review',     cls: 'bg-blue-100 text-blue-800' },
  approved:       { label: 'Disetujui', cls: 'bg-green-100 text-green-800' },
  rejected:       { label: 'Ditolak',   cls: 'bg-red-100 text-red-800' },
  // Invoice
  draft:          { label: 'Draft',      cls: 'bg-gray-100 text-gray-700' },
  issued:         { label: 'Diterbitkan',cls: 'bg-blue-100 text-blue-800' },
  partially_paid: { label: 'Sebagian',   cls: 'bg-orange-100 text-orange-800' },
  partial:        { label: 'Sebagian',   cls: 'bg-orange-100 text-orange-800' },
  paid:           { label: 'Lunas',      cls: 'bg-green-100 text-green-800' },
  overdue:        { label: 'Jatuh Tempo',cls: 'bg-red-100 text-red-800' },
  cancelled:      { label: 'Batal',      cls: 'bg-gray-100 text-gray-500' },
  // Vessel
  active:         { label: 'Aktif',      cls: 'bg-green-100 text-green-800' },
  Active:         { label: 'Aktif',      cls: 'bg-green-100 text-green-800' },
  Inactive:       { label: 'Nonaktif',   cls: 'bg-gray-100 text-gray-700' },
  Decommissioned: { label: 'Pensiun',    cls: 'bg-red-100 text-red-800' },
  // Attendance
  hadir:          { label: 'Hadir',      cls: 'bg-green-100 text-green-800' },
  izin:           { label: 'Izin',       cls: 'bg-yellow-100 text-yellow-800' },
  sakit:          { label: 'Sakit',      cls: 'bg-orange-100 text-orange-800' },
  alpha:          { label: 'Alpha',      cls: 'bg-red-100 text-red-800' },
  // Lending
  lend_out:       { label: 'Dipinjamkan',cls: 'bg-blue-100 text-blue-800' },
  receive_back:   { label: 'Kembali',    cls: 'bg-green-100 text-green-800' },
  borrow:         { label: 'Dipinjam',   cls: 'bg-yellow-100 text-yellow-800' },
  pay_back:       { label: 'Bayar',      cls: 'bg-green-100 text-green-800' },
}

export function StatusBadge({ status }: { status: string }) {
  const cfg = statusConfig[status]
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold',
        cfg?.cls || 'bg-gray-100 text-gray-700'
      )}
    >
      {cfg?.label ?? status}
    </span>
  )
}
