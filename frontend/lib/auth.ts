export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('auth_token')
}

export function setToken(token: string): void {
  localStorage.setItem('auth_token', token)
  // Also set cookie for middleware
  document.cookie = `auth_token=${token}; path=/; max-age=86400`
}

export function removeToken(): void {
  localStorage.removeItem('auth_token')
  localStorage.removeItem('auth_user')
  document.cookie = 'auth_token=; path=/; max-age=0'
}

export function getUser(): Record<string, unknown> | null {
  if (typeof window === 'undefined') return null
  const s = localStorage.getItem('auth_user')
  return s ? JSON.parse(s) : null
}

export function setUser(user: Record<string, unknown>): void {
  localStorage.setItem('auth_user', JSON.stringify(user))
}

export function isAuthenticated(): boolean {
  return !!getToken()
}
