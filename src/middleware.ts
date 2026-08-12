import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SSO_ACCESS_TOKEN_COOKIE } from '@/lib/sso';

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
    // 이 미들웨어는 "쿠키가 있다/없다"만 보는 1차 게이트다. SSO 토큰의 만료·서명
    // 검증은 여기(Edge Runtime)가 아니라 /api/vod 라우트(Node 런타임)에서 한다 —
    // 확정 사항 5. 두 게이트를 or로 묶어 기존 이름+전화번호 인증 사용자와
    // SSO 로그인 사용자가 당분간 함께 통과한다(확정 사항 2·4).
    const authVerified = request.cookies.get('auth_verified');
    const ssoToken = request.cookies.get(SSO_ACCESS_TOKEN_COOKIE);
    if (!authVerified && !ssoToken) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/vod/:path*', '/admin/vod/:path*'],
};
