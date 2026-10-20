jest.mock('@/lib/kv');
jest.mock('@/lib/sso', () => ({
  ...jest.requireActual('@/lib/sso'),
  getSsoUserProfile: jest.fn(),
}));

import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';
import { POST as verify } from '@/app/api/auth/verify/route';
import { POST as writeLog } from '@/app/api/vod/log/route';
import {
  checkRateLimit,
  getAccessSettings,
  insertUsageLogs,
  isAllowedUser,
} from '@/lib/kv';

const mockIsAllowedUser = isAllowedUser as jest.Mock;
const mockCheckRateLimit = checkRateLimit as jest.Mock;
const mockGetAccessSettings = getAccessSettings as jest.Mock;
const mockInsert = insertUsageLogs as jest.Mock;

const PHONE = '01012345678';
const SETTINGS_OFF = {
  requireChallengeParticipation: false,
  requireChallengeOption: false,
  allowedOptionCodes: [],
  requireVodPass: false,
};
const DAY = 60 * 60 * 24;

function hmacKey(secret: string, input: string) {
  return createHmac('sha256', secret).update(input).digest('hex').slice(0, 32);
}

function post(url: string, body: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function cookieHeaders(res: Response): string[] {
  return res.headers.getSetCookie();
}

function cookieValue(res: Response, name: string): string | undefined {
  const line = cookieHeaders(res).find((c) => c.startsWith(`${name}=`));
  return line?.split(';')[0].slice(name.length + 1);
}

function maxAge(res: Response, name: string): string | undefined {
  const line = cookieHeaders(res).find((c) => c.startsWith(`${name}=`));
  return line?.match(/Max-Age=(\d+)/i)?.[1];
}

const originalSecret = process.env.USAGE_LOG_HASH_SECRET;
const originalFetch = global.fetch;

describe('이용 로그 식별 쿠키 (LC-3438)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.USAGE_LOG_HASH_SECRET = 'secret-1';
    process.env.LETSCAREER_API_URL = 'https://api.example.com';
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 4 });
    mockGetAccessSettings.mockResolvedValue(SETTINGS_OFF);
    mockIsAllowedUser.mockResolvedValue(true);
    mockInsert.mockResolvedValue(undefined);
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    global.fetch = originalFetch;
    if (originalSecret === undefined) delete process.env.USAGE_LOG_HASH_SECRET;
    else process.env.USAGE_LOG_HASH_SECRET = originalSecret;
  });

  describe.each([['/api/auth/verify', verify]])('POST %s', (url, handler) => {
    it('성공하면 응답 본문은 그대로이고 서명된 httpOnly 쿠키 vod_log_id 하나만 더 심는다', async () => {
      const res = await handler(
        post(url, { name: ' 홍길동 ', phoneNum: PHONE }),
      );

      expect(await res.json()).toEqual({ isChallenge: true });
      expect(cookieValue(res, 'auth_verified')).toBe('1');
      expect(cookieValue(res, 'vod_log_uid')).toBeUndefined();
      expect(cookieValue(res, 'vod_log_uname')).toBeUndefined();

      const value = cookieValue(res, 'vod_log_id')!;
      const [payload, signature] = value.split('.');
      expect(JSON.parse(Buffer.from(payload, 'base64url').toString())).toEqual({
        v: 1,
        n: '홍길동',
        k: hmacKey('secret-1', `phone:홍길동:${PHONE}`),
        iat: expect.any(Number),
      });
      expect(signature).toBe(
        createHmac('sha256', 'secret-1').update(payload).digest('base64url'),
      );

      const line = cookieHeaders(res).find((c) => c.startsWith('vod_log_id='))!;
      expect(line).toMatch(/HttpOnly/i);
      expect(line).toMatch(/SameSite=lax/i);
      expect(line).toMatch(/Path=\//i);
    });

    it('전화번호 원문은 쿠키 값(디코딩한 payload 포함)에 없고, 하이픈 입력도 정규화한 값으로 만든다', async () => {
      const res = await handler(
        post(url, { name: '홍길동', phoneNum: '010-1234-5678' }),
      );

      const value = cookieValue(res, 'vod_log_id')!;
      const decoded = Buffer.from(value.split('.')[0], 'base64url').toString();
      for (const text of [cookieHeaders(res).join('\n'), decoded]) {
        expect(text).not.toContain(PHONE);
        expect(text).not.toContain('1234-5678');
      }
      expect(JSON.parse(decoded).k).toBe(
        hmacKey('secret-1', `phone:홍길동:${PHONE}`),
      );
    });

    it('비밀키가 없으면 식별 쿠키를 심지 않고 로그인은 그대로 성공한다', async () => {
      delete process.env.USAGE_LOG_HASH_SECRET;

      const res = await handler(post(url, { name: '홍길동', phoneNum: PHONE }));

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ isChallenge: true });
      expect(cookieValue(res, 'auth_verified')).toBe('1');
      expect(cookieValue(res, 'vod_log_id')).toBeUndefined();
    });

    it('통과하지 못하면 어떤 쿠키도 심지 않는다', async () => {
      mockIsAllowedUser.mockResolvedValue(false);
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 });

      const res = await handler(post(url, { name: '홍길동', phoneNum: PHONE }));

      expect(await res.json()).toEqual({ isChallenge: false });
      expect(cookieHeaders(res)).toEqual([]);
    });

    it('식별 쿠키 수명은 auth_verified 와 같다', async () => {
      const res = await handler(post(url, { name: '홍길동', phoneNum: PHONE }));

      const expected = maxAge(res, 'auth_verified');
      expect(expected).toBeDefined();
      expect(maxAge(res, 'vod_log_id')).toBe(expected);
    });

    it('이름이 100자를 넘으면 식별 쿠키만 생략한다', async () => {
      const res = await handler(
        post(url, { name: '가'.repeat(101), phoneNum: PHONE }),
      );

      expect(cookieValue(res, 'auth_verified')).toBe('1');
      expect(cookieValue(res, 'vod_log_id')).toBeUndefined();
    });

    it('서버가 심은 쿠키를 그대로 돌려보내면 로그 행에 이름과 키가 들어간다', async () => {
      const res = await handler(post(url, { name: '홍길동', phoneNum: PHONE }));
      const cookie = cookieHeaders(res)
        .map((line) => line.split(';')[0])
        .join('; ');

      const req = new NextRequest('http://localhost/api/vod/log', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: 's',
          userName: '위조',
          userKey: 'forged',
          events: [{ type: 'page_view' }],
        }),
        headers: { 'Content-Type': 'application/json', cookie },
      });
      expect((await writeLog(req)).status).toBe(204);

      const row = mockInsert.mock.calls[0][0][0];
      expect(row).toMatchObject({
        authMethod: 'verified',
        userName: '홍길동',
        userKey: hmacKey('secret-1', `phone:홍길동:${PHONE}`),
      });
      expect(JSON.stringify(mockInsert.mock.calls)).not.toContain(PHONE);
    });
  });

  it('verify: 이용권 게이트가 켜져 있으면 식별 쿠키도 24시간이다', async () => {
    mockIsAllowedUser.mockResolvedValue(false);
    mockGetAccessSettings.mockResolvedValue({
      ...SETTINGS_OFF,
      requireVodPass: true,
    });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { isChallenge: true, canWatchVod: true } }),
    });

    const res = await verify(
      post('/api/auth/verify', { name: '홍길동', phoneNum: PHONE }),
    );

    expect(maxAge(res, 'auth_verified')).toBe(String(DAY));
    expect(maxAge(res, 'vod_log_id')).toBe(String(DAY));
  });
});
