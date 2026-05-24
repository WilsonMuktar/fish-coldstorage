'use client'

import { useEffect, useState } from 'react'
import { employeeAPI } from '@/lib/api'
import { Employee, Attendance } from '@/types/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/shared/status-badge'
import { Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'

interface AttendanceEntry {
  employee_id: string
  employee_name: string
  status: string
  notes: string
}

export default function AbsenPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [entries, setEntries] = useState<AttendanceEntry[]>([])
  const [existingAttendance, setExistingAttendance] = useState<Attendance[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const loadEmployees = async () => {
    try {
      const res = await employeeAPI.getAll('status=active') as { data: Employee[] }
      const activeEmployees = res.data || []
      setEmployees(activeEmployees)
      initEntries(activeEmployees, [])
    } catch {
      toast.error('Gagal memuat karyawan')
    } finally {
      setLoading(false)
    }
  }

  const loadAttendance = async (selectedDate: string) => {
    try {
      const res = await employeeAPI.getAttendance(`date=${selectedDate}`) as { data: Attendance[] }
      const attendance = res.data || []
      setExistingAttendance(attendance)
      initEntries(employees, attendance)
    } catch {
      // Ignore error, might just be no data
      setExistingAttendance([])
      initEntries(employees, [])
    }
  }

  const initEntries = (emps: Employee[], attendance: Attendance[]) => {
    const map = new Map(attendance.map((a) => [a.employee_id, a]))
    setEntries(
      emps.map((emp) => ({
        employee_id: emp.id,
        employee_name: emp.name,
        status: map.get(emp.id)?.status || 'hadir',
        notes: map.get(emp.id)?.notes || '',
      }))
    )
  }

  useEffect(() => { loadEmployees() }, [])
  useEffect(() => { if (employees.length > 0) loadAttendance(date) }, [date, employees.length])

  const updateEntry = (empId: string, field: keyof AttendanceEntry, value: string) => {
    setEntries((prev) =>
      prev.map((e) => (e.employee_id === empId ? { ...e, [field]: value } : e))
    )
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await employeeAPI.bulkAttendance({
        date,
        records: entries.map((e) => ({
          employee_id: e.employee_id,
          status: e.status,
          notes: e.notes,
        })),
      })
      toast.success('Absensi berhasil disimpan')
      loadAttendance(date)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan absensi')
    } finally {
      setSaving(false)
    }
  }

  const statusCounts = entries.reduce(
    (acc, e) => { acc[e.status] = (acc[e.status] || 0) + 1; return acc },
    {} as Record<string, number>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Absensi Karyawan</h2>
          <p className="text-sm text-muted-foreground">Input absensi harian</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Label>Tanggal:</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-40"
            />
          </div>
          <Button onClick={handleSave} disabled={saving || (statusCounts['hadir'] || 0) === 0} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Simpan Absensi
          </Button>
        </div>
      </div>

      {/* Summary */}
      {entries.length > 0 && (
        <div className="flex gap-4">
          {['hadir', 'izin', 'sakit', 'alpha'].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <StatusBadge status={s} />
              <span className="text-sm font-medium">{statusCounts[s] || 0}</span>
            </div>
          ))}
          <span className="text-sm text-muted-foreground">/ {entries.length} karyawan</span>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama Karyawan</TableHead>
                <TableHead>Jabatan</TableHead>
                <TableHead>Status Kehadiran</TableHead>
                <TableHead>Catatan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 4 }).map((_, j) => (
                      <TableCell key={j}><div className="h-4 w-3/4 animate-pulse rounded bg-muted" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    Belum ada karyawan aktif
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((entry) => {
                  const emp = employees.find((e) => e.id === entry.employee_id)
                  return (
                    <TableRow key={entry.employee_id}>
                      <TableCell className="font-medium">{entry.employee_name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{emp?.position || '-'}</TableCell>
                      <TableCell>
                        <Select
                          value={entry.status}
                          onValueChange={(v) => updateEntry(entry.employee_id, 'status', v)}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="hadir">Hadir</SelectItem>
                            <SelectItem value="izin">Izin</SelectItem>
                            <SelectItem value="sakit">Sakit</SelectItem>
                            <SelectItem value="alpha">Alpha</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          value={entry.notes}
                          onChange={(e) => updateEntry(entry.employee_id, 'notes', e.target.value)}
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
