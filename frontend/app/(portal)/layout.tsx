'use client'

import { usePathname } from 'next/navigation'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { NavGuardProvider } from '@/contexts/nav-guard'

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/fish': 'Stok & Sortir Ikan',
  '/fish/transactions': 'Transaksi Ikan',
  '/perkapal': 'Stok Perkapal',
  '/vessels': 'Daftar Kapal',
  '/items': 'Stok Item',
  '/items/transactions': 'Transaksi Item',
  '/titipan': 'Titipan',
  '/invoice': 'Invoice',
  '/cicilan': 'Cicilan',
  '/lending': 'Pinjaman',
  '/karyawan': 'Karyawan',
  '/absen': 'Absensi',
  '/reviews': 'Pending Review',
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  const title = pageTitles[pathname] || 'Management Portal'

  return (
    <NavGuardProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header title={title} />
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </div>
    </NavGuardProvider>
  )
}
