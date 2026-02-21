import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/admin/vod')) {
    const adminVerified = request.cookies.get('admin_verified');
    if (!adminVerified) {
      return NextResponse.redirect(new URL('/admin', request.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith('/vod')) {
    const authVerified = request.cookies.get('auth_verified');
    if (!authVerified) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/vod/:path*', '/admin/vod/:path*'],
};
