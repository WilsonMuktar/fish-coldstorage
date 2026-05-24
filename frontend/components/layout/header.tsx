'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { removeToken, getUser } from '@/lib/auth'
import { LogOut, User, ChevronRight, ScanLine } from 'lucide-react'
import { PortalSubmitModal } from '@/components/shared/portal-submit-modal'

interface HeaderProps {
  title?: string
}

export function Header({ title }: HeaderProps) {
  const router = useRouter()
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [scanOpen, setScanOpen] = useState(false)

  useEffect(() => {
    const u = getUser() as { display_name?: string; person?: { first_name?: string } } | null
    setDisplayName(u?.display_name || u?.person?.first_name || null)
  }, [])

  const handleLogout = () => {
    removeToken()
    router.push('/login')
  }

  return (
    <>
      <header className="flex h-14 items-center justify-between border-b bg-card px-6 shadow-sm">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Portal</span>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-semibold text-foreground">{title || 'Management Portal'}</span>
        </div>
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            onClick={() => setScanOpen(true)}
            className="gap-2"
          >
            <ScanLine className="h-4 w-4" />
            <span>Upload Bon</span>
          </Button>
          {displayName && (
            <div className="hidden items-center gap-2 sm:flex">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
                <User className="h-3.5 w-3.5 text-primary" />
              </div>
              <span className="text-sm font-medium text-foreground">{displayName}</span>
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="gap-2 text-muted-foreground hover:text-destructive"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Keluar</span>
          </Button>
        </div>
      </header>
      <PortalSubmitModal open={scanOpen} onClose={() => setScanOpen(false)} />
    </>
  )
}
