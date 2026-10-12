jest.mock('@/lib/kv');
jest.mock('@/lib/sso', () => ({
  ...jest.requireActual('@/lib/sso'),
  getSsoUserProfile: jest.fn(),
}));

import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/vod/log/route';
import { insertUsageLogs } from '@/lib/kv';
import { SSO_ACCESS_TOKEN_COOKIE, getSsoUserProfile } from '@/lib/sso';

const mockInsert = insertUsageLogs as jest.MockedFunction<
  typeof insertUsageLogs
>;
const mockProfile = getSsoUserProfile as jest.MockedFunction<
  typeof getSsoUserProfile
>;

const BODY = {
  sessionId: 'sess-1',
  userName: '클라이언트가 말한 이름',
  userKey: 'client-key',
  events: [
    {
      type: 'video_play',
      vodId: 7,
      youtubeId: 'abc123XYZ',
      pagePath: '/vod/7',
      positionSec: 12.34,
      detail: {},
      occurredAt: new Date().toISOString(),
    },
    { type: 'page_leave', pagePath: '/vod/7', detail: { dwell_sec: 30 } },
  ],
};

function hmacKey(secret: string, input: string) {
  return createHmac('sha256', secret).update(input).digest('hex').slice(0, 32);
}

const UID = hmacKey('secret-1', 'phone:홍길동:01012345678');

function makeReq(
  body: unknown,
  options: {
    sso?: string | null;
    verified?: boolean;
    ua?: string;
    cookies?: Record<string, string>;
  } = {},
) {
  const {
    sso = null,
    verified = false,
    ua = 'jest-agent',
    cookies = {},
  } = options;
  const req = new NextRequest('http://localhost/api/vod/log', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', 'user-agent': ua },
  });
  if (sso) req.cookies.set(SSO_ACCESS_TOKEN_COOKIE, sso);
  if (verified) req.cookies.set('auth_verified', '1');
  for (const [name, value] of Object.entries(cookies)) {
    req.cookies.set(name, value);
  }
  return req;
}

const SSO_PROFILE = {
  name: '김렛커',
  isActiveChallengeParticipant: false,
  optionCodes: [],
  canWatchVod: false,
};

const originalSecret = process.env.USAGE_LOG_HASH_SECRET;

