'use client'

import { useEffect, useState } from 'react'
import { employeeAPI } from '@/lib/api'
import { Employee, Attendance } from '@/types/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Loader2, Save, ScanLine } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'

interface ShiftEntry {
  employee_id: string
  employee_name: string
  shift1: boolean
  shift2: boolean
  notes: string
}

export default function AbsenPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [entries, setEntries] = useState<ShiftEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

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
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const records = entries.flatMap((e) => [
        { employee_id: e.employee_id, attend_date: date, shift: 1, present: e.shift1, notes: e.notes },
        { employee_id: e.employee_id, attend_date: date, shift: 2, present: e.shift2, notes: e.notes },
      ])
      await employeeAPI.bulkAttendance(records)
      toast.success('Absensi berhasil disimpan')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan absensi')
    } finally {
      setSaving(false)
    }
  }

  const hadir = entries.filter((e) => e.shift1 || e.shift2).length
  const fullDay = entries.filter((e) => e.shift1 && e.shift2).length
  const halfDay = entries.filter((e) => (e.shift1 ? 1 : 0) + (e.shift2 ? 1 : 0) === 1).length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Absensi Karyawan</h2>
          <p className="text-sm text-muted-foreground">Input absensi harian — 2 shift per hari</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/absen/scan">
            <Button variant="outline" size="sm" className="gap-2">
              <ScanLine className="h-4 w-4" /> Scan QR
            </Button>
          </Link>
          <Link href="/absen/laporan">
            <Button variant="outline" size="sm">Laporan & Gaji</Button>
          </Link>
          <div className="flex items-center gap-2">
            <Label>Tanggal:</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-40"
            />
          </div>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Simpan
          </Button>
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
                          onChange={(e) => setEntries((prev) =>
                            prev.map((en) => en.employee_id === entry.employee_id ? { ...en, notes: e.target.value } : en)
                          )}
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
    </div>
  )
}
