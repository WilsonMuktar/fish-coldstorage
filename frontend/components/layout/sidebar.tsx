'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { navItems } from './nav-items'
import {
  LayoutDashboard,
  Fish,
  Anchor,
  Ship,
  Package,
  Handshake,
  FileText,
  FileStack,
  CreditCard,
  Banknote,
  Users,
  CalendarCheck,
  ClipboardCheck,
  History,
  Layers,
  Database,
  ShoppingCart,
  Receipt,
  PanelLeftClose,
  PanelLeftOpen,
  Waves,
} from 'lucide-react'

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard,
  Fish,
  Anchor,
  Ship,
  Package,
  Handshake,
  FileText,
  FileStack,
  CreditCard,
  Banknote,
  Users,
  CalendarCheck,
  ClipboardCheck,
  History,
  Layers,
  Database,
  ShoppingCart,
  Receipt,
}

export function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('sidebar-collapsed')
    if (stored === 'true') setCollapsed(true)
  }, [])

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem('sidebar-collapsed', String(next))
      return next
    })
  }

  const groups = navItems.reduce<Record<string, typeof navItems>>((acc, item) => {
    const group = item.group || 'Main'
    if (!acc[group]) acc[group] = []
    acc[group].push(item)
    return acc
  }, {})

  const groupOrder = ['Main', 'Stok', 'Transaksi', 'SDM', 'Master', 'Sistem']

  return (
    <div
      className={cn(
        'flex h-full flex-col overflow-hidden transition-all duration-200',
        collapsed ? 'w-16' : 'w-64'
      )}
      style={{ background: 'hsl(var(--sidebar-bg))', borderRight: '1px solid hsl(var(--sidebar-border))' }}
    >
      {/* Branding */}
      <div
        className="relative flex items-center overflow-hidden"
        style={{
          borderBottom: '1px solid hsl(var(--sidebar-border))',
          minHeight: '64px',
          padding: collapsed ? '0' : undefined,
        }}
      >
        {collapsed ? (
          <div className="flex w-full items-center justify-center py-3">
            <div className="h-9 w-9 shrink-0 rounded-xl overflow-hidden bg-white/10 ring-2 ring-white/20">
              <Image src="/PT_SBA_LOGO.jpeg" alt="PT. SBA" width={36} height={36} className="h-full w-full object-cover" priority unoptimized />
            </div>
          </div>
        ) : (
          <>
            <div className="absolute inset-0 opacity-10 pointer-events-none select-none overflow-hidden">
              <Waves className="absolute -bottom-2 -left-4 h-20 w-48 text-cyan-400 wave-animate" />
            </div>
            <div className="relative flex items-center gap-3 px-5 py-4 min-w-0">
              <div className="h-10 w-10 shrink-0 rounded-xl overflow-hidden bg-white/10 ring-2 ring-white/20">
                <Image src="/PT_SBA_LOGO.jpeg" alt="PT. SBA Logo" width={40} height={40} className="h-full w-full object-cover" priority unoptimized />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold leading-tight text-white">PT. Samudera</p>
                <p className="text-xs font-medium text-cyan-400">Bahari Abadi</p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Nav */}
      <nav className={cn('flex-1 overflow-y-auto py-3', collapsed ? 'px-2' : 'px-3')}>
        {groupOrder.filter(g => groups[g]).map((group) => (
          <div key={group} className="mb-2">
            {!collapsed && group !== 'Main' && (
              <p
                className="mb-1 mt-2 px-3 text-[10px] font-bold uppercase tracking-widest"
                style={{ color: 'hsl(var(--sidebar-muted))' }}
              >
                {group}
              </p>
            )}
            {collapsed && group !== 'Main' && (
              <div className="my-1 mx-1" style={{ borderTop: '1px solid hsl(var(--sidebar-border))' }} />
            )}
            <ul className="space-y-0.5">
              {groups[group].map((item) => {
                const Icon = iconMap[item.icon] || LayoutDashboard
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        'flex items-center rounded-lg text-sm font-medium transition-all duration-150',
                        collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2',
                        isActive ? 'text-white shadow-sm' : 'hover:text-white'
                      )}
                      style={
                        isActive
                          ? { background: 'hsl(var(--sidebar-active))' }
                          : { color: 'hsl(var(--sidebar-text))', background: 'transparent' }
                      }
                      onMouseEnter={(e) => {
                        if (!isActive) (e.currentTarget as HTMLElement).style.background = 'hsl(var(--sidebar-hover))'
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'
                      }}
                    >
                      <Icon className={cn('shrink-0', collapsed ? 'h-5 w-5' : 'h-4 w-4', isActive ? 'text-white' : 'text-cyan-400/70')} />
                      {!collapsed && item.label}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer / Toggle */}
      <div
        className={cn('flex items-center px-3 py-3', collapsed ? 'justify-center' : 'justify-between')}
        style={{ borderTop: '1px solid hsl(var(--sidebar-border))' }}
      >
        {!collapsed && (
          <p className="text-[10px]" style={{ color: 'hsl(var(--sidebar-muted))' }}>
            v1.0 · Fish Cold Storage
          </p>
        )}
        <button
          onClick={toggle}
          title={collapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'}
          className="rounded-md p-1.5 transition-colors hover:text-white"
          style={{ color: 'hsl(var(--sidebar-muted))' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'hsl(var(--sidebar-hover))' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}
