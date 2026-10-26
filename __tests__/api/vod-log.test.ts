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

/** 로그인 라우트가 심는 서명 쿠키와 같은 형식. 테스트가 변조·위조 값을 만들 때 쓴다. */
function signedCookie(
  payload: Record<string, unknown> = {},
  secret = 'secret-1',
) {
  const body = Buffer.from(
    JSON.stringify({
      v: 1,
      n: '홍길동',
      k: UID,
      iat: Math.floor(Date.now() / 1000),
      ...payload,
    }),
  ).toString('base64url');
  const signature = createHmac('sha256', secret)
    .update(body)
    .digest('base64url');
  return `${body}.${signature}`;
}

function logCookies(value: string) {
  return { vod_log_id: value };
}

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
  programApplications: [],
  userId: null,
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

  it('SSO 토큰이 만료돼 프로필이 null 이어도 auth_verified 가 있으면 verified 로 기록한다', async () => {
    mockProfile.mockResolvedValue(null);

    const res = await POST(
      makeReq(BODY, {
        sso: 'expired-jwt',
        verified: true,
        cookies: logCookies(signedCookie()),
      }),
    );

    expect(res.status).toBe(204);
    const [rows] = mockInsert.mock.calls[0];
    expect(rows[0]).toMatchObject({
      authMethod: 'verified',
      userName: '홍길동',
      userKey: UID,
    });
  });

  it('SSO 토큰만 있고 프로필이 null 이면(verified 없음) 401 이고 저장하지 않는다', async () => {
    mockProfile.mockResolvedValue(null);

    const res = await POST(makeReq(BODY, { sso: 'jwt' }));

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

  describe('verified 경로의 서명 쿠키', () => {
    async function logWith(
      cookies: Record<string, string>,
      options: { verified?: boolean } = {},
    ) {
      const res = await POST(
        makeReq(BODY, { verified: options.verified ?? true, cookies }),
      );
      return {
        res,
        row: mockInsert.mock.calls[0]?.[0][0] as
          | { userName: string | null; userKey: string | null }
          | undefined,
      };
    }

    function expectAnonymous(row: { userName: unknown; userKey: unknown }) {
      expect(row).toMatchObject({ userName: null, userKey: null });
    }

    it('올바른 서명이면 쿠키의 이름과 키를 쓰고 본문의 이름·키는 무시한다', async () => {
      const { res, row } = await logWith(logCookies(signedCookie()));

      expect(res.status).toBe(204);
      expect(mockProfile).not.toHaveBeenCalled();
      expect(row).toMatchObject({
        authMethod: 'verified',
        userName: '홍길동',
        userKey: UID,
        userAgent: 'jest-agent',
      });
      const stored = JSON.stringify(mockInsert.mock.calls);
      expect(stored).not.toContain('클라이언트가 말한 이름');
      expect(stored).not.toContain('client-key');
    });

    it('식별 쿠키가 없으면(비밀키 미설정 등) 익명으로 저장하고 로그는 막지 않는다', async () => {
      const { res, row } = await logWith({});

      expect(res.status).toBe(204);
      expect(row).toMatchObject({ authMethod: 'verified' });
      expectAnonymous(row!);
    });

    it('payload 의 이름을 바꾸면 서명이 맞지 않아 익명이다', async () => {
      const [, signature] = signedCookie().split('.');
      const forged = Buffer.from(
        JSON.stringify({ v: 1, n: '남의이름', k: UID, iat: 1 }),
      ).toString('base64url');

      const { res, row } = await logWith(logCookies(`${forged}.${signature}`));

      expect(res.status).toBe(204);
      expectAnonymous(row!);
    });

    it('payload 의 키를 바꾸면 익명이다', async () => {
      const [, signature] = signedCookie().split('.');
      const forged = Buffer.from(
        JSON.stringify({
          v: 1,
          n: '홍길동',
          k: 'a'.repeat(32),
          iat: Math.floor(Date.now() / 1000),
        }),
      ).toString('base64url');

      const { row } = await logWith(logCookies(`${forged}.${signature}`));

      expectAnonymous(row!);
    });

    it('서명을 바꾸면 익명이다', async () => {
      const [payload, signature] = signedCookie().split('.');
      const flipped = (signature[0] === 'A' ? 'B' : 'A') + signature.slice(1);

      const { row } = await logWith(logCookies(`${payload}.${flipped}`));

      expectAnonymous(row!);
    });

    it('다른 비밀키로 만든 쿠키는 익명이다', async () => {
      const { row } = await logWith(
        logCookies(signedCookie({}, 'another-secret')),
      );

      expectAnonymous(row!);
    });

    it('서버 비밀키가 없으면 형식이 맞는 쿠키도 익명이다', async () => {
      delete process.env.USAGE_LOG_HASH_SECRET;

      const { res, row } = await logWith(logCookies(signedCookie()));

      expect(res.status).toBe(204);
      expectAnonymous(row!);
    });

    it.each([
      ['빈 값', ''],
      ['점이 없음', 'abcdef'],
      ['점이 둘 이상', 'a.b.c'],
      ['서명이 비어 있음', `${signedCookie().split('.')[0]}.`],
      ['서명 길이가 다름', `${signedCookie().split('.')[0]}.abc`],
      [
        'payload 가 JSON 이 아님',
        (() => {
          const body = Buffer.from('not json').toString('base64url');
          const sig = createHmac('sha256', 'secret-1')
            .update(body)
            .digest('base64url');
          return `${body}.${sig}`;
        })(),
      ],
    ])('쿠키 형식이 틀리면 익명이다: %s', async (_label, value) => {
      const { res, row } = await logWith(logCookies(value));

      expect(res.status).toBe(204);
      expectAnonymous(row!);
    });

    it.each([
      ['버전 불일치', { v: 2 }],
      ['이름이 비어 있음', { n: '' }],
      ['이름이 100자 초과', { n: '가'.repeat(101) }],
      ['이름이 문자열이 아님', { n: 7 }],
      ['키 형식이 틀림', { k: 'xyz' }],
      [
        '발급 시각이 5분 넘게 미래',
        { iat: Math.floor(Date.now() / 1000) + 600 },
      ],
      ['발급 시각이 숫자가 아님', { iat: 'now' }],
    ])('서명이 맞아도 내용이 틀리면 익명이다: %s', async (_label, payload) => {
      const { row } = await logWith(logCookies(signedCookie(payload)));

      expectAnonymous(row!);
    });

    it('발급 시각이 5분 이내 미래이거나 오래돼도 통과한다(만료 판단에 쓰지 않는다)', async () => {
      const nowSec = Math.floor(Date.now() / 1000);

      const near = await logWith(
        logCookies(signedCookie({ iat: nowSec + 240 })),
      );
      expect(near.row).toMatchObject({ userName: '홍길동', userKey: UID });

      jest.clearAllMocks();
      mockInsert.mockResolvedValue(undefined);
      const old = await logWith(logCookies(signedCookie({ iat: 1 })));
      expect(old.row).toMatchObject({ userName: '홍길동', userKey: UID });
    });

    it('이전 방식의 두 쿠키(vod_log_uid, vod_log_uname)만 보내면 익명이다', async () => {
      const { res, row } = await logWith({
        vod_log_uid: UID,
        vod_log_uname: encodeURIComponent('홍길동'),
      });

      expect(res.status).toBe(204);
      expectAnonymous(row!);
    });

    it('auth_verified 없이 vod_log_id 만 있으면 401 이다', async () => {
      const { res } = await logWith(logCookies(signedCookie()), {
        verified: false,
      });

      expect(res.status).toBe(401);
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it('SSO 경로는 vod_log_id 를 읽지 않고 프로필 이름만 쓴다', async () => {
      mockProfile.mockResolvedValue(SSO_PROFILE);

      const res = await POST(
        makeReq(BODY, {
          sso: 'jwt',
          verified: true,
          cookies: logCookies(signedCookie({ n: '다른사람' })),
        }),
      );

      expect(res.status).toBe(204);
      expect(mockInsert.mock.calls[0][0][0]).toMatchObject({
        authMethod: 'sso',
        userName: '김렛커',
        userKey: hmacKey('secret-1', 'sso:김렛커'),
      });
    });
  });

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
