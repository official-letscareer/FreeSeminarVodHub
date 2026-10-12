/**
 * 서명된 관리자 세션(LC-3438 이용 로그 조회용). 서버 전용 모듈이다. 클라이언트에서 import 하지 않는다.
 *
 * `admin_verified=1` 쿠키는 서명이 없어 값을 직접 만들어 넣으면 통과한다. 이용자 이름과 시청 기록을
 * 내보내는 `/api/admin/usage-logs` 는 그 쿠키에 더해 이 세션을 요구한다.
 *
 * 값 형식은 `v1.<만료 epoch 초>.<HMAC-SHA256 hex>` 이고 HMAC 메시지는 `admin-session.v1.<만료 epoch 초>`,
 * 키는 `ADMIN_PASSWORD` 다. 비밀번호를 바꾸면 기존 세션은 모두 무효가 된다. 의도한 동작이다.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const ADMIN_SESSION_COOKIE = 'admin_session';

/** 세션 수명(초). 쿠키 maxAge 와 서명 안의 만료 시각에 같은 값을 쓴다. */
export const ADMIN_SESSION_MAX_AGE_SEC = 60 * 60 * 24;

const VERSION = 'v1';

function sign(expiresAt: number, secret: string): string {
  return createHmac('sha256', secret)
    .update(`admin-session.${VERSION}.${expiresAt}`)
    .digest('hex');
}

/** `ADMIN_PASSWORD` 가 없거나 비어 있으면 null 이다. */
export function createAdminSession(now: Date = new Date()): string | null {
  const secret = process.env.ADMIN_PASSWORD;
  if (!secret) return null;
  const expiresAt =
    Math.floor(now.getTime() / 1000) + ADMIN_SESSION_MAX_AGE_SEC;
  return `${VERSION}.${expiresAt}.${sign(expiresAt, secret)}`;
}

/** 형식, 버전, 만료(서버 시각), 서명을 확인한다. 어떤 경우에도 예외를 던지지 않는다. */
export function verifyAdminSession(
  value: string | null | undefined,
  now: Date = new Date(),
): boolean {
  try {
    const secret = process.env.ADMIN_PASSWORD;
    if (!secret || typeof value !== 'string') return false;

    const parts = value.split('.');
    if (parts.length !== 3) return false;
    const [version, expiresRaw, signature] = parts;
    if (version !== VERSION) return false;
    if (!/^\d{1,12}$/.test(expiresRaw)) return false;

    const expiresAt = Number(expiresRaw);
    if (expiresAt <= Math.floor(now.getTime() / 1000)) return false;

    const expected = Buffer.from(sign(expiresAt, secret));
    const actual = Buffer.from(signature);
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
