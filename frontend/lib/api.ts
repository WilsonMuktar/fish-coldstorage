const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8002'
const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL || 'http://localhost:8001'

function clearAuth() {
  if (typeof window === 'undefined') return
  localStorage.removeItem('auth_token')
  localStorage.removeItem('auth_user')
  localStorage.removeItem('refresh_token')
  // Clear cookie so middleware stops redirecting back to dashboard
  document.cookie = 'auth_token=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT'
}

let refreshPromise: Promise<string> | null = null

async function tryRefresh(): Promise<string | null> {
  const refreshToken = localStorage.getItem('refresh_token')
  if (!refreshToken) return null

  // Deduplicate concurrent refresh calls
  if (!refreshPromise) {
    refreshPromise = fetch(`${AUTH_URL}/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error('refresh failed')
        const data = await r.json()
        const newToken: string = data.access_token
        localStorage.setItem('auth_token', newToken)
        document.cookie = `auth_token=${newToken}; path=/; max-age=86400`
        return newToken
      })
      .catch(() => {
        clearAuth()
        return null as unknown as string
      })
      .finally(() => { refreshPromise = null })
  }

  return refreshPromise
}

export async function request<T>(path: string, options: RequestInit = {}, noAuth = false, baseUrl = BASE_URL): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  }

  if (!noAuth && typeof window !== 'undefined') {
    const token = localStorage.getItem('auth_token')
    if (token) headers['Authorization'] = `Bearer ${token}`
  }

  let res = await fetch(`${baseUrl}${path}`, { ...options, headers })

  // Try token refresh once on 401
  if (res.status === 401 && !noAuth && typeof window !== 'undefined') {
    const newToken = await tryRefresh()
    if (newToken) {
      const retryHeaders = { ...headers, Authorization: `Bearer ${newToken}` }
      res = await fetch(`${baseUrl}${path}`, { ...options, headers: retryHeaders })
    }
  }

  if (res.status === 401) {
    if (typeof window !== 'undefined') {
      clearAuth()
      window.location.href = '/login'
    }
    throw new Error('Unauthorized')
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || 'Request failed')
  }
  if (res.status === 204) return {} as T
  return res.json()
}

// Auth — routed to auth-service (:8001)
export const authAPI = {
  login: (phone: string, password: string) =>
    request<{ access_token: string; refresh_token: string; user: Record<string, unknown> }>(
      '/v1/auth/login',
      { method: 'POST', body: JSON.stringify({ phone, password }) },
      true,
      AUTH_URL
    ),
  refresh: (refresh_token: string) =>
    request<{ access_token: string }>('/v1/auth/refresh', { method: 'POST', body: JSON.stringify({ refresh_token }) }, true, AUTH_URL),
  logout: (refresh_token: string) =>
    request<void>('/v1/auth/logout', { method: 'POST', body: JSON.stringify({ refresh_token }) }, true, AUTH_URL),
}

// Dashboard
export const dashboardAPI = {
  getStats: () => request<unknown>('/v1/dashboard'),
}

// Fish
export const fishAPI = {
  getTypes: () => request<{ data: unknown[] }>('/v1/fish/types'),
  createType: (data: unknown) =>
    request<unknown>('/v1/fish/types', { method: 'POST', body: JSON.stringify(data) }),
  getSortedTypes: () =>
    request<{ data: unknown[] }>('/v1/fish/types'),
  updateType: (id: string, data: unknown) =>
    request<unknown>(`/v1/fish/types/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteType: (id: string) =>
    request<unknown>(`/v1/fish/types/${id}`, { method: 'DELETE' }),
  updateCanonical: (id: string, canonicalFishTypeId: string | null) =>
    request<unknown>(`/v1/fish/types/${id}/canonical`, {
      method: 'PUT',
      body: JSON.stringify({ canonical_fish_type_id: canonicalFishTypeId ?? '' }),
    }),
  uploadPhoto: async (id: string, file: File): Promise<unknown> => {
    const form = new FormData()
    form.append('photo', file)
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null
    const res = await fetch(`${BASE_URL}/v1/fish/types/${id}/photo`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(err.error || 'Upload failed')
    }
    return res.json()
  },
  getStock: () => request<{ data: unknown[] }>('/v1/fish/stock'),
  getTransactions: (params?: string) =>
    request<{ data: unknown[]; total: number }>(`/v1/fish/transactions${params ? '?' + params : ''}`),
  createTransaction: (data: unknown) =>
    request<unknown>('/v1/fish/transactions', { method: 'POST', body: JSON.stringify(data) }),
  getVessels: () => request<{ data: unknown[] }>('/v1/vessels'),
  createVessel: (data: unknown) =>
    request<unknown>('/v1/vessels', { method: 'POST', body: JSON.stringify(data) }),
  updateVessel: (id: string, data: unknown) =>
    request<unknown>(`/v1/vessels/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  uploadVesselPhoto: async (id: string, file: File): Promise<{ photo_url: string; photo_path: string }> => {
    const form = new FormData()
    form.append('photo', file)
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null
    const res = await fetch(`${BASE_URL}/v1/vessels/${id}/photo`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(err.error || 'Upload failed')
    }
    return res.json()
  },
  getTimbangan: (params?: string) =>
    request<{ data: unknown[] }>(`/v1/perkapal${params ? '?' + params : ''}`),
  createTimbangan: (data: unknown) =>
    request<unknown>('/v1/perkapal', { method: 'POST', body: JSON.stringify(data) }),
  approveTimbangan: (id: string) =>
    request<unknown>(`/v1/perkapal/${id}/approve`, { method: 'POST', body: JSON.stringify({}) }),
}

// Items
export const itemAPI = {
  getCategories: () => request<{ data: unknown[] }>('/v1/item-categories'),
  getItems: (params?: string) =>
    request<{ data: unknown[] }>(`/v1/items${params ? '?' + params : ''}`),
  createItem: (data: unknown) =>
    request<unknown>('/v1/items', { method: 'POST', body: JSON.stringify(data) }),
  updateItem: (id: string, data: unknown) =>
    request<unknown>(`/v1/items/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteItem: (id: string) =>
    request<unknown>(`/v1/items/${id}`, { method: 'DELETE' }),
  getStock: () => request<{ data: unknown[] }>('/v1/items/stock'),
  getTransactions: (params?: string) =>
    request<{ data: unknown[] }>(`/v1/items/transactions${params ? '?' + params : ''}`),
  createTransaction: (data: unknown) =>
    request<unknown>('/v1/items/transactions', { method: 'POST', body: JSON.stringify(data) }),
}

// Titipan
export const titipanAPI = {
  getAll: (params?: string) =>
    request<{ data: unknown[] }>(`/v1/titipan${params ? '?' + params : ''}`),
  getOne: (id: string) => request<unknown>(`/v1/titipan/${id}`),
  create: (data: unknown) =>
    request<unknown>('/v1/titipan', { method: 'POST', body: JSON.stringify(data) }),
  withdraw: (id: string, data: unknown) =>
    request<unknown>(`/v1/titipan/${id}/withdraw`, { method: 'POST', body: JSON.stringify(data) }),
  getTransactions: (id: string) =>
    request<{ data: unknown[] }>(`/v1/titipan/${id}/transactions`),
}

// Employees / Karyawan
export const employeeAPI = {
  getAll: (params?: string) =>
    request<{ data: unknown[] }>(`/v1/karyawan${params ? '?' + params : ''}`),
  create: (data: unknown) =>
    request<unknown>('/v1/karyawan', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: unknown) =>
    request<unknown>(`/v1/karyawan/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  getAttendance: (date?: string) =>
    request<{ data: unknown[] }>(`/v1/absen${date ? '?date=' + date : ''}`),
  getAttendanceRange: (from: string, to: string) =>
    request<{ data: unknown[] }>(`/v1/absen?from=${from}&to=${to}`),
  bulkAttendance: (data: unknown) =>
    request<unknown>('/v1/absen', { method: 'POST', body: JSON.stringify(data) }),
  scanAttendance: (code: number, date?: string) =>
    request<{ employee_id: string; employee_name: string; code: number; shift: number; date: string }>(
      '/v1/absen/scan', { method: 'POST', body: JSON.stringify({ code, date }) }
    ),
}

// Invoices
export const invoiceAPI = {
  getAll: (params?: string) =>
    request<{ data: unknown[] }>(`/v1/invoice${params ? '?' + params : ''}`),
  getOne: (id: string) => request<unknown>(`/v1/invoice/${id}`),
  create: (data: unknown) =>
    request<unknown>('/v1/invoice', { method: 'POST', body: JSON.stringify(data) }),
  issue: (id: string) =>
    request<unknown>(`/v1/invoice/${id}/issue`, { method: 'POST', body: JSON.stringify({}) }),
  recordPayment: (id: string, data: unknown) =>
    request<unknown>(`/v1/invoice/${id}/pay`, { method: 'POST', body: JSON.stringify(data) }),
  getSchedules: (invoiceId: string) =>
    request<{ data: unknown[] }>(`/v1/invoice/${invoiceId}/schedules`),
  createSchedule: (invoiceId: string, data: unknown) =>
    request<unknown>(`/v1/invoice/${invoiceId}/schedules`, { method: 'POST', body: JSON.stringify(data) }),
  getAllSchedules: (params?: string) =>
    request<{ data: unknown[] }>(`/v1/cicilan${params ? '?' + params : ''}`),
  paySchedule: (scheduleId: string, data: unknown) =>
    request<unknown>(`/v1/cicilan/${scheduleId}/pay`, { method: 'POST', body: JSON.stringify(data) }),
}

// Lending / Pinjaman
export const lendingAPI = {
  getAll: (params?: string) =>
    request<{ data: unknown[] }>(`/v1/pinjaman${params ? '?' + params : ''}`),
  create: (data: unknown) =>
    request<unknown>('/v1/pinjaman', { method: 'POST', body: JSON.stringify(data) }),
  recordPayment: (id: string, data: unknown) =>
    request<unknown>(`/v1/pinjaman/${id}/bayar`, { method: 'POST', body: JSON.stringify(data) }),
}

// Sorting operations
export const sortingAPI = {
  getAll: (params?: string) =>
    request<{ data: unknown[]; total: number }>(`/v1/sorting${params ? '?' + params : ''}`),
  getByFishType: (fishTypeId: string) =>
    request<{ data: unknown[]; total: number }>(`/v1/sorting?fish_type_id=${fishTypeId}`),
  create: (data: unknown) =>
    request<unknown>('/v1/sorting', { method: 'POST', body: JSON.stringify(data) }),
}

// Reviews
export const reviewAPI = {
  getByToken: (token: string) => request<unknown>(`/v1/reviews/${token}`, {}, true),
  getAll: (params?: string) =>
    request<{ data: unknown[] }>(`/v1/reviews${params ? '?' + params : ''}`),
  getPending: () =>
    request<{ data: unknown[] }>('/v1/reviews?status=pending'),
  approveByToken: (token: string, data?: unknown) =>
    request<unknown>(`/v1/reviews/${token}/approve`, { method: 'POST', body: JSON.stringify(data || {}) }, true),
  rejectByToken: (token: string, reason: string) =>
    request<unknown>(`/v1/reviews/${token}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }, true),
}

// Reports
export const reportAPI = {
  getDashboard: () => request<unknown>('/v1/dashboard'),
  getTransactions: (params?: string) =>
    request<unknown>(`/v1/fish/transactions${params ? '?' + params : ''}`),
  getTimbangan: (params?: string) =>
    request<unknown>(`/v1/perkapal${params ? '?' + params : ''}`),
  getProfitLoss: (period: string) =>
    request<unknown>(`/v1/profit?period=${period}`),
}

// Beli Ikan
export const beliIkanAPI = {
  getAll: (params?: string) =>
    request<{ data: unknown[] }>(`/v1/beli-ikan${params ? '?' + params : ''}`),
  create: (data: unknown) =>
    request<unknown>('/v1/beli-ikan', { method: 'POST', body: JSON.stringify(data) }),
}

// OCR extract (portal photo → structured data)
export const ocrAPI = {
  extract: async (file: File, receiptType?: string): Promise<unknown> => {
    const form = new FormData()
    form.append('photo', file)
    if (receiptType) form.append('receipt_hint', receiptType)
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null
    const res = await fetch(`${BASE_URL}/v1/ocr-extract`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(err.error || 'OCR failed')
    }
    return res.json()
  },
}

// Portal receipt submit — creates a pending receipt in the review queue
export const portalSubmitAPI = {
  submit: async (
    receiptType: string,
    intentData: unknown,
    imageFile?: File | null,
  ): Promise<{ receipt_id: string; review_url: string; review_token: string }> => {
    let imageData = ''
    let imageFilename = ''
    if (imageFile) {
      const buf = await imageFile.arrayBuffer()
      const bytes = new Uint8Array(buf)
      let binary = ''
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
      imageData = btoa(binary)
      imageFilename = imageFile.name
    }
    return request<{ receipt_id: string; review_url: string; review_token: string }>(
      '/v1/reviews/submit',
      {
        method: 'POST',
        body: JSON.stringify({
          receipt_type: receiptType,
          submitted_via: 'portal',
          image_data: imageData,
          image_filename: imageFilename,
          intent_data: intentData,
        }),
      },
    )
  },
}

// Expenses (beli_item, bayar_jasa, dll)
export const expenseAPI = {
  getAll: (params?: string) =>
    request<{ data: unknown[] }>(`/v1/expenses${params ? '?' + params : ''}`),
  create: (data: unknown) =>
    request<unknown>('/v1/expenses', { method: 'POST', body: JSON.stringify(data) }),
  uploadPhoto: async (id: string, file: File): Promise<{ photo_path: string }> => {
    const form = new FormData()
    form.append('photo', file)
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null
    const res = await fetch(`${BASE_URL}/v1/expenses/${id}/photo`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(err.error || 'Upload failed')
    }
    return res.json()
  },
}
