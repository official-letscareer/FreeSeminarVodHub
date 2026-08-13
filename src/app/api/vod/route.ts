import { NextRequest, NextResponse } from 'next/server';
import { getEnabledVodList } from '@/lib/kv';
import { SSO_ACCESS_TOKEN_COOKIE } from '@/lib/sso';
import { checkVodAccess } from '@/lib/vodAccess';

function unauthorized(clearSsoCookie: boolean): NextResponse {
  const response = NextResponse.json(
    { message: '인증이 필요합니다.' },
    { status: 401 },
  );
  if (clearSsoCookie) {
    // 만료·위조된 SSO 토큰을 들고 있어도 이후 요청마다 렛커 서버에 다시 물어보지
    // 않도록, 무효로 확인된 시점에 쿠키를 지운다. 자격 미달(ineligible)은 토큰
    // 자체는 멀쩡하므로 쿠키를 지우지 않는다 — 재로그인을 강요할 이유가 없다.
    response.cookies.set(SSO_ACCESS_TOKEN_COOKIE, '', { maxAge: 0, path: '/' });
  }
  return response;
}

/**
 * SSO 토큰의 만료·서명 검증 + 챌린지 참여자/옵션 필터(LC-3208) 판정 지점. Edge
 * 미들웨어가 아니라 여기(Node 런타임 API 라우트)에서 하는 이유는 PRD 섹션 4.3 참조 —
 * jose 같은 Edge 호환 검증 라이브러리를 새로 들일 필요 없이, 렛커 서버에 그대로
 * 물어보면 된다. 실제 판정은 lib/vodAccess.ts 로 뽑아 /api/vod/[id] 와 공유한다.
 */
export async function GET(request: NextRequest) {
  const access = await checkVodAccess(request);
  if (!access.authorized) {
    return unauthorized(access.reason === 'invalid-token');
  }

  const list = await getEnabledVodList();
  return NextResponse.json(list);
}
