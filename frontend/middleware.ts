import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // Auth is managed client-side via localStorage
  // Cookie is set on login for server-side checks
  const token = request.cookies.get('auth_token')?.value
  const pathname = request.nextUrl.pathname

  const isAuthPage = pathname.startsWith('/login') || pathname === '/(auth)/login'
  const isPublic = isAuthPage || pathname === '/'

  if (!isPublic && !token) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  if (isAuthPage && token) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:jpg|jpeg|png|gif|svg|ico|webp)).*)'],
}
