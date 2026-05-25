'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { employeeAPI } from '@/lib/api'
import { Employee, Attendance } from '@/types/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Loader2, Save, ScanLine } from 'lucide-react'
import { toast } from 'sonner'
import { useNavGuard } from '@/contexts/nav-guard'

interface ShiftEntry {
  employee_id: string
  employee_name: string
  shift1: boolean
  shift2: boolean
  notes: string
}

export default function AbsenPage() {
  const router = useRouter()
  const { setGuard, guardedNavigate } = useNavGuard()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [entries, setEntries] = useState<ShiftEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [isDirty, setIsDirty] = useState(false)
  // Local dialog for in-page navigation (date change, Scan QR, Laporan buttons)
  const [showLocalDialog, setShowLocalDialog] = useState(false)
  const pendingActionRef = useRef<(() => void) | null>(null)

  // Register/unregister the guard with the nav context when dirty state changes
  useEffect(() => {
    if (isDirty) {
      setGuard(async () => {
        await doSave()
      })
    } else {
      setGuard(null)
    }
    return () => setGuard(null)
  }, [isDirty]) // eslint-disable-line react-hooks/exhaustive-deps

  // Block browser refresh/close when dirty
  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  const loadEmployees = async () => {
    try {
      const res = await employeeAPI.getAll() as { data: Employee[] }
      const active = (res.data || []).filter((e) => e.is_active)
      setEmployees(active)
      return active
    } catch {
      toast.error('Gagal memuat karyawan')
      return []
    }
  }

  const loadAttendance = async (emps: Employee[], selectedDate: string) => {
    try {
      const res = await employeeAPI.getAttendance(selectedDate) as { data: Attendance[] }
      const records = res.data || []
      const byEmpShift = new Map<string, boolean>()
      records.forEach((a) => {
        byEmpShift.set(`${a.employee_id}-${a.shift}`, a.present)
      })
      setEntries(emps.map((emp) => ({
        employee_id: emp.id,
        employee_name: emp.name,
        shift1: byEmpShift.get(`${emp.id}-1`) ?? false,
        shift2: byEmpShift.get(`${emp.id}-2`) ?? false,
        notes: '',
      })))
    } catch {
      setEntries(emps.map((emp) => ({
        employee_id: emp.id,
        employee_name: emp.name,
        shift1: false,
        shift2: false,
        notes: '',
      })))
    } finally {
      setLoading(false)
      setIsDirty(false)
    }
  }

  useEffect(() => {
    loadEmployees().then((emps) => loadAttendance(emps, date))
  }, [])

  useEffect(() => {
    if (employees.length > 0) loadAttendance(employees, date)
  }, [date])

  const toggle = (empId: string, shift: 'shift1' | 'shift2') => {
    setEntries((prev) =>
      prev.map((e) => e.employee_id === empId ? { ...e, [shift]: !e[shift] } : e)
    )
    setIsDirty(true)
  }

  // Extracted so the nav guard context can also call it
  const doSave = async () => {
    setSaving(true)
    try {
      const records = entries.flatMap((e) => [
        { employee_id: e.employee_id, attend_date: date, shift: 1, present: e.shift1, notes: e.notes },
        { employee_id: e.employee_id, attend_date: date, shift: 2, present: e.shift2, notes: e.notes },
      ])
      await employeeAPI.bulkAttendance(records)
      toast.success('Absensi berhasil disimpan')
      setIsDirty(false)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan absensi')
      throw err
    } finally {
      setSaving(false)
    }
  }

  // Guard for in-page actions (date change, Scan QR, Laporan buttons)
  const guardLocal = (action: () => void) => {
    if (isDirty) {
      pendingActionRef.current = action
      setShowLocalDialog(true)
    } else {
      action()
    }
  }

  const handleLocalSimpan = async () => {
    await doSave()
    setShowLocalDialog(false)
    pendingActionRef.current?.()
    pendingActionRef.current = null
  }

  const handleLocalBatal = () => {
    setShowLocalDialog(false)
    pendingActionRef.current = null
  }

  const handleDateChange = (newDate: string) => {
    guardLocal(() => setDate(newDate))
  }

  const hadir = entries.filter((e) => e.shift1 || e.shift2).length
  const fullDay = entries.filter((e) => e.shift1 && e.shift2).length
  const halfDay = entries.filter((e) => (e.shift1 ? 1 : 0) + (e.shift2 ? 1 : 0) === 1).length

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Absensi Karyawan</h2>
            <p className="text-sm text-muted-foreground">Input absensi harian — 2 shift per hari</p>
          </div>
          <Button onClick={doSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Simpan
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => guardLocal(() => router.push('/absen/scan'))}>
            <ScanLine className="h-4 w-4" /> Scan QR
          </Button>
          <Button variant="outline" size="sm" onClick={() => guardLocal(() => router.push('/absen/laporan'))}>
            Laporan & Gaji
          </Button>
          <div className="flex items-center gap-2">
            <Label>Tanggal:</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => handleDateChange(e.target.value)}
              className="w-40"
            />
          </div>
        </div>
      </div>

      {entries.length > 0 && (
        <div className="flex gap-6 text-sm">
          <span>Hadir: <strong>{hadir}</strong></span>
          <span>Full day: <strong>{fullDay}</strong></span>
          <span>Setengah hari: <strong>{halfDay}</strong></span>
          <span className="text-muted-foreground">/ {entries.length} karyawan</span>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama</TableHead>
                <TableHead>Jabatan</TableHead>
                <TableHead className="text-center w-24">Shift 1<br/><span className="font-normal text-xs text-muted-foreground">Pagi</span></TableHead>
                <TableHead className="text-center w-24">Shift 2<br/><span className="font-normal text-xs text-muted-foreground">Sore</span></TableHead>
                <TableHead className="text-center w-24">Keterangan</TableHead>
                <TableHead>Catatan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}><div className="h-4 w-3/4 animate-pulse rounded bg-muted" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Belum ada karyawan aktif
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((entry) => {
                  const emp = employees.find((e) => e.id === entry.employee_id)
                  const shifts = (entry.shift1 ? 1 : 0) + (entry.shift2 ? 1 : 0)
                  const label = shifts === 2 ? 'Full' : shifts === 1 ? '½ Hari' : 'Alpha'
                  const labelClass = shifts === 2
                    ? 'text-green-600 font-medium'
                    : shifts === 1
                    ? 'text-yellow-600 font-medium'
                    : 'text-muted-foreground'
                  return (
                    <TableRow key={entry.employee_id}>
                      <TableCell className="font-medium">{entry.employee_name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{emp?.position || '-'}</TableCell>
                      <TableCell className="text-center">
                        <input
                          type="checkbox"
                          checked={entry.shift1}
                          onChange={() => toggle(entry.employee_id, 'shift1')}
                          className="h-5 w-5 cursor-pointer accent-green-600"
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <input
                          type="checkbox"
                          checked={entry.shift2}
                          onChange={() => toggle(entry.employee_id, 'shift2')}
                          className="h-5 w-5 cursor-pointer accent-green-600"
                        />
                      </TableCell>
                      <TableCell className={`text-center text-sm ${labelClass}`}>{label}</TableCell>
                      <TableCell>
                        <Input
                          value={entry.notes}
                          onChange={(e) => {
                            setEntries((prev) =>
                              prev.map((en) => en.employee_id === entry.employee_id ? { ...en, notes: e.target.value } : en)
                            )
                            setIsDirty(true)
                          }}
                          placeholder="Opsional"
                          className="h-8 text-sm"
                        />
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Local dialog for in-page navigation (date / Scan QR / Laporan buttons) */}
      <Dialog open={showLocalDialog} onOpenChange={(open) => { if (!open) handleLocalBatal() }}>
        <DialogContent aria-describedby={undefined} className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Lupa simpan absensi?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Ada perubahan absensi yang belum disimpan.</p>
          <DialogFooter className="flex gap-2 sm:justify-end">
            <Button variant="outline" onClick={handleLocalBatal} disabled={saving}>
              Batal
            </Button>
            <Button onClick={handleLocalSimpan} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
