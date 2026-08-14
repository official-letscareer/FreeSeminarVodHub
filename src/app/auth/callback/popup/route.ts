import { NextRequest, NextResponse } from 'next/server';
import {
  SSO_POPUP_MESSAGE_TYPE,
  extractSsoTokens,
  setSsoTokenCookies,
} from '@/lib/sso';

/**
 * 팝업 창으로 로그인했을 때의 SSO 콜백.
 *
 * 전체 이동 콜백(`/auth/callback`)과 토큰 추출·쿠키 설정은 같고 **마지막 응답만 다르다**.
 * 그쪽은 `/vod` 로 302 하지만, 여기서 302 를 하면 작은 팝업 창 안에 VOD 본 화면이 뜬 채로
 * 남는다. 팝업은 자기 역할이 끝나면 닫혀야 하므로 리다이렉트 대신 HTML 을 돌려준다.
 *
 * 이 경로는 화이트리스트에 **별도 항목으로 등록돼야 한다.** 서버의 화이트리스트 검증
 * (SsoRedirectWhitelistServiceImpl#isSameUri)은 scheme·host·port·path·query·fragment 를
 * 모두 완전일치로 비교한다. `/auth/callback` 항목이 이 경로를 대신 통과시켜주지 않는다.
 */
function renderClosingPage(origin: string, ok: boolean): string {
  // 오프너에게 결과를 알리고 스스로 닫는다. targetOrigin 을 자기 오리진으로 못박아
  // 로그인 완료 신호가 임의의 사이트로 새지 않게 한다('*' 를 쓰지 않는다).
  //
  // 오프너가 메시지를 못 받는 경우(COOP 로 opener 연결이 끊긴 경우)에도 창은 닫힌다.
  // 오프너는 "닫힘 감지 + 세션 재확인"으로 결과를 알아내므로 이 메시지는 최적화일 뿐
  // 정확성의 근거가 아니다.
  const payload = JSON.stringify({ type: SSO_POPUP_MESSAGE_TYPE, ok });
  const originLiteral = JSON.stringify(origin);

  return `<!doctype html>
<html lang="ko">
<head><meta charset="utf-8"><title>로그인 처리 중</title></head>
<body style="font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;color:#4b5563">
<p>로그인 처리 중입니다. 창이 자동으로 닫힙니다.</p>
<script>
(function () {
  try {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(${payload}, ${originLiteral});
    }
  } catch (e) {
    // COOP 등으로 opener 접근이 막힌 경우. 창을 닫는 것까지는 그대로 진행한다.
  }
  window.close();
})();
</script>
</body>
</html>`;
}

export async function GET(request: NextRequest) {
  const tokens = extractSsoTokens(request.nextUrl.searchParams);
  const origin = request.nextUrl.origin;

  const response = new NextResponse(renderClosingPage(origin, tokens !== null), {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // 토큰이 쿼리에 담겨 들어온 응답이다. 중간 캐시에 남지 않게 한다.
      'Cache-Control': 'no-store',
    },
  });

  if (tokens) setSsoTokenCookies(response, tokens);
  return response;
}
