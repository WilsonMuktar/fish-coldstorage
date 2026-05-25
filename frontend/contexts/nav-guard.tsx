'use client'

import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2, Save } from 'lucide-react'

type GuardFn = () => Promise<void>

interface NavGuardContextValue {
  // Page calls this to register a dirty guard. Pass null to unregister.
  setGuard: (fn: GuardFn | null) => void
  // Sidebar / buttons call this instead of router.push when a guard may be active.
  guardedNavigate: (href: string) => void
}

const NavGuardContext = createContext<NavGuardContextValue>({
  setGuard: () => {},
  guardedNavigate: () => {},
})

export function NavGuardProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const guardRef = useRef<GuardFn | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const setGuard = useCallback((fn: GuardFn | null) => {
    guardRef.current = fn
  }, [])

  const guardedNavigate = useCallback((href: string) => {
    if (guardRef.current) {
      setPending(href)
    } else {
      router.push(href)
    }
  }, [router])

  const handleSimpan = async () => {
    if (!guardRef.current || !pending) return
    setSaving(true)
    try {
      await guardRef.current()
      guardRef.current = null
      router.push(pending)
      setPending(null)
    } finally {
      setSaving(false)
    }
  }

  const handleBatal = () => {
    setPending(null)
  }

  return (
    <NavGuardContext.Provider value={{ setGuard, guardedNavigate }}>
      {children}

      <Dialog open={!!pending} onOpenChange={(open) => { if (!open) handleBatal() }}>
        <DialogContent aria-describedby={undefined} className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Lupa simpan absensi?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Ada perubahan absensi yang belum disimpan.</p>
          <DialogFooter className="flex gap-2 sm:justify-end">
            <Button variant="outline" onClick={handleBatal} disabled={saving}>
              Batal
            </Button>
            <Button onClick={handleSimpan} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </NavGuardContext.Provider>
  )
}

export function useNavGuard() {
  return useContext(NavGuardContext)
}
