'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { employeeAPI } from '@/lib/api'
import { Employee } from '@/types/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowLeft, CheckCircle2, XCircle, Camera } from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'
import { id } from 'date-fns/locale'

type ScanResult = {
  employee: Employee
  shift: 1 | 2
  time: string
  status: 'success' | 'error'
  message: string
}

function getCurrentShift(): 1 | 2 {
  return new Date().getHours() < 13 ? 1 : 2
}

export default function ScanAbsenPage() {
  const [employees, setEmployees] = useState<Map<string, Employee>>(new Map())
  const [scanning, setScanning] = useState(false)
  const [results, setResults] = useState<ScanResult[]>([])
  const [lastScan, setLastScan] = useState<string | null>(null)
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const cooldownRef = useRef<Set<string>>(new Set())
  const shift = getCurrentShift()
  const today = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => {
    employeeAPI.getAll()
      .then((res) => {
        const data = (res as { data: Employee[] }).data || []
        setEmployees(new Map(data.filter((e) => e.is_active).map((e) => [e.id, e])))
      })
      .catch(() => {})
  }, [])

  const onScan = useCallback(async (decodedText: string) => {
    const empId = decodedText.trim()
    if (cooldownRef.current.has(empId)) return
    cooldownRef.current.add(empId)
    setTimeout(() => cooldownRef.current.delete(empId), 3000)

    const emp = employees.get(empId)
    const time = format(new Date(), 'HH:mm:ss')

    if (!emp) {
      setLastScan(empId)
      setResults((prev) => [{
        employee: { id: empId, name: 'Tidak dikenal', position: '' } as Employee,
        shift,
        time,
        status: 'error',
        message: 'ID karyawan tidak ditemukan',
      }, ...prev.slice(0, 9)])
      return
    }

    try {
      await employeeAPI.bulkAttendance([{
        employee_id: emp.id,
        attend_date: today,
        shift,
        present: true,
        notes: '',
      }])
      setLastScan(empId)
      setResults((prev) => [{
        employee: emp,
        shift,
        time,
        status: 'success',
        message: `Shift ${shift} tercatat — ${today}`,
      }, ...prev.slice(0, 9)])
    } catch {
      setResults((prev) => [{
        employee: emp,
        shift,
        time,
        status: 'error',
        message: 'Gagal menyimpan, coba lagi',
      }, ...prev.slice(0, 9)])
    }
  }, [employees, shift, today])

  const startScanner = async () => {
    if (scannerRef.current) return
    const scanner = new Html5Qrcode('qr-reader')
    scannerRef.current = scanner
    try {
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
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
      await scannerRef.current.stop()
      scannerRef.current = null
    }
    setScanning(false)
  }

  useEffect(() => {
    return () => { scannerRef.current?.stop().catch(() => {}) }
  }, [])

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

      {/* Camera viewfinder */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div
            id="qr-reader"
            className="w-full rounded-lg overflow-hidden bg-black"
            style={{ minHeight: scanning ? 300 : 0 }}
          />
          {!scanning && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Camera className="h-12 w-12 text-muted-foreground" />
              <p className="text-sm text-muted-foreground text-center">
                Arahkan kamera ke QR code karyawan
              </p>
              <Button onClick={startScanner} className="gap-2">
                <Camera className="h-4 w-4" /> Buka Kamera
              </Button>
            </div>
          )}
          {scanning && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-sm">Kamera aktif</span>
              </div>
              <Button variant="outline" size="sm" onClick={stopScanner}>Tutup</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent scans */}
      {results.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Riwayat scan</p>
          {results.map((r, i) => (
            <div
              key={i}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
                r.status === 'success' ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
              }`}
            >
              {r.status === 'success'
                ? <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                : <XCircle className="h-5 w-5 text-red-500 shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{r.employee.name}</p>
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
