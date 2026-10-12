import { createHmac, timingSafeEqual } from 'node:crypto';
import { USAGE_LIMITS } from './usageLogEvents';

/**
 * VOD 이용 로그(LC-3438)의 사용자 식별. 서버 전용이다.
 *
 * 식별 값은 서버에서만 만든다. 브라우저가 이름이나 키를 보내는 경로는 없다.
 * `USAGE_LOG_HASH_SECRET` 이 없으면 키를 만들지 않고, 로그는 세션 단위 익명으로 남는다.
 */

/**
 * 이름+전화번호·예외·프리미엄 로그인 때 서버가 심는 서명 쿠키.
 * 값은 `base64url(JSON {v, n, k, iat}).base64url(HMAC-SHA256(비밀키, 앞부분))` 이다.
 * httpOnly 는 스크립트만 막을 뿐 사용자가 쿠키를 직접 세팅하는 것은 막지 못하므로,
 * 이름과 키를 한 payload 로 묶어 서명한다.
 */
export const USAGE_LOG_ID_COOKIE = 'vod_log_id';

const COOKIE_VERSION = 1;
const KEY_LENGTH = 32;
const KEY_PATTERN = /^[0-9a-f]{32}$/;
/** 발급 시각(iat)이 서버 시각보다 이만큼 이상 미래이면 거절한다. */
const IAT_FUTURE_TOLERANCE_SEC = 300;

const ANONYMOUS = { userName: null, userKey: null } as const;

function getSecret(): string | null {
  return process.env.USAGE_LOG_HASH_SECRET || null;
}

function hmac(secret: string, input: string): Buffer {
  return createHmac('sha256', secret).update(input).digest();
}

/**
 * 서버 비밀키로 만든 HMAC-SHA256 의 앞 32자(hex). 비밀키가 없으면 null.
 * 입력 문자열의 접두어(`sso:`, `phone:`)로 인증 경로를 구분한다.
 */
export function usageLogKey(input: string): string | null {
  const secret = getSecret();
  if (!secret) return null;
  return hmac(secret, input).toString('hex').slice(0, KEY_LENGTH);
}

interface CookieSetter {
  cookies: { set: (name: string, value: string, options: object) => void };
}

/**
 * 로그인 성공 시 `auth_verified` 옆에 서명 쿠키를 심는다. 전화번호는 HMAC 입력으로만 쓰고
 * 쿠키에는 이름과 키만 담긴다. 실패해도 로그인은 막지 않는다.
 */
export function setUsageLogIdentityCookie(
  response: CookieSetter,
  name: string,
  phoneNum: string,
  maxAge: number,
): void {
  try {
    const secret = getSecret();
    if (!secret) return;
    if (name.length === 0 || name.length > USAGE_LIMITS.USER_NAME_MAX) return;
    const key = usageLogKey(`phone:${name}:${phoneNum}`);
    if (!key) return;

    const payload = Buffer.from(
      JSON.stringify({
        v: COOKIE_VERSION,
        n: name,
        k: key,
        iat: Math.floor(Date.now() / 1000),
      }),
    ).toString('base64url');
    const signature = hmac(secret, payload).toString('base64url');

    response.cookies.set(USAGE_LOG_ID_COOKIE, `${payload}.${signature}`, {
      httpOnly: true,
      sameSite: 'lax' as const,
      path: '/',
      maxAge,
    });
  } catch {
    // 이용 로그 식별은 부가 기능이다.
  }
}

interface CookieReader {
  get: (name: string) => { value: string } | undefined;
}

/**
 * `verified` 경로의 식별 값. 서명을 검증하고, 어떤 검증이든 실패하면 예외 없이 익명이다.
 * 로그 자체를 막지 않는다.
 */
export function readUsageLogIdentity(cookies: CookieReader): {
  userName: string | null;
  userKey: string | null;
} {
  try {
    const secret = getSecret();
    const value = cookies.get(USAGE_LOG_ID_COOKIE)?.value;
    if (!secret || !value) return ANONYMOUS;

    const parts = value.split('.');
    if (parts.length !== 2) return ANONYMOUS;
    const [payload, signature] = parts;

    const expected = Buffer.from(hmac(secret, payload).toString('base64url'));
    const given = Buffer.from(signature);
    if (given.length !== expected.length) return ANONYMOUS;
    if (!timingSafeEqual(given, expected)) return ANONYMOUS;

    const data: unknown = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    );
    if (typeof data !== 'object' || data === null) return ANONYMOUS;
    const { v, n, k, iat } = data as Record<string, unknown>;

    if (v !== COOKIE_VERSION) return ANONYMOUS;
    if (
      typeof n !== 'string' ||
      n.length === 0 ||
      n.length > USAGE_LIMITS.USER_NAME_MAX
    ) {
      return ANONYMOUS;
    }
    if (typeof k !== 'string' || !KEY_PATTERN.test(k)) return ANONYMOUS;
    const nowSec = Date.now() / 1000;
    if (typeof iat !== 'number' || !Number.isFinite(iat)) return ANONYMOUS;
    if (iat > nowSec + IAT_FUTURE_TOLERANCE_SEC) return ANONYMOUS;

    return { userName: n, userKey: k };
  } catch {
    return ANONYMOUS;
  }
}
