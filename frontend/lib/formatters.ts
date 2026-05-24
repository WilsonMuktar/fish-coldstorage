import { format } from 'date-fns'
import { id } from 'date-fns/locale'

export function formatIDR(amount: number): string {
  const abs = Math.abs(amount)
  const formatted = abs.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (amount < 0 ? '- ' : '') + 'Rp ' + formatted
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return '-'
  try {
    return format(new Date(dateStr), 'd MMM yyyy', { locale: id })
  } catch {
    return dateStr
  }
}

export function formatDateTime(dateStr: string): string {
  if (!dateStr) return '-'
  try {
    return format(new Date(dateStr), 'd MMM yyyy HH:mm', { locale: id })
  } catch {
    return dateStr
  }
}

export function formatKg(kg: number): string {
  return kg.toLocaleString('id-ID') + ' kg'
}

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'baru saja'
  if (mins < 60) return `${mins} menit lalu`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} jam lalu`
  return `${Math.floor(hours / 24)} hari lalu`
}
