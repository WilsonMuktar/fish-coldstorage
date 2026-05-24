import { formatIDR } from '@/lib/formatters'

export function CurrencyDisplay({ amount }: { amount: number }) {
  return <span className="font-mono">{formatIDR(amount)}</span>
}
