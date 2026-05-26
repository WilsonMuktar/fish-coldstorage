'use client'

import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Fish, Anchor, BarChart3, ClipboardCheck, Users, Package } from 'lucide-react'

const features = [
  { icon: Fish, label: 'Stok & Sortir Ikan', desc: 'Kelola stok ikan segar dan hasil sortir secara real-time.' },
  { icon: Anchor, label: 'Manajemen Kapal', desc: 'Pantau timbangan dan perkapal dari setiap armada.' },
  { icon: ClipboardCheck, label: 'Review Bon', desc: 'Setujui atau tolak bon masuk langsung dari portal.' },
  { icon: BarChart3, label: 'Dashboard & Laporan', desc: 'Ringkasan keuangan, stok, dan aktivitas harian.' },
  { icon: Users, label: 'Karyawan & Absensi', desc: 'Absensi 2 shift, laporan gaji, dan scan QR.' },
  { icon: Package, label: 'Stok Item & Pengeluaran', desc: 'Catat beli item, bayar jasa, dan stok gudang.' },
]

export default function LandingPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* Nav */}
      <header className="sticky top-0 z-10 border-b border-white/10 bg-slate-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 overflow-hidden rounded-xl bg-white/10 ring-2 ring-white/20">
              <Image src="/PT_SBA_LOGO.jpeg" alt="PT. SBA" width={36} height={36} className="h-full w-full object-cover" unoptimized />
            </div>
            <div>
              <p className="text-sm font-bold leading-tight">PT. Samudera</p>
              <p className="text-xs text-cyan-400">Bahari Abadi</p>
            </div>
          </div>
          <Button
            size="sm"
            className="bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-semibold"
            onClick={() => router.push('/login')}
          >
            Login
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-6 py-20 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-1.5 text-xs font-medium text-cyan-300">
          <Fish className="h-3.5 w-3.5" /> Sistem Manajemen Cold Storage Ikan
        </div>
        <h1 className="mt-4 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          Kelola Bisnis Ikan<br />
          <span className="text-cyan-400">Lebih Mudah & Teratur</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-base text-slate-400">
          Platform manajemen terpadu untuk cold storage ikan — dari timbangan kapal, sortir,
          stok, karyawan, hingga laporan keuangan, semua dalam satu portal.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button
            size="lg"
            className="bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-semibold px-8"
            onClick={() => router.push('/login')}
          >
            Masuk ke Portal
          </Button>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-5xl px-6 pb-20">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, label, desc }) => (
            <div
              key={label}
              className="rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur transition-colors hover:border-cyan-400/30 hover:bg-white/8"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-400/10">
                <Icon className="h-5 w-5 text-cyan-400" />
              </div>
              <p className="font-semibold text-sm">{label}</p>
              <p className="mt-1 text-xs text-slate-400">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-6 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} PT. Samudera Bahari Abadi — Fish Cold Storage Management
      </footer>
    </div>
  )
}
