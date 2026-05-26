export interface FishType {
  id: string
  code: string
  name: string
  description?: string
  aliases?: string
  canonical_fish_type_id?: string
  created_at: string
}

export interface FishStock {
  fish_type_id: string
  fish_code: string
  fish_name: string
  /** "BDR / BH" when this row groups aliases, empty otherwise */
  all_codes?: string
  total_quantity: number
  sorted_kg: number
  sold_kg: number
  updated_at: string | null
}

export interface FishTransaction {
  id: string
  fish_type_id: string
  fish_code: string
  transaction_type: 'buy' | 'sell' | 'adjust'
  quantity: number
  price_per_kg: number
  total_amount: number
  person_id?: string
  person_name: string
  vessel_id?: string
  vessel_name: string
  receipt_id?: string
  review_token?: string
  receipt_image_path?: string
  storage_location_id?: string
  notes: string
  transaction_date: string
  created_at: string
}

export interface Vessel {
  id: string
  name: string
  registration_no?: string
  registration_number?: string
  captain_name?: string
  owner_name?: string
  photo_path?: string
  photo_url?: string
  is_active?: boolean
  status?: string
  created_at: string
}

export interface TimbanganRecord {
  id: string
  receipt_id?: string
  review_token?: string
  vessel_id?: string
  vessel_name: string
  transport_number?: string
  transports?: string
  weigh_date: string
  timbang_date?: string
  fish_columns: TimbanganFishColumn[] | string
  total_kg?: number
  total_weight_kg?: number
  status?: 'pending' | 'approved'
  created_by?: string
  created_at: string
}

export interface TimbanganFishColumn {
  fish_type_id: string
  fish_type_code: string
  fish_type_name: string
  quantity_kg: number
}

export interface Item {
  id: string
  category_id: string
  category_name: string
  code: string
  name: string
  unit: string
  reorder_point: number
  created_at: string
}

export interface ItemStock {
  id: string
  item_id: string
  item_code: string
  item_name: string
  category_name: string
  unit: string
  quantity: number
  updated_at: string | null
}

export interface ItemTransaction {
  id: string
  transaction_type: string
  item_id: string
  item_code?: string
  item_name: string
  quantity: number
  unit_price?: number
  total_amount?: number
  counterparty_name?: string
  person_name?: string
  receipt_id?: string
  review_token?: string
  notes?: string
  created_by?: string
  transaction_date?: string
  created_at: string
}

export interface TitipanRecord {
  id: string
  owner_name: string
  owner_phone?: string
  fish_type_id: string
  fish_type_code: string
  fish_type_name: string
  quantity_kg: number
  balance_kg: number
  status: 'active' | 'closed'
  notes?: string
  created_at: string
  transactions: TitipanTransaction[]
}

export interface TitipanTransaction {
  id: string
  titipan_id: string
  transaction_type: 'deposit' | 'withdrawal'
  quantity_kg: number
  notes?: string
  created_by: string
  created_at: string
}

export interface Employee {
  id: string
  code: number
  name: string
  phone?: string
  position: string
  daily_salary: number
  is_active: boolean
  hired_at?: string
  created_at: string
  photo_path?: string
  photo_url?: string
}

export interface Attendance {
  id: string
  employee_id: string
  employee_name: string
  attend_date: string
  shift: 1 | 2
  present: boolean
  notes?: string
  created_at: string
}

export interface AttendanceSummary {
  employee_id: string
  employee_name: string
  period: string
  hadir: number
  izin: number
  sakit: number
  alpha: number
  total_days: number
}

export interface Invoice {
  id: string
  invoice_number: string
  invoice_type: 'customer' | 'supplier'
  counterparty_id?: string
  counterparty_name: string
  issue_date: string
  due_date: string
  status: 'draft' | 'issued' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled'
  subtotal: number
  tax_amount: number
  total_amount: number
  paid_amount: number
  outstanding_amount: number
  items: InvoiceItem[]
  created_by: string
  created_at: string
}

export interface InvoiceItem {
  id: string
  description: string
  quantity: number
  unit_price: number
  total: number
}

export interface InstallmentSchedule {
  id: string
  invoice_id: string
  invoice_no: string
  person_name: string
  invoice_type: 'ar' | 'ap'
  due_date: string
  amount_due: number
  amount_paid: number
  status: 'pending' | 'partial' | 'paid' | 'overdue'
  notes?: string
  created_at: string
}

export interface InstallmentPayment {
  id: string
  schedule_id: string
  payment_date: string
  amount: number
  notes?: string
  created_by: string
  created_at: string
}

export interface LendingRecord {
  id: string
  counterparty_id?: string
  counterparty_name: string
  transaction_type: 'lend_out' | 'receive_back' | 'borrow' | 'pay_back'
  amount: number
  date: string
  notes?: string
  balance?: number
  created_by: string
  created_at: string
}

export interface Receipt {
  id: string
  receipt_type: 'bon_penjualan' | 'bon_pengeluaran' | 'timbangan_ikan_basah' | 'invoice'
  image_path: string
  status: 'pending' | 'reviewing' | 'approved' | 'rejected'
  submitted_via: string
  submitted_at: string
  extracted_data: ExtractedData | null
  review_token: string
  rejection_reason?: string
  reviewed_at?: string
}

export interface ExtractedData {
  confidence?: number
  receipt?: {
    receipt_number?: string
    date?: string
    vendor?: string
    customer?: string
    items?: ReceiptItem[]
    subtotal?: number
    tax?: number
    total?: number
    notes?: string
    confidences?: Record<string, number>
  }
  timbangan?: {
    date?: string
    vessel_name?: string
    transport_number?: string
    fish_columns?: TimbanganFishColumn[]
    total_kg?: number
    notes?: string
    confidences?: Record<string, number>
  }
  sortir?: {
    date?: string
    vessel_name?: string
  }
  invoice?: {
    invoice_number?: string
    date?: string
    due_date?: string
    customer?: string
    items?: InvoiceItem[]
    subtotal?: number
    tax?: number
    total?: number
    confidences?: Record<string, number>
  }
}

export interface ReceiptItem {
  name: string
  fish_code?: string
  item_name?: string
  quantity: number
  unit?: string
  unit_price: number
  total: number
}

export interface DashboardData {
  total_fish_stock_kg: number
  raw_fish_stock_kg: number
  sorted_fish_stock_kg: number
  pending_reviews: number
  total_ar: number
  total_ap: number
  fish_stock_summary: FishStock[]
  recent_transactions: FishTransaction[]
}

export interface ProfitLossStats {
  period: string
  revenue: number
  cogs: number
  gross_profit: number
  gross_margin_pct: number
  opex: number
  net_profit: number
  sold_kg: number
  bought_kg: number
  unpaid_timbangan_kg: number
}

export interface Expense {
  id: string
  date: string
  category: string
  description: string
  amount: number
  notes: string
  photo_path?: string
  receipt_id?: string
  review_token?: string
  created_at: string
}

export interface BeliIkanItem {
  id?: string
  fish_code: string
  fish_type_id?: string
  quantity_kg: number
  price_per_kg: number
  total_amount: number
}

export interface TimbanganFishSummary {
  fish_code: string
  timbangan_kg: number
}

export interface BeliIkanRecord {
  id: string
  receipt_id?: string
  vessel_id?: string
  vessel_name: string
  buy_date: string
  notes?: string
  total_amount: number
  items: BeliIkanItem[]
  timbangan_ids?: string[]
  timbangan_items?: TimbanganFishSummary[]
  created_at: string
}
