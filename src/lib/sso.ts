/**
 * SSO(LC-3208) 관련 서버 전용 유틸.
 *
 * `lib/auth.ts`는 최상단에 `'use client'`가 있어 클라이언트 전용 모듈이다. 여기서 필요한
 * `getSsoUserProfile`는 서버 전용 env(`LETSCAREER_API_URL`)로 렛커 서버를 직접 호출해야
 * 하므로 같은 파일에 넣지 않고 분리했다.
 */

export const SSO_ACCESS_TOKEN_COOKIE = 'sso_access_token';
export const SSO_REFRESH_TOKEN_COOKIE = 'sso_refresh_token';

export interface SsoUserProfile {
  name: string;
  isActiveChallengeParticipant: boolean;
  optionCodes: string[];
}

/**
 * 렛커 서버의 `GET /api/v2/user/sso-profile`을 호출한다.
 *
 * 이 호출의 성공 여부를 SSO 토큰의 유효성 판정 기준으로 그대로 쓴다 — VOD가 렛커 서버의
 * JWT 서명 비밀키를 따로 들고 있지 않아도 된다. 서명 키를 여러 저장소(VOD 포함)에
 * 나눠 들고 있으면 유출 시 모든 서비스의 JWT를 위조할 수 있게 되므로, 검증은 발급처인
 * 렛커 서버에 위임한다. 그 대가로 요청마다 네트워크 호출이 하나 더 붙지만, 이 프로젝트
 * 규모에서는 감수할 만하다고 판단했다(확정 사항 6).
 *
 * 챌린지 참여 여부·옵션 코드도 함께 내려받는다 — 로그인(토큰 유효성)과는 별개로,
 * VOD가 "이 사람이 접근 조건을 만족하는가"를 판단할 인가(authorization) 근거다.
 */
export async function getSsoUserProfile(
  token: string
): Promise<SsoUserProfile | null> {
  const apiUrl = process.env.LETSCAREER_API_URL;
  if (!apiUrl) return null;

  try {
    const res = await fetch(`${apiUrl}/api/v2/user/sso-profile`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;

    const body = await res.json();
    const data = body?.data;
    if (typeof data?.name !== 'string') return null;

    return {
      name: data.name,
      isActiveChallengeParticipant: data.isActiveChallengeParticipant === true,
      optionCodes: Array.isArray(data.optionCodes) ? data.optionCodes : [],
    };
  } catch {
    return null;
  }
}
