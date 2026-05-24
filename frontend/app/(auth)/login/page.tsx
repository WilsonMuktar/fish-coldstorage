'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Image from 'next/image'
import { authAPI } from '@/lib/api'
import { setToken, setUser } from '@/lib/auth'
import { Loader2, Lock, Phone } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await authAPI.login(phone, password)
      setToken(res.access_token)
      if (res.refresh_token) localStorage.setItem('refresh_token', res.refresh_token)
      if (res.user) setUser(res.user)
      router.push('/dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login gagal. Periksa nomor HP dan password Anda.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, hsl(215,55%,8%) 0%, hsl(210,60%,14%) 50%, hsl(185,55%,12%) 100%)' }}
    >
      {/* Decorative wave bottom */}
      <div className="pointer-events-none fixed bottom-0 left-0 right-0 overflow-hidden opacity-20">
        <svg viewBox="0 0 1440 120" xmlns="http://www.w3.org/2000/svg" className="w-full">
          <path d="M0,60 C360,120 1080,0 1440,60 L1440,120 L0,120 Z" fill="#22d3ee" />
        </svg>
      </div>

      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 h-20 w-20 rounded-2xl overflow-hidden bg-white/10 ring-2 ring-white/20 shadow-lg">
            <Image src="/PT_SBA_LOGO.jpeg" alt="PT. SBA" width={80} height={80} className="h-full w-full object-cover" priority unoptimized />
          </div>
          <h1 className="text-2xl font-bold text-white">PT. Samudera Bahari Abadi</h1>
          <p className="mt-1 text-sm text-cyan-400/80">Fish Cold Storage Management</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-sm">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="phone" className="text-sm font-medium text-white/80">
                Nomor HP
              </Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                <Input
                  id="phone"
                  type="tel"
                  placeholder="08xxxxxxxxxx"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  disabled={loading}
                  className="border-white/20 bg-white/10 pl-9 text-white placeholder:text-white/30 focus:border-cyan-500 focus:ring-cyan-500/20"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium text-white/80">
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  className="border-white/20 bg-white/10 pl-9 text-white placeholder:text-white/30 focus:border-cyan-500 focus:ring-cyan-500/20"
                />
              </div>
            </div>
            {error && (
              <div className="rounded-lg bg-red-500/20 px-4 py-3 text-sm text-red-300 border border-red-500/30">
                {error}
              </div>
            )}
            <Button
              type="submit"
              className="w-full bg-cyan-600 font-semibold text-white hover:bg-cyan-500 focus:ring-cyan-500/40"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Masuk...
                </>
              ) : (
                'Masuk ke Portal'
              )}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-white/30">
          © 2026 PT. Samudera Bahari Abadi · v1.0
        </p>
      </div>
    </div>
  )
}
