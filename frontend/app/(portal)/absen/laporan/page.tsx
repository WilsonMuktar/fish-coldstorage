'use client'

import { useEffect, useState, useCallback } from 'react'
import { employeeAPI } from '@/lib/api'
import { Employee, Attendance } from '@/types/api'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Printer, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, addWeeks, addMonths, subWeeks, subMonths } from 'date-fns'
import { id } from 'date-fns/locale'

const MEAL_ALLOWANCE = 25000

interface DayAttendance {
  shift1: boolean
  shift2: boolean
}

interface EmployeeRow {
  employee: Employee
  days: Record<string, DayAttendance> // key: YYYY-MM-DD
  totalDays: number
  salary: number
  mealAllowance: number
  total: number
}

function fmt(n: number) {
  return new Intl.NumberFormat('id-ID').format(n)
}

function getDateRange(mode: 'weekly' | 'monthly', anchor: Date): { from: Date; to: Date; label: string } {
  if (mode === 'weekly') {
    const from = startOfWeek(anchor, { weekStartsOn: 1 })
    const to = endOfWeek(anchor, { weekStartsOn: 1 })
    return { from, to, label: `Minggu ${format(from, 'd MMM', { locale: id })} – ${format(to, 'd MMM yyyy', { locale: id })}` }
  } else {
    const from = startOfMonth(anchor)
    const to = endOfMonth(anchor)
    return { from, to, label: format(anchor, 'MMMM yyyy', { locale: id }) }
  }
}

