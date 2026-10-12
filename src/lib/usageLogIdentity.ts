import { createHmac } from 'node:crypto';
import { USAGE_LIMITS } from './usageLogEvents';

/**
 * VOD 이용 로그(LC-3438)의 사용자 식별. 서버 전용이다.
 *
 * 식별 값은 서버에서만 만든다. 브라우저가 이름이나 키를 보내는 경로는 없다.
 * `USAGE_LOG_HASH_SECRET` 이 없으면 키를 만들지 않고, 로그는 세션 단위 익명으로 남는다.
 */

/** HMAC-SHA256 hex 의 앞 32자. `vod_usage_logs.user_key` 에 들어간다. */
export const USAGE_LOG_UID_COOKIE = 'vod_log_uid';
export const USAGE_LOG_UNAME_COOKIE = 'vod_log_uname';

const KEY_LENGTH = 32;
const KEY_PATTERN = /^[0-9a-f]{32}$/;

/**
 * 서버 비밀키로 만든 HMAC-SHA256 의 앞 32자(hex). 비밀키가 없으면 null.
 * 입력 문자열의 접두어(`sso:`, `phone:`)로 인증 경로를 구분한다.
 */
export function usageLogKey(input: string): string | null {
  const secret = process.env.USAGE_LOG_HASH_SECRET;
  if (!secret) return null;
  return createHmac('sha256', secret)
    .update(input)
    .digest('hex')
    .slice(0, KEY_LENGTH);
}

interface CookieSetter {
  cookies: { set: (name: string, value: string, options: object) => void };
}

/**
 * 이름+전화번호·예외·프리미엄 로그인 성공 시 `auth_verified` 옆에 심는다.
 * 전화번호는 HMAC 입력으로만 쓰고 쿠키에는 키와 이름만 담는다. 실패해도 로그인은 막지 않는다.
 */
export function setUsageLogIdentityCookies(
  response: CookieSetter,
  name: string,
  phoneNum: string,
  maxAge: number,
): void {
  try {
    if (name.length === 0 || name.length > USAGE_LIMITS.USER_NAME_MAX) return;
    const key = usageLogKey(`phone:${name}:${phoneNum}`);
    if (!key) return;

    const options = {
      httpOnly: true,
      sameSite: 'lax' as const,
      path: '/',
      maxAge,
    };
    response.cookies.set(USAGE_LOG_UID_COOKIE, key, options);
    response.cookies.set(
      USAGE_LOG_UNAME_COOKIE,
      encodeURIComponent(name),
      options,
    );
  } catch {
    // 이용 로그 식별은 부가 기능이다.
  }
}

interface CookieReader {
  get: (name: string) => { value: string } | undefined;
}

/** `verified` 경로의 식별 값. 두 쿠키만 읽고 형식이 틀리면 null 이다. */
export function readUsageLogIdentity(cookies: CookieReader): {
  userName: string | null;
  userKey: string | null;
} {
  const uid = cookies.get(USAGE_LOG_UID_COOKIE)?.value;
  const userKey = uid && KEY_PATTERN.test(uid) ? uid : null;

  let userName: string | null = null;
  const rawName = cookies.get(USAGE_LOG_UNAME_COOKIE)?.value;
  if (rawName) {
    try {
      const decoded = decodeURIComponent(rawName);
      if (decoded.length > 0 && decoded.length <= USAGE_LIMITS.USER_NAME_MAX) {
        userName = decoded;
      }
    } catch {
      userName = null;
    }
  }

  return { userName, userKey };
}
