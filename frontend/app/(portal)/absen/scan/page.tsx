'use client'

import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import { employeeAPI } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowLeft, CheckCircle2, XCircle, Camera, UserCheck } from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'
import { id } from 'date-fns/locale'

type ScanResult = {
  name: string
  shift: number
  time: string
  status: 'success' | 'error'
  message: string
}

function getCurrentShift(): 1 | 2 {
  return new Date().getHours() < 13 ? 1 : 2
}

export default function ScanAbsenPage() {
  const [scanning, setScanning] = useState(false)
  const [results, setResults] = useState<ScanResult[]>([])
  const [lastResult, setLastResult] = useState<ScanResult | null>(null)
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const cooldownRef = useRef<Set<string>>(new Set())
  const shift = getCurrentShift()

  const onScan = async (decodedText: string) => {
    const raw = decodedText.trim()
    if (cooldownRef.current.has(raw)) return
    cooldownRef.current.add(raw)
    setTimeout(() => cooldownRef.current.delete(raw), 4000)

    const code = parseInt(raw)
    const time = format(new Date(), 'HH:mm:ss')

    if (isNaN(code)) {
      const r: ScanResult = { name: raw, shift, time, status: 'error', message: 'Bukan kode karyawan yang valid' }
      setLastResult(r)
      setResults((prev) => [r, ...prev.slice(0, 9)])
      return
    }

    try {
      const res = await employeeAPI.scanAttendance(code)
      const r: ScanResult = {
        name: res.employee_name,
        shift: res.shift,
        time,
        status: 'success',
        message: `Shift ${res.shift} (${res.shift === 1 ? 'Pagi' : 'Sore'}) — ${res.date}`,
      }
      setLastResult(r)
      setResults((prev) => [r, ...prev.slice(0, 9)])
    } catch {
      const r: ScanResult = { name: `Kode ${code}`, shift, time, status: 'error', message: 'Karyawan tidak ditemukan' }
      setLastResult(r)
      setResults((prev) => [r, ...prev.slice(0, 9)])
    }
  }

  const startScanner = async () => {
    if (scannerRef.current) return
    const scanner = new Html5Qrcode('qr-reader', {
      verbose: false,
      formatsToSupport: [
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.QR_CODE,
      ],
    })
    scannerRef.current = scanner
    try {
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 15, qrbox: { width: 280, height: 120 } },
        onScan,
        () => {}
      )
      setScanning(true)
    } catch {
      scannerRef.current = null
      alert('Tidak bisa akses kamera. Pastikan izin kamera sudah diberikan.')
    }
  }

  const stopScanner = async () => {
    if (scannerRef.current) {
      await scannerRef.current.stop().catch(() => {})
      scannerRef.current = null
    }
    setScanning(false)
  }

  useEffect(() => {
    return () => { scannerRef.current?.stop().catch(() => {}) }
  }, [])

  // Auto-clear last result banner after 3s
  useEffect(() => {
    if (!lastResult) return
    const t = setTimeout(() => setLastResult(null), 3000)
    return () => clearTimeout(t)
  }, [lastResult])

  return (
    <div className="max-w-md mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/absen">
          <Button variant="ghost" size="icon" onClick={stopScanner}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h2 className="text-lg font-semibold">Scan Absensi</h2>
          <p className="text-sm text-muted-foreground">
            {format(new Date(), 'EEEE, d MMMM yyyy', { locale: id })} &bull;{' '}
            <span className="font-medium text-foreground">
              Shift {shift} ({shift === 1 ? 'Pagi' : 'Sore'})
            </span>
          </p>
        </div>
      </div>

      {/* Last scan banner */}
      {lastResult && (
        <div className={`flex items-center gap-3 rounded-lg px-4 py-3 transition-all ${
          lastResult.status === 'success'
            ? 'bg-green-100 border border-green-300'
            : 'bg-red-100 border border-red-300'
        }`}>
          {lastResult.status === 'success'
            ? <CheckCircle2 className="h-6 w-6 text-green-600 shrink-0" />
            : <XCircle className="h-6 w-6 text-red-500 shrink-0" />}
          <div>
            <p className="font-semibold">{lastResult.name}</p>
            <p className="text-sm text-muted-foreground">{lastResult.message}</p>
          </div>
        </div>
      )}

      {/* Camera */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div
            id="qr-reader"
            className="w-full rounded-lg overflow-hidden bg-black"
            style={{ minHeight: scanning ? 240 : 0 }}
          />
          {!scanning ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <Camera className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground text-center">
                Arahkan kamera ke barcode karyawan
              </p>
              <Button onClick={startScanner} className="gap-2">
                <Camera className="h-4 w-4" /> Buka Kamera
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-sm">Menunggu scan...</span>
              </div>
              <Button variant="outline" size="sm" onClick={stopScanner}>Tutup</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* History */}
      {results.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <UserCheck className="h-4 w-4" /> Riwayat scan hari ini
          </div>
          {results.map((r, i) => (
            <div
              key={i}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
                r.status === 'success' ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
              }`}
            >
              {r.status === 'success'
                ? <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                : <XCircle className="h-4 w-4 text-red-500 shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{r.name}</p>
                <p className="text-xs text-muted-foreground">{r.message}</p>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">{r.time}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
