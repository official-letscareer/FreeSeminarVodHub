import type { NextResponse } from 'next/server';
import { SSO_ACCESS_TOKEN_COOKIE, SSO_REFRESH_TOKEN_COOKIE } from './sso';
import { USAGE_LOG_ID_COOKIE } from './usageLogIdentity';

/**
 * 두 로그인 방식(이름+전화번호, 렛커 SSO)의 쿠키를 지운다. 모두 httpOnly 라 브라우저 스크립트로는
 * 지울 수 없고 서버 응답으로만 지워진다.
 *
 * path 는 심을 때와 같은 '/' 로 명시한다. Next 는 생략해도 '/' 로 채우지만, 심을 때와 다른
 * path 로 지우면 다른 쿠키로 취급돼 지워지지 않으므로 맞춰야 한다는 점을 드러내 둔다.
 *
 * 이 파일은 미들웨어(Edge)가 import 하지 않는다 — usageLogIdentity 가 node:crypto 를 쓴다.
 */
function clear(response: NextResponse, names: string[]): void {
  for (const name of names) response.cookies.delete({ name, path: '/' });
}

export function clearNamePhoneLoginCookies(response: NextResponse): void {
  clear(response, ['auth_verified', USAGE_LOG_ID_COOKIE]);
}

export function clearSsoLoginCookies(response: NextResponse): void {
  clear(response, [SSO_ACCESS_TOKEN_COOKIE, SSO_REFRESH_TOKEN_COOKIE]);
}
