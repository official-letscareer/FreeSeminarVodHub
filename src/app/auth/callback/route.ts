import { NextRequest, NextResponse } from 'next/server';
import { extractSsoTokens, setSsoTokenCookies } from '@/lib/sso';
import {
  clearNamePhoneLoginCookies,
  clearSsoLoginCookies,
} from '@/lib/loginCookies';

/**
 * 전체 페이지 이동 방식의 SSO 콜백.
 *
 * 팝업이 차단됐거나 모바일이라 팝업을 쓰지 않는 경우에 이 경로로 돌아온다.
 * 팝업으로 로그인한 경우는 `/auth/callback/popup` 이 처리한다 — 그쪽은 창을 닫아야 하므로
 * 리다이렉트가 아니라 HTML 을 반환한다.
 */
export async function GET(request: NextRequest) {
  const tokens = extractSsoTokens(request.nextUrl.searchParams);

  if (!tokens) {
    return NextResponse.redirect(
      new URL('/login?error=sso_failed', request.url),
    );
  }

  const response = NextResponse.redirect(new URL('/vod', request.url));
  // 예전 로그인 쿠키를 먼저 지운다. auth_verified 가 남으면 접근 판정이 새 SSO 토큰보다 그것을
  // 먼저 통과시켜 이전 계정으로 보이고, refreshToken 이 없는 응답이면 이전 계정의 것이 남는다.
  clearNamePhoneLoginCookies(response);
  clearSsoLoginCookies(response);
  setSsoTokenCookies(response, tokens);
  return response;
}
