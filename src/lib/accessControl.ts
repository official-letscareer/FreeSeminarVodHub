import { AccessSettings } from './types';

/**
 * 챌린지 참여 여부·옵션 코드가 어드민 설정(AccessSettings)을 만족하는지 판단한다(LC-3208).
 * 이름+전화번호 로그인(/api/auth/verify)과 SSO 로그인(/api/vod) 둘 다 이 함수 하나로
 * 최종 통과 여부를 정한다 — 두 경로가 서로 다른 기준으로 어긋나지 않게 한다.
 *
 * 두 조건은 각각 독립적으로 켜고 끌 수 있다. 둘 다 꺼져 있으면(기본값) 렛커 로그인
 * 성공 자체가 통과 조건의 전부다.
 */
export function isEligibleForAccess(
  settings: AccessSettings,
  isActiveChallengeParticipant: boolean,
  optionCodes: string[],
): boolean {
  if (settings.requireChallengeParticipation && !isActiveChallengeParticipant) {
    return false;
  }

  if (settings.requireChallengeOption) {
    const hasAllowedOption = settings.allowedOptionCodes.some((code) =>
      optionCodes.includes(code),
    );
    if (!hasAllowedOption) return false;
  }

  return true;
}
