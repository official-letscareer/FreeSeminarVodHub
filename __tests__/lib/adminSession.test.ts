import { createHmac } from 'node:crypto';
import {
  ADMIN_SESSION_MAX_AGE_SEC,
  createAdminSession,
  verifyAdminSession,
} from '@/lib/adminSession';

const SECRET = 'test-admin-password';
const NOW = new Date('2026-10-12T00:00:00Z');
const NOW_SEC = Math.floor(NOW.getTime() / 1000);

const originalPassword = process.env.ADMIN_PASSWORD;

function hmac(secret: string, expiresAt: number | string): string {
  return createHmac('sha256', secret)
    .update(`admin-session.v1.${expiresAt}`)
    .digest('hex');
}

beforeEach(() => {
  process.env.ADMIN_PASSWORD = SECRET;
});

afterAll(() => {
  if (originalPassword === undefined) delete process.env.ADMIN_PASSWORD;
  else process.env.ADMIN_PASSWORD = originalPassword;
});

describe('createAdminSession', () => {
  it('v1.<만료>.<서명> 형식이고 만료는 수명만큼 뒤다', () => {
    const value = createAdminSession(NOW)!;
    const expiresAt = NOW_SEC + ADMIN_SESSION_MAX_AGE_SEC;

    expect(value).toBe(`v1.${expiresAt}.${hmac(SECRET, expiresAt)}`);
  });

  it.each([[undefined], ['']])('ADMIN_PASSWORD 가 %p 이면 null 이다', (pw) => {
    if (pw === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = pw;

    expect(createAdminSession(NOW)).toBeNull();
  });
});

describe('verifyAdminSession', () => {
  it('방금 만든 세션은 통과한다', () => {
    expect(verifyAdminSession(createAdminSession(NOW), NOW)).toBe(true);
  });

  it('만료 직전까지는 통과하고 만료 시각부터는 거절한다', () => {
    const value = createAdminSession(NOW)!;
    const expiresAt = NOW_SEC + ADMIN_SESSION_MAX_AGE_SEC;

    expect(verifyAdminSession(value, new Date((expiresAt - 1) * 1000))).toBe(
      true,
    );
    expect(verifyAdminSession(value, new Date(expiresAt * 1000))).toBe(false);
    expect(verifyAdminSession(value, new Date((expiresAt + 1) * 1000))).toBe(
      false,
    );
  });

  it('서명 한 글자를 바꾸면 거절한다', () => {
    const value = createAdminSession(NOW)!;
    const last = value.slice(-1);
    const tampered = value.slice(0, -1) + (last === '0' ? '1' : '0');

    expect(verifyAdminSession(tampered, NOW)).toBe(false);
  });

  it('만료 값을 늘려도 서명이 맞지 않아 거절한다', () => {
    const [version, expires, signature] = createAdminSession(NOW)!.split('.');
    const extended = `${version}.${Number(expires) + 86400 * 365}.${signature}`;

    expect(verifyAdminSession(extended, NOW)).toBe(false);
  });

  it('다른 비밀번호로 만든 세션은 거절한다', () => {
    const expiresAt = NOW_SEC + 1000;
    const forged = `v1.${expiresAt}.${hmac('other-password', expiresAt)}`;

    expect(verifyAdminSession(forged, NOW)).toBe(false);
  });

  it('발급 뒤 비밀번호가 바뀌면 기존 세션은 무효다', () => {
    const value = createAdminSession(NOW);
    process.env.ADMIN_PASSWORD = 'changed-password';

    expect(verifyAdminSession(value, NOW)).toBe(false);
  });

  it.each([[undefined], ['']])(
    'ADMIN_PASSWORD 가 %p 이면 어떤 값도 거절한다',
    (pw) => {
      const value = createAdminSession(NOW)!;
      if (pw === undefined) delete process.env.ADMIN_PASSWORD;
      else process.env.ADMIN_PASSWORD = pw;

      expect(verifyAdminSession(value, NOW)).toBe(false);
      // 빈 비밀번호로 서명한 값을 만들어도 통과하지 않는다.
      const expiresAt = NOW_SEC + 1000;
      expect(
        verifyAdminSession(`v1.${expiresAt}.${hmac('', expiresAt)}`, NOW),
      ).toBe(false);
    },
  );

  it.each([
    ['빈 문자열', ''],
    ['점이 없음', 'garbage'],
    ['부분이 2개', 'v1.1999999999'],
    ['부분이 4개', 'v1.1999999999.abc.def'],
    ['버전 불일치', `v2.${NOW_SEC + 1000}.${'0'.repeat(64)}`],
    ['만료가 숫자가 아님', `v1.soon.${'0'.repeat(64)}`],
    ['만료가 음수', `v1.-5.${'0'.repeat(64)}`],
    ['만료가 소수', `v1.1999999999.5.${'0'.repeat(64)}`],
    ['만료가 비어 있음', `v1..${'0'.repeat(64)}`],
    ['서명이 비어 있음', `v1.${NOW_SEC + 1000}.`],
  ])('형식 오류(%s)는 거절한다', (_label, value) => {
    expect(verifyAdminSession(value, NOW)).toBe(false);
  });

  it('길이가 다른 서명은 예외 없이 거절한다', () => {
    const expiresAt = NOW_SEC + 1000;
    const good = hmac(SECRET, expiresAt);

    expect(
      verifyAdminSession(`v1.${expiresAt}.${good.slice(0, 32)}`, NOW),
    ).toBe(false);
    expect(verifyAdminSession(`v1.${expiresAt}.${good}00`, NOW)).toBe(false);
    expect(verifyAdminSession(`v1.${expiresAt}.${good}`, NOW)).toBe(true);
  });

  it('값이 없으면 거절한다', () => {
    expect(verifyAdminSession(undefined, NOW)).toBe(false);
    expect(verifyAdminSession(null, NOW)).toBe(false);
  });

  it('문자열이 아닌 값이 와도 예외를 던지지 않는다', () => {
    expect(verifyAdminSession(12345 as unknown as string, NOW)).toBe(false);
  });
});
