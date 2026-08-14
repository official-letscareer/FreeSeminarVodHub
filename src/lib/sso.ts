/**
 * SSO(LC-3208) 관련 서버 전용 유틸.
 *
 * `lib/auth.ts`는 최상단에 `'use client'`가 있어 클라이언트 전용 모듈이다. 여기서 필요한
 * `getSsoUserProfile`는 서버 전용 env(`LETSCAREER_API_URL`)로 렛커 서버를 직접 호출해야
 * 하므로 같은 파일에 넣지 않고 분리했다.
 */

export const SSO_ACCESS_TOKEN_COOKIE = 'sso_access_token';
export const SSO_REFRESH_TOKEN_COOKIE = 'sso_refresh_token';

/** 팝업 창이 오프너에게 로그인 완료를 알릴 때 쓰는 메시지 타입. */
export const SSO_POPUP_MESSAGE_TYPE = 'letscareer-sso:result';

export interface SsoTokens {
  accessToken: string;
  refreshToken: string | null;
}

/**
 * 렛커 SSO 로그인 페이지가 로그인 성공 후 돌려보내는 콜백 쿼리에서 토큰을 꺼낸다.
 * 두 형태를 모두 받는다:
 * - `?token=&refreshToken=` — 이메일/비밀번호 SSO(SsoAuthController, server Push 2)
 * - `?result={"accessToken":...,"refreshToken":...}` — 카카오/네이버 소셜 로그인
 *   (OAuth2AuthenticationSuccessHandler). 이 형식은 내부 web/admin/mentor 이 이미 쓰던
 *   기존 포맷 그대로라, 소셜 로그인 쪽 서버 코드는 건드리지 않고 여기서 흡수한다.
 *
 * 전체 이동 콜백과 팝업 콜백이 이 함수를 공유한다. 한쪽에만 형식이 추가되면 소셜 로그인이
 * 한쪽 경로에서만 되는 상태가 되므로 복사하지 않는다.
 */
export function extractSsoTokens(
  searchParams: URLSearchParams,
): SsoTokens | null {
  const token = searchParams.get('token');
  if (token) {
    return { accessToken: token, refreshToken: searchParams.get('refreshToken') };
  }

  const result = searchParams.get('result');
  if (result) {
    try {
      const parsed = JSON.parse(result) as {
        accessToken?: string;
        refreshToken?: string;
      };
      if (typeof parsed.accessToken === 'string') {
        return {
          accessToken: parsed.accessToken,
          refreshToken: parsed.refreshToken ?? null,
        };
      }
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * 콜백에서 받은 토큰을 쿠키에 심는다. 전체 이동 콜백과 팝업 콜백이 공유한다.
 *
 * 기존 auth_verified 쿠키(src/app/api/auth/verify/route.ts)와 동일한 옵션 —
 * httpOnly로 XSS를 통한 토큰 탈취를 막는다. localStorage에 두면 이 방어가 깨진다.
 *
 * 쿠키는 창이 아니라 **오리진**에 저장되므로, 팝업에서 심어도 오프너 탭이 그대로 공유한다.
 * 팝업 방식이 토큰을 창 사이로 넘기지 않아도 되는 이유다.
 */
export function setSsoTokenCookies(
  response: { cookies: { set: (name: string, value: string, options: object) => void } },
  tokens: SsoTokens,
): void {
  const options = {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  };

  response.cookies.set(SSO_ACCESS_TOKEN_COOKIE, tokens.accessToken, options);
  if (tokens.refreshToken) {
    response.cookies.set(SSO_REFRESH_TOKEN_COOKIE, tokens.refreshToken, options);
  }
}

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
  token: string,
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
