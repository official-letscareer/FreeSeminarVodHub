import { NextRequest } from 'next/server';
import { SSO_ACCESS_TOKEN_COOKIE, getSsoUserProfile } from './sso';
import { getAccessSettings } from './kv';
import { isEligibleForAccess } from './accessControl';

export type VodAccessResult =
  | { authorized: true }
  | { authorized: false; reason: 'no-auth' | 'invalid-token' | 'ineligible' };

/**
 * `/api/vod`, `/api/vod/[id]` 가 공유하는 VOD 접근 판정(LC-3208).
 *
 * 기존 이름+전화번호 로그인(auth_verified 쿠키)은 통과 조건을 로그인 시점
 * (/api/auth/verify)에 이미 확인했으므로 여기서 다시 확인하지 않는다. SSO 로그인은
 * 로그인 자체를 막지 않는 설계라(PRD 확정 사항 6), 접근 시점인 여기서 확인한다.
 */
export async function checkVodAccess(
  request: NextRequest,
): Promise<VodAccessResult> {
  if (request.cookies.get('auth_verified')?.value === '1') {
    return { authorized: true };
  }

  const ssoToken = request.cookies.get(SSO_ACCESS_TOKEN_COOKIE)?.value;
  if (!ssoToken) {
    return { authorized: false, reason: 'no-auth' };
  }

  const profile = await getSsoUserProfile(ssoToken);
  if (!profile) {
    return { authorized: false, reason: 'invalid-token' };
  }

  const settings = await getAccessSettings();
  const eligible = isEligibleForAccess(
    settings,
    profile.isActiveChallengeParticipant,
    profile.optionCodes,
  );
  if (!eligible) {
    return { authorized: false, reason: 'ineligible' };
  }

  return { authorized: true };
}
