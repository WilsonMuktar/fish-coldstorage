'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

export default function PortalError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <p className="text-lg font-semibold text-destructive">Halaman gagal dimuat</p>
      <p className="text-sm text-muted-foreground">{error.message}</p>
      <Button onClick={reset}>Coba lagi</Button>
    </div>
  )
}
