import { NextRequest } from 'next/server';
import { SSO_ACCESS_TOKEN_COOKIE, getSsoUserProfile } from './sso';
import { getAccessSettings } from './kv';
import { isEligibleForAccess } from './accessControl';
import {
  expectedEndDate,
  getMyVodPasses,
  pickActivatablePass,
} from './vodPass';

export type VodAccessResult =
  | { authorized: true }
  | { authorized: false; reason: 'no-auth' | 'invalid-token' | 'ineligible' }
  | {
      authorized: false;
      reason: 'inactive-pass';
      /** 활성화 대상: 미활성 이용권 중 가장 먼저 구매한 것 */
      pass: {
        applicationId: number;
        durationDays: number;
        expectedEndDate: string;
      };
      /** 미활성 이용권 전체 개수 */
      inactiveCount: number;
    };

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

  // 이용권 게이트(LC-3438). canWatchVod 가 null 이면 이용권을 모르는 구버전 서버라
  // 기존 판정으로 되돌아간다. 이때는 이용권 목록도 조회하지 않는다.
  if (settings.requireVodPass && profile.canWatchVod !== null) {
    if (profile.canWatchVod) {
      return { authorized: true };
    }

    // 통과 경로에서는 요청이 늘지 않도록, 막힌 경우에만 이용권 목록을 조회한다.
    const passes = await getMyVodPasses(ssoToken);
    const target = passes ? pickActivatablePass(passes) : null;
    if (!passes || !target) {
      return { authorized: false, reason: 'ineligible' };
    }

    return {
      authorized: false,
      reason: 'inactive-pass',
      pass: {
        applicationId: target.applicationId,
        durationDays: target.durationDays,
        expectedEndDate: expectedEndDate(target.durationDays, new Date()),
      },
      inactiveCount: passes.filter((pass) => pass.status === 'UNACTIVATED')
        .length,
    };
  }

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
