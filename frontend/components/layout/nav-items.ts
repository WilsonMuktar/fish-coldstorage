export interface NavItem {
  href: string
  label: string
  icon: string
  group?: string
}

export const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: 'LayoutDashboard' },
  { href: '/fish', label: 'Stok & Sortir Ikan', icon: 'Fish', group: 'Stok' },
  { href: '/perkapal', label: 'Stok Perkapal', icon: 'Anchor', group: 'Stok' },
  { href: '/items', label: 'Stok Item', icon: 'Package', group: 'Stok' },
  { href: '/master', label: 'Master Data', icon: 'Database', group: 'Master' },
  { href: '/titipan', label: 'Titipan', icon: 'Handshake', group: 'Stok' },
  { href: '/invoice', label: 'Invoice', icon: 'FileText', group: 'Transaksi' },
  { href: '/cicilan', label: 'Cicilan', icon: 'CreditCard', group: 'Transaksi' },
  { href: '/lending', label: 'Pinjaman', icon: 'Banknote', group: 'Transaksi' },
  { href: '/karyawan', label: 'Karyawan', icon: 'Users', group: 'SDM' },
  { href: '/absen', label: 'Absensi', icon: 'CalendarCheck', group: 'SDM' },
  { href: '/beli-ikan', label: 'Beli Ikan', icon: 'ShoppingCart', group: 'Transaksi' },
  { href: '/pengeluaran', label: 'Pengeluaran', icon: 'Receipt', group: 'Transaksi' },
  { href: '/reviews', label: 'Pending Review', icon: 'ClipboardCheck', group: 'Sistem' },
  { href: '/bon', label: 'Daftar Bon', icon: 'FileStack', group: 'Sistem' },
  { href: '/audit', label: 'Log Aktivitas', icon: 'History', group: 'Sistem' },
]
