import { NextRequest, NextResponse } from 'next/server';
import { getEnabledVodList } from '@/lib/kv';
import { SSO_ACCESS_TOKEN_COOKIE, getSsoUserProfile } from '@/lib/sso';

function unauthorized(clearSsoCookie: boolean): NextResponse {
  const response = NextResponse.json(
    { message: '인증이 필요합니다.' },
    { status: 401 }
  );
  if (clearSsoCookie) {
    // 만료·위조된 SSO 토큰을 들고 있어도 이후 요청마다 렛커 서버에 다시 물어보지
    // 않도록, 무효로 확인된 시점에 쿠키를 지운다.
    response.cookies.set(SSO_ACCESS_TOKEN_COOKIE, '', { maxAge: 0, path: '/' });
  }
  return response;
}

/**
 * SSO 토큰의 만료·서명 검증 지점(확정 사항 5). Edge 미들웨어가 아니라 여기(Node
 * 런타임 API 라우트)에서 하는 이유는 PRD 섹션 4.3 참조 — jose 같은 Edge 호환
 * 검증 라이브러리를 새로 들일 필요 없이, 렛커 서버에 그대로 물어보면 된다.
 */
export async function GET(request: NextRequest) {
  if (request.cookies.get('auth_verified')?.value === '1') {
    const list = await getEnabledVodList();
    return NextResponse.json(list);
  }

  const ssoToken = request.cookies.get(SSO_ACCESS_TOKEN_COOKIE)?.value;
  if (!ssoToken) {
    return unauthorized(false);
  }

  const profile = await getSsoUserProfile(ssoToken);
  if (!profile) {
    return unauthorized(true);
  }

  const list = await getEnabledVodList();
  return NextResponse.json(list);
}