export default function LaporanAbsenPage() {
  const [mode, setMode] = useState<'weekly' | 'monthly'>('weekly')
  const [anchor, setAnchor] = useState(new Date())
  const [employees, setEmployees] = useState<Employee[]>([])
  const [rows, setRows] = useState<EmployeeRow[]>([])
  const [loading, setLoading] = useState(false)
  const [dailyRate, setDailyRate] = useState<Record<string, string>>({})

  const { from, to, label } = getDateRange(mode, anchor)
  const days = eachDayOfInterval({ start: from, end: to })

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [empRes, absenRes] = await Promise.all([
        employeeAPI.getAll() as Promise<{ data: Employee[] }>,
        employeeAPI.getAttendanceRange(
          format(from, 'yyyy-MM-dd'),
          format(to, 'yyyy-MM-dd')
        ) as Promise<{ data: Attendance[] }>,
      ])

      const emps = (empRes.data || []).filter((e) => e.is_active)
      setEmployees(emps)

      const attendMap = new Map<string, DayAttendance>()
      ;(absenRes.data || []).forEach((a) => {
        const key = `${a.employee_id}:${a.attend_date.slice(0, 10)}`
        const existing = attendMap.get(key) || { shift1: false, shift2: false }
        if (a.shift === 1) existing.shift1 = a.present
        if (a.shift === 2) existing.shift2 = a.present
        attendMap.set(key, existing)
      })

      const built: EmployeeRow[] = emps.map((emp) => {
        const rate = parseFloat(dailyRate[emp.id] || String(emp.daily_salary || 0))
        const empDays: Record<string, DayAttendance> = {}
        let totalDays = 0
        days.forEach((d) => {
          const dateKey = format(d, 'yyyy-MM-dd')
          const att = attendMap.get(`${emp.id}:${dateKey}`) || { shift1: false, shift2: false }
          empDays[dateKey] = att
          const shifts = (att.shift1 ? 1 : 0) + (att.shift2 ? 1 : 0)
          totalDays += shifts / 2
        })
        const salary = totalDays * rate
        const mealAllowance = Math.floor(totalDays * 2) * MEAL_ALLOWANCE
        return { employee: emp, days: empDays, totalDays, salary, mealAllowance, total: salary + mealAllowance }
      })
      setRows(built)
    } catch {
      toast.error('Gagal memuat data')
    } finally {
      setLoading(false)
    }
  }, [mode, anchor, dailyRate])

  useEffect(() => { loadData() }, [mode, anchor])

  const prev = () => setAnchor((a) => mode === 'weekly' ? subWeeks(a, 1) : subMonths(a, 1))
  const next = () => setAnchor((a) => mode === 'weekly' ? addWeeks(a, 1) : addMonths(a, 1))

  const totalGaji = rows.reduce((s, r) => s + r.salary, 0)
  const totalMakan = rows.reduce((s, r) => s + r.mealAllowance, 0)
  const grandTotal = rows.reduce((s, r) => s + r.total, 0)

  const dayLabels = days.map((d) => ({
    date: format(d, 'yyyy-MM-dd'),
    label: format(d, 'EEE', { locale: id }),
    num: format(d, 'd'),
  }))

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-3">
          <Link href="/absen">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div>
            <h2 className="text-lg font-semibold">Laporan Absensi & Gaji</h2>
            <p className="text-sm text-muted-foreground">{label}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Select value={mode} onValueChange={(v) => setMode(v as 'weekly' | 'monthly')}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="weekly">Mingguan</SelectItem>
              <SelectItem value="monthly">Bulanan</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={prev}>‹</Button>
            <Button variant="outline" size="sm" onClick={() => setAnchor(new Date())}>Hari ini</Button>
            <Button variant="outline" size="sm" onClick={next}>›</Button>
          </div>
          <Button onClick={() => window.print()} variant="outline" className="gap-2">
            <Printer className="h-4 w-4" /> Cetak
          </Button>
          <Button onClick={loadData} disabled={loading} size="sm">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
          </Button>
        </div>
      </div>

      {/* Print header */}
      <div className="hidden print:block text-center mb-4">
        <h1 className="text-xl font-bold">DAFTAR ABSENSI PT. SBA</h1>
        <p className="text-sm">{label}</p>
        <p className="text-xs text-gray-500 mt-1">Uang Makan: Rp {fmt(MEAL_ALLOWANCE)}/shift</p>
      </div>

      {/* Main table */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-muted">
              <th className="border px-2 py-2 text-left whitespace-nowrap">No</th>
              <th className="border px-2 py-2 text-left whitespace-nowrap">Nama</th>
              <th className="border px-2 py-2 text-left whitespace-nowrap print:hidden">Upah/Hari (Rp)</th>
              {dayLabels.map((d) => (
                <th key={d.date} className="border px-1 py-1 text-center min-w-[36px]">
                  <div className="font-medium">{d.num}</div>
                  <div className="text-muted-foreground font-normal">{d.label}</div>
                </th>
              ))}
              <th className="border px-2 py-2 text-center whitespace-nowrap">Hari</th>
              <th className="border px-2 py-2 text-right whitespace-nowrap">Gaji</th>
              <th className="border px-2 py-2 text-right whitespace-nowrap">U.Makan</th>
              <th className="border px-2 py-2 text-right whitespace-nowrap font-bold">Total</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={dayLabels.length + 7} className="text-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={dayLabels.length + 7} className="text-center py-8 text-muted-foreground">
                  Belum ada data
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => (
                <tr key={row.employee.id} className="hover:bg-muted/30">
                  <td className="border px-2 py-1 text-center">{idx + 1}</td>
                  <td className="border px-2 py-1 font-medium whitespace-nowrap">{row.employee.name}</td>
                  <td className="border px-2 py-1 print:hidden">
                    <Input
                      type="number"
                      value={dailyRate[row.employee.id] ?? String(row.employee.daily_salary || 0)}
                      onChange={(e) => setDailyRate((prev) => ({ ...prev, [row.employee.id]: e.target.value }))}
                      onBlur={loadData}
                      className="h-6 w-24 text-xs"
                    />
                  </td>
                  {dayLabels.map((d) => {
                    const att = row.days[d.date] || { shift1: false, shift2: false }
                    const shifts = (att.shift1 ? 1 : 0) + (att.shift2 ? 1 : 0)
                    return (
                      <td key={d.date} className="border px-1 py-1 text-center">
                        {shifts === 2 ? (
                          <span className="text-green-600 font-bold">✓</span>
                        ) : shifts === 1 ? (
                          <span className="text-yellow-500 font-bold">½</span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    )
                  })}
                  <td className="border px-2 py-1 text-center font-medium">
                    {row.totalDays % 1 === 0 ? row.totalDays : row.totalDays.toFixed(1)}
                  </td>
                  <td className="border px-2 py-1 text-right">{fmt(Math.round(row.salary))}</td>
                  <td className="border px-2 py-1 text-right">{fmt(row.mealAllowance)}</td>
                  <td className="border px-2 py-1 text-right font-bold">{fmt(Math.round(row.total))}</td>
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="bg-muted font-bold">
                <td colSpan={3 + dayLabels.length} className="border px-2 py-2 text-right print:col-span-2">
                  Total
                </td>
                <td className="border px-2 py-2 text-center">
                  {rows.reduce((s, r) => s + r.totalDays, 0).toFixed(1)}
                </td>
                <td className="border px-2 py-2 text-right">{fmt(Math.round(totalGaji))}</td>
                <td className="border px-2 py-2 text-right">{fmt(totalMakan)}</td>
                <td className="border px-2 py-2 text-right">{fmt(Math.round(grandTotal))}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Legend */}
      <div className="flex gap-6 text-xs text-muted-foreground print:mt-4">
        <span><span className="text-green-600 font-bold">✓</span> = Full day (2 shift)</span>
        <span><span className="text-yellow-500 font-bold">½</span> = Setengah hari (1 shift)</span>
        <span>— = Alpha</span>
        <span>Uang makan Rp {fmt(MEAL_ALLOWANCE)}/shift hadir</span>
      </div>

      <style>{`
        @media print {
          .print\\:hidden { display: none !important; }
          .print\\:block { display: block !important; }
          body { font-size: 10px; }
          table { page-break-inside: auto; }
          tr { page-break-inside: avoid; }
        }
      `}</style>
    </div>
  )
}
