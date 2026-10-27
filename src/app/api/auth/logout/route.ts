import { NextResponse } from 'next/server';
import {
  clearNamePhoneLoginCookies,
  clearSsoLoginCookies,
} from '@/lib/loginCookies';

/**
 * VOD 로그아웃. 로그인 쿠키가 모두 httpOnly 라 브라우저에서 `document.cookie` 로 지우면 아무것도
 * 지워지지 않는다. 예전 로그아웃이 그랬고, 다른 계정으로 다시 로그인해도 남은 쿠키 때문에 이전
 * 계정으로 통과했다.
 */
export async function POST() {
  const response = NextResponse.json({ success: true });
  clearNamePhoneLoginCookies(response);
  clearSsoLoginCookies(response);
  return response;
}