describe('POST /api/vod/log', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInsert.mockResolvedValue(undefined);
    jest.spyOn(console, 'error').mockImplementation(() => {});
    process.env.USAGE_LOG_HASH_SECRET = 'secret-1';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalSecret === undefined) delete process.env.USAGE_LOG_HASH_SECRET;
    else process.env.USAGE_LOG_HASH_SECRET = originalSecret;
  });

  it('인증 쿠키가 둘 다 없으면 401 이고 저장하지 않는다', async () => {
    const res = await POST(makeReq(BODY));

    expect(res.status).toBe(401);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('SSO 토큰이 있어도 프로필이 null 이면 401 이고, verified 쿠키로 되돌아가지 않는다', async () => {
    mockProfile.mockResolvedValue(null);

    const res = await POST(makeReq(BODY, { sso: 'jwt', verified: true }));

    expect(res.status).toBe(401);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('SSO 는 프로필 이름과 서버 HMAC 키를 쓰고 본문의 이름·키는 무시한다', async () => {
    mockProfile.mockResolvedValue(SSO_PROFILE);

    const res = await POST(makeReq(BODY, { sso: 'jwt', ua: 'x'.repeat(300) }));

    expect(res.status).toBe(204);
    expect(mockProfile).toHaveBeenCalledWith('jwt');
    const rows = mockInsert.mock.calls[0][0];
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toMatchObject({
        authMethod: 'sso',
        userName: '김렛커',
        userKey: hmacKey('secret-1', 'sso:김렛커'),
        sessionId: 'sess-1',
      });
      expect(row.userAgent).toHaveLength(200);
    }
    expect(rows[0]).toMatchObject({
      eventType: 'video_play',
      vodId: 7,
      youtubeId: 'abc123XYZ',
      pagePath: '/vod/7',
      positionSec: 12.3,
    });
  });

  it('같은 입력은 같은 키, 다른 비밀키는 다른 키를 만든다', async () => {
    mockProfile.mockResolvedValue(SSO_PROFILE);

    await POST(makeReq(BODY, { sso: 'jwt' }));
    await POST(makeReq(BODY, { sso: 'jwt' }));
    process.env.USAGE_LOG_HASH_SECRET = 'secret-2';
    await POST(makeReq(BODY, { sso: 'jwt' }));

    const [first, second, third] = mockInsert.mock.calls.map(
      ([rows]) => rows[0].userKey,
    );
    expect(first).toMatch(/^[0-9a-f]{32}$/);
    expect(second).toBe(first);
    expect(third).toMatch(/^[0-9a-f]{32}$/);
    expect(third).not.toBe(first);
  });

  it('비밀키가 없으면 SSO 도 이름만 저장하고 키는 null 이며 로그는 막지 않는다', async () => {
    delete process.env.USAGE_LOG_HASH_SECRET;
    mockProfile.mockResolvedValue(SSO_PROFILE);

    const res = await POST(makeReq(BODY, { sso: 'jwt' }));

    expect(res.status).toBe(204);
    expect(mockInsert.mock.calls[0][0][0]).toMatchObject({
      authMethod: 'sso',
      userName: '김렛커',
      userKey: null,
    });
  });

  it('SSO 쿠키 없이 auth_verified=1 이면 서버가 심은 두 쿠키 값만 쓰고 본문의 이름·키는 무시한다', async () => {
    const res = await POST(
      makeReq(BODY, {
        verified: true,
        cookies: {
          vod_log_uid: UID,
          vod_log_uname: encodeURIComponent('홍길동'),
        },
      }),
    );

    expect(res.status).toBe(204);
    expect(mockProfile).not.toHaveBeenCalled();
    const rows = mockInsert.mock.calls[0][0];
    expect(rows[0]).toMatchObject({
      authMethod: 'verified',
      userName: '홍길동',
      userKey: UID,
      userAgent: 'jest-agent',
    });
    expect(JSON.stringify(rows)).not.toContain('클라이언트가 말한 이름');
    expect(JSON.stringify(rows)).not.toContain('client-key');
  });

  it('verified 인데 식별 쿠키가 없으면(비밀키 미설정 등) 익명으로 저장하고 본문 값은 쓰지 않는다', async () => {
    const res = await POST(makeReq(BODY, { verified: true }));

    expect(res.status).toBe(204);
    for (const row of mockInsert.mock.calls[0][0]) {
      expect(row).toMatchObject({
        authMethod: 'verified',
        userName: null,
        userKey: null,
      });
    }
  });

  it.each([
    ['키 길이가 틀림', 'abc', '%ED%99%8D', null, '홍'],
    ['키가 16진수가 아님', 'z'.repeat(32), '%ED%99%8D', null, '홍'],
    ['이름 인코딩이 깨짐', UID, '%E0%A4%A', UID, null],
    ['이름이 100자 초과', UID, 'a'.repeat(101), UID, null],
  ])(
    '식별 쿠키 형식이 틀리면 틀린 값만 버린다: %s',
    async (_label, uid, uname, expectedKey, expectedName) => {
      await POST(
        makeReq(BODY, {
          verified: true,
          cookies: { vod_log_uid: uid, vod_log_uname: uname },
        }),
      );

      expect(mockInsert.mock.calls[0][0][0]).toMatchObject({
        userKey: expectedKey,
        userName: expectedName,
      });
    },
  );

  it('auth_verified 값이 1 이 아니면 인증으로 보지 않는다', async () => {
    const req = makeReq(BODY);
    req.cookies.set('auth_verified', '0');

    expect((await POST(req)).status).toBe(401);
  });

  it('JSON 이 아니면 400', async () => {
    const res = await POST(makeReq('{not json', { verified: true }));

    expect(res.status).toBe(400);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('검증에 실패하면 400', async () => {
    const res = await POST(
      makeReq(
        { sessionId: 's', events: [{ type: 'nope' }] },
        { verified: true },
      ),
    );

    expect(res.status).toBe(400);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('저장소 오류이면 서버 로그만 남기고 202 {ok:false} 를 돌려준다', async () => {
    mockInsert.mockRejectedValue({ code: 'PGRST205', message: 'no table' });

    const res = await POST(makeReq(BODY, { verified: true }));

    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ ok: false });
    expect(console.error).toHaveBeenCalled();
  });

  it('예상하지 못한 예외도 500 이 아니라 202 이다', async () => {
    mockProfile.mockRejectedValue(new Error('boom'));

    const res = await POST(makeReq(BODY, { sso: 'jwt' }));

    expect(res.status).toBe(202);
  });
});
