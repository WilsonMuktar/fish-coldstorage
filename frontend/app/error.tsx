'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-lg font-semibold text-destructive">Terjadi kesalahan</p>
      <p className="text-sm text-muted-foreground">{error.message}</p>
      <Button onClick={reset}>Coba lagi</Button>
    </div>
  )
}
