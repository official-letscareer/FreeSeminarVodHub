import { NextRequest, NextResponse } from 'next/server';
import {
  SSO_ACCESS_TOKEN_COOKIE,
  SSO_REFRESH_TOKEN_COOKIE,
} from '@/lib/sso';

/**
 * 렛커 SSO 로그인 페이지가 로그인 성공 후 돌려보내는 콜백.
 * 쿼리(`token`, `refreshToken`)에서 토큰을 꺼내 httpOnly 쿠키로 저장하고 `/vod`로 보낸다.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  const refreshToken = request.nextUrl.searchParams.get('refreshToken');

  if (!token) {
    return NextResponse.redirect(
      new URL('/login?error=sso_failed', request.url)
    );
  }

  const response = NextResponse.redirect(new URL('/vod', request.url));

  // 기존 auth_verified 쿠키(src/app/api/auth/verify/route.ts)와 동일한 옵션 —
  // httpOnly로 XSS를 통한 토큰 탈취를 막는다. localStorage에 두면 이 방어가 깨진다.
  response.cookies.set(SSO_ACCESS_TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });

  if (refreshToken) {
    response.cookies.set(SSO_REFRESH_TOKEN_COOKIE, refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  return response;
}
