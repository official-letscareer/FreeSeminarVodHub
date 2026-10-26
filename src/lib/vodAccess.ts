import { NextRequest } from 'next/server';
import { SSO_ACCESS_TOKEN_COOKIE, getSsoUserProfile } from './sso';
import { getAccessSettings, getGroupAccessRules } from './kv';
import { isEligibleForAccess } from './accessControl';
import { findGroupAccessEndsAt } from './groupAccess';
import type { ProgramApplication } from './types';

/** SSO 로 통과하면 렛츠커리어 사용자 번호(`userId`)를 함께 준다. 재생 기록(LC-3507)에 쓴다. */
export type VodAccessResult =
  | { authorized: true; userId?: number }
  | { authorized: false; reason: 'no-auth' | 'invalid-token' | 'ineligible' };

function authorized(userId: number | null): VodAccessResult {
  return userId === null ? { authorized: true } : { authorized: true, userId };
}

const INELIGIBLE: VodAccessResult = { authorized: false, reason: 'ineligible' };

/**
 * 기존 판정에서 막힌 사용자를 그룹 접근 규칙과 대조한다. 통과 경로에는 Supabase 조회를 더하지
 * 않으려고 막혔을 때만 부른다. 신청 내역이 없으면 규칙을 조회하지 않는다.
 *
 * 규칙 조회가 실패하면 기존 판정(ineligible)을 그대로 돌려준다 — 규칙은 기존 판정 위에 더하는
 * 통과 경로라, 실패가 기존 결과를 바꾸지 않게 한다.
 */
async function checkGroupAccess(
  applications: ProgramApplication[],
  userId: number | null,
): Promise<VodAccessResult> {
  if (applications.length === 0) return INELIGIBLE;
  try {
    const rules = await getGroupAccessRules();
    return findGroupAccessEndsAt(applications, rules, new Date())
      ? authorized(userId)
      : INELIGIBLE;
  } catch (err) {
    console.error('getGroupAccessRules error:', err);
    return INELIGIBLE;
  }
}

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

  // 이용권 게이트(LC-3438). 렛커 서버가 내려준 canWatchVod(현재 유효한 이용권, 또는 컷오버 전에
  // 신청한 챌린지의 레거시 시청 권한)만으로 정한다. 이 스위치가 켜져 있는 동안 챌린지 참여·옵션
  // 필터는 쓰지 않는다. canWatchVod 가 null 이면 이용권을 모르는 구버전 서버라 기존 판정으로
  // 되돌아간다.
  if (settings.requireVodPass && profile.canWatchVod !== null) {
    return profile.canWatchVod
      ? authorized(profile.userId)
      : checkGroupAccess(profile.programApplications, profile.userId);
  }

  const eligible = isEligibleForAccess(
    settings,
    profile.isActiveChallengeParticipant,
    profile.optionCodes,
  );
  if (!eligible) {
    return checkGroupAccess(profile.programApplications, profile.userId);
  }

  return authorized(profile.userId);
}
