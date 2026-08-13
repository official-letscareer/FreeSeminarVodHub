import { NextRequest, NextResponse } from 'next/server';
import {
  SSO_ACCESS_TOKEN_COOKIE,
  SSO_REFRESH_TOKEN_COOKIE,
} from '@/lib/sso';

/**
 * 렛커 SSO 로그인 페이지가 로그인 성공 후 돌려보내는 콜백. 두 형태를 모두 받는다:
 * - `?token=&refreshToken=` — 이메일/비밀번호 SSO(SsoAuthController, server Push 2)
 * - `?result={"accessToken":...,"refreshToken":...}` — 카카오/네이버 소셜 로그인
 *   (OAuth2AuthenticationSuccessHandler). 이 형식은 내부 web/admin/mentor 이 이미 쓰던
 *   기존 포맷 그대로라, 소셜 로그인 쪽 서버 코드는 건드리지 않고 여기서 흡수한다.
 */
function extractTokens(
  searchParams: URLSearchParams
): { accessToken: string; refreshToken: string | null } | null {
  const token = searchParams.get('token');
  if (token) {
    return { accessToken: token, refreshToken: searchParams.get('refreshToken') };
  }

  const result = searchParams.get('result');
  if (result) {
    try {
      const parsed = JSON.parse(result) as {
        accessToken?: string;
        refreshToken?: string;
      };
      if (typeof parsed.accessToken === 'string') {
        return {
          accessToken: parsed.accessToken,
          refreshToken: parsed.refreshToken ?? null,
        };
      }
    } catch {
      return null;
    }
  }

  return null;
}

export async function GET(request: NextRequest) {
  const tokens = extractTokens(request.nextUrl.searchParams);

  if (!tokens) {
    return NextResponse.redirect(
      new URL('/login?error=sso_failed', request.url)
    );
  }

  const response = NextResponse.redirect(new URL('/vod', request.url));

  // 기존 auth_verified 쿠키(src/app/api/auth/verify/route.ts)와 동일한 옵션 —
  // httpOnly로 XSS를 통한 토큰 탈취를 막는다. localStorage에 두면 이 방어가 깨진다.
  response.cookies.set(SSO_ACCESS_TOKEN_COOKIE, tokens.accessToken, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });

  if (tokens.refreshToken) {
    response.cookies.set(SSO_REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  return response;
}
