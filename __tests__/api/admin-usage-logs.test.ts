jest.mock('@/lib/kv');

import { GET } from '@/app/api/admin/usage-logs/route';
import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';
import { createAdminSession } from '@/lib/adminSession';
import {
  getUsageRecent,
  getUsageSummary,
  getUsageUserEvents,
  getUsageUsers,
} from '@/lib/kv';
import { usageLogKey } from '@/lib/usageLogIdentity';
import {
  UsageLogForbiddenError,
  UsageLogNotConfiguredError,
  UsageLogQueryError,
  emptyUsageSummary,
} from '@/lib/usageLogAdmin';

const mockSummary = getUsageSummary as jest.MockedFunction<
  typeof getUsageSummary
>;
const mockRecent = getUsageRecent as jest.MockedFunction<typeof getUsageRecent>;
const mockUsers = getUsageUsers as jest.MockedFunction<typeof getUsageUsers>;
const mockUserEvents = getUsageUserEvents as jest.MockedFunction<
  typeof getUsageUserEvents
>;

const BASE = 'http://localhost/api/admin/usage-logs';
const TOKEN = 'b'.repeat(64);

/** 로그인 직후와 같은 상태: admin_verified 와 서명된 admin_session. */
function adminReq(
  query = '',
  session: string | null = createAdminSession(),
): NextRequest {
  const req = new NextRequest(`${BASE}${query}`);
  req.cookies.set('admin_verified', '1');
  if (session) req.cookies.set('admin_session', session);
  return req;
}

const originalToken = process.env.USAGE_LOG_READ_TOKEN;
const originalPassword = process.env.ADMIN_PASSWORD;
const originalSecret = process.env.ADMIN_SESSION_SECRET;
const SESSION_SECRET = 'usage-session-secret-'.repeat(2);

beforeEach(() => {
  jest.clearAllMocks();
  process.env.USAGE_LOG_READ_TOKEN = TOKEN;
  process.env.ADMIN_PASSWORD = 'test-admin-password';
  process.env.ADMIN_SESSION_SECRET = SESSION_SECRET;
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(() => {
  if (originalToken === undefined) delete process.env.USAGE_LOG_READ_TOKEN;
  else process.env.USAGE_LOG_READ_TOKEN = originalToken;
  if (originalPassword === undefined) delete process.env.ADMIN_PASSWORD;
  else process.env.ADMIN_PASSWORD = originalPassword;
  if (originalSecret === undefined) delete process.env.ADMIN_SESSION_SECRET;
  else process.env.ADMIN_SESSION_SECRET = originalSecret;
});

describe('GET /api/admin/usage-logs 인증', () => {
  it('쿠키가 없으면 401 이고 조회하지 않는다', async () => {
    const res = await GET(new NextRequest(`${BASE}?view=summary`));

    expect(res.status).toBe(401);
    expect(mockSummary).not.toHaveBeenCalled();
  });

  it('admin_verified 값이 1 이 아니면 401 이다', async () => {
    const req = new NextRequest(`${BASE}?view=summary`);
    req.cookies.set('admin_verified', '0');

    const res = await GET(req);

    expect(res.status).toBe(401);
    expect(mockSummary).not.toHaveBeenCalled();
  });

  it('서명 없는 admin_verified=1 만 있으면 401 이다', async () => {
    const req = new NextRequest(`${BASE}?view=summary`);
    req.cookies.set('admin_verified', '1');

    const res = await GET(req);

    expect(res.status).toBe(401);
    expect(mockSummary).not.toHaveBeenCalled();
  });

  it('유효한 세션이 있어도 admin_verified 가 없으면 401 이다', async () => {
    const req = new NextRequest(`${BASE}?view=summary`);
    req.cookies.set('admin_session', createAdminSession()!);

    const res = await GET(req);

    expect(res.status).toBe(401);
    expect(mockSummary).not.toHaveBeenCalled();
  });

  it('서명이 틀린 admin_session 은 401 이다', async () => {
    const forged = `v1.${Math.floor(Date.now() / 1000) + 3600}.${'0'.repeat(64)}`;

    const res = await GET(adminReq('?view=summary', forged));

    expect(res.status).toBe(401);
    expect(mockSummary).not.toHaveBeenCalled();
  });

  it('만료된 admin_session 은 401 이다', async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

    const res = await GET(
      adminReq('?view=summary', createAdminSession(twoDaysAgo)),
    );

    expect(res.status).toBe(401);
    expect(mockSummary).not.toHaveBeenCalled();
  });

  it('비밀키가 바뀌면 이전에 발급된 세션은 401 이다', async () => {
    const session = createAdminSession();
    process.env.ADMIN_SESSION_SECRET = 'rotated-session-secret-'.repeat(2);

    const res = await GET(adminReq('?view=summary', session));

    expect(res.status).toBe(401);
  });

  it('ADMIN_PASSWORD 로 서명한 세션은 401 이다', async () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    const signature = createHmac('sha256', 'test-admin-password')
      .update(`admin-session.v1.${expiresAt}`)
      .digest('hex');

    const res = await GET(
      adminReq('?view=summary', `v1.${expiresAt}.${signature}`),
    );

    expect(res.status).toBe(401);
    expect(mockSummary).not.toHaveBeenCalled();
  });

  describe('ADMIN_SESSION_SECRET 미설정', () => {
    beforeEach(() => {
      delete process.env.ADMIN_SESSION_SECRET;
    });

    it('로그인한 관리자에게는 503 과 원인 문구를 돌려준다', async () => {
      const res = await GET(adminReq('?view=summary', null));

      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({
        message: '관리자 세션 비밀키가 설정되지 않았습니다.',
      });
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(mockSummary).not.toHaveBeenCalled();
    });

    it('ADMIN_PASSWORD 만 있어도 세션이 만들어지지 않아 503 이다', async () => {
      expect(createAdminSession()).toBeNull();

      const res = await GET(adminReq('?view=summary'));

      expect(res.status).toBe(503);
    });

    it('31자 비밀키는 설정되지 않은 것으로 보고 503 이다', async () => {
      process.env.ADMIN_SESSION_SECRET = 'x'.repeat(31);

      const res = await GET(adminReq('?view=summary', null));
      const text = await res.text();

      expect(res.status).toBe(503);
      expect(text).not.toContain('31');
    });

    it('admin_verified 가 없으면 여전히 401 이다', async () => {
      const res = await GET(new NextRequest(`${BASE}?view=summary`));

      expect(res.status).toBe(401);
    });
  });

  it('admin_verified=1 과 유효한 세션이 모두 있으면 통과한다', async () => {
    mockSummary.mockResolvedValue(emptyUsageSummary());

    const res = await GET(adminReq('?view=summary'));

    expect(res.status).toBe(200);
    expect(mockSummary).toHaveBeenCalledTimes(1);
  });

  it('401 응답에도 no-store 가 붙는다', async () => {
    const res = await GET(new NextRequest(`${BASE}?view=summary`));

    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});

describe('GET /api/admin/usage-logs view 와 파라미터', () => {
  it.each([[''], ['?view=bogus'], ['?view=']])(
    'view 가 없거나 잘못되면(%p) 400 이다',
    async (query) => {
      const res = await GET(adminReq(query));

      expect(res.status).toBe(400);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(mockSummary).not.toHaveBeenCalled();
      expect(mockRecent).not.toHaveBeenCalled();
      expect(mockUsers).not.toHaveBeenCalled();
    },
  );

  it('summary 는 days 를 넘기고 결과를 그대로 돌려준다', async () => {
    mockSummary.mockResolvedValue({ ...emptyUsageSummary(), days: 7 });

    const res = await GET(adminReq('?view=summary&days=7'));

    expect(res.status).toBe(200);
    expect(mockSummary).toHaveBeenCalledWith(7);
    expect((await res.json()).days).toBe(7);
  });

  it('days 를 정수 1~180 으로 보정하고 기본은 30 이다', async () => {
    mockSummary.mockResolvedValue(emptyUsageSummary());

    await GET(adminReq('?view=summary'));
    await GET(adminReq('?view=summary&days=0'));
    await GET(adminReq('?view=summary&days=-4'));
    await GET(adminReq('?view=summary&days=9999'));
    await GET(adminReq('?view=summary&days=abc'));
    await GET(adminReq('?view=summary&days=12.8'));

    expect(mockSummary.mock.calls.map((call) => call[0])).toEqual([
      30, 1, 1, 180, 30, 12,
    ]);
  });

  it('recent 는 limit 를 보정하고 events 로 감싸 돌려준다', async () => {
    mockRecent.mockResolvedValue([
      {
        occurredAt: '2026-10-12T00:00:00+00:00',
        eventType: 'video_play',
        vodId: 1,
        vodTitle: '영상A',
        pagePath: '/vod/1',
        positionSec: 0,
        durationSec: 100,
        watchedSec: null,
        userName: null,
        authMethod: 'verified',
        sessionId: 'abcdef123456',
      },
    ]);

    const res = await GET(adminReq('?view=recent&limit=1000'));

    expect(res.status).toBe(200);
    expect(mockRecent).toHaveBeenCalledWith(200);
    const body = await res.json();
    expect(body.events).toHaveLength(1);
    expect(body.events[0].eventType).toBe('video_play');
  });

  it('recent 의 limit 기본은 100 이다', async () => {
    mockRecent.mockResolvedValue([]);

    await GET(adminReq('?view=recent'));

    expect(mockRecent).toHaveBeenCalledWith(100);
  });

  it('users 는 days 와 limit 를 함께 보정하고 users 로 감싼다', async () => {
    mockUsers.mockResolvedValue([]);

    const res = await GET(adminReq('?view=users&days=0&limit=0'));

    expect(res.status).toBe(200);
    expect(mockUsers).toHaveBeenCalledWith(1, 1);
    expect(await res.json()).toEqual({ users: [] });
  });

  it('성공 응답에 no-store 가 붙는다', async () => {
    mockSummary.mockResolvedValue(emptyUsageSummary());

    const res = await GET(adminReq('?view=summary'));

    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});

describe('GET /api/admin/usage-logs 오류 매핑', () => {
  it('토큰 미설정은 503 과 안내 문구다', async () => {
    mockSummary.mockRejectedValue(new UsageLogNotConfiguredError());

    const res = await GET(adminReq('?view=summary'));

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      message: '이용 로그 조회 토큰이 설정되지 않았습니다.',
    });
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('토큰 불일치는 502 와 권한 설정 문구다', async () => {
    mockRecent.mockRejectedValue(new UsageLogForbiddenError());

    const res = await GET(adminReq('?view=recent'));

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      message: '이용 로그 조회 권한 설정이 올바르지 않습니다.',
    });
  });

  it('그 밖의 오류는 502 이고 원문을 싣지 않는다', async () => {
    mockUsers.mockRejectedValue(
      new Error(`relation "vod_usage_logs" does not exist ${TOKEN}`),
    );

    const res = await GET(adminReq('?view=users'));
    const text = await res.text();

    expect(res.status).toBe(502);
    expect(text).not.toContain('vod_usage_logs');
    expect(text).not.toContain(TOKEN);
  });

  it('RPC 오류도 502 이고 서버 로그에는 코드만 남는다', async () => {
    mockSummary.mockRejectedValue(new UsageLogQueryError('PGRST202'));

    const res = await GET(adminReq('?view=summary'));

    expect(res.status).toBe(502);
    expect(console.error).toHaveBeenCalledWith(
      '[Usage Log Admin]',
      'rpc error PGRST202',
    );
  });

  it('어떤 응답 본문에도 토큰이 없다', async () => {
    const cases: Array<() => void> = [
      () => mockSummary.mockResolvedValue(emptyUsageSummary()),
      () => mockSummary.mockRejectedValue(new UsageLogNotConfiguredError()),
      () => mockSummary.mockRejectedValue(new UsageLogForbiddenError()),
      () => mockSummary.mockRejectedValue(new Error(`boom ${TOKEN}`)),
    ];

    for (const arrange of cases) {
      arrange();
      const res = await GET(adminReq('?view=summary'));
      expect(await res.text()).not.toContain(TOKEN);
    }
  });
});

describe('GET /api/admin/usage-logs view=user (유저 검색)', () => {
  const originalHashSecret = process.env.USAGE_LOG_HASH_SECRET;

  beforeEach(() => {
    process.env.USAGE_LOG_HASH_SECRET = 'hash-secret-1';
    mockUserEvents.mockResolvedValue({ events: [], truncated: false });
  });

  afterEach(() => {
    if (originalHashSecret === undefined) {
      delete process.env.USAGE_LOG_HASH_SECRET;
    } else {
      process.env.USAGE_LOG_HASH_SECRET = originalHashSecret;
    }
  });

  it('이름만 주면 이름 부분 일치로 조회하고 키는 쓰지 않는다', async () => {
    const res = await GET(adminReq('?view=user&name=%20임성빈%20&days=7'));

    expect(res.status).toBe(200);
    expect(mockUserEvents).toHaveBeenCalledWith({
      name: '임성빈',
      userKey: null,
      days: 7,
    });
    expect(await res.json()).toEqual({ events: [], truncated: false });
  });

  it('이름과 전화번호를 주면 서버가 만든 키로 정확히 조회한다', async () => {
    const res = await GET(
      adminReq('?view=user&name=임성빈&phone=010-1234-5678&days=30'),
    );

    expect(res.status).toBe(200);
    expect(mockUserEvents).toHaveBeenCalledWith({
      name: '임성빈',
      userKey: usageLogKey('phone:임성빈:01012345678'),
      days: 30,
    });
  });

  it('전화번호만 주면 400 이고 조회하지 않는다 (전화번호는 저장되지 않는다)', async () => {
    const res = await GET(adminReq('?view=user&phone=01012345678'));

    expect(res.status).toBe(400);
    expect((await res.json()).message).toContain('이름도 함께');
    expect(mockUserEvents).not.toHaveBeenCalled();
  });

  it('이름도 전화번호도 없으면 400 이다', async () => {
    const res = await GET(adminReq('?view=user'));

    expect(res.status).toBe(400);
    expect(mockUserEvents).not.toHaveBeenCalled();
  });

  it('USAGE_LOG_HASH_SECRET 이 없으면 전화번호 검색은 400 안내다', async () => {
    delete process.env.USAGE_LOG_HASH_SECRET;

    const res = await GET(adminReq('?view=user&name=임성빈&phone=01012345678'));

    expect(res.status).toBe(400);
    expect((await res.json()).message).toContain('USAGE_LOG_HASH_SECRET');
    expect(mockUserEvents).not.toHaveBeenCalled();
  });

  it('이름이 아주 길어도 100자로 자른다', async () => {
    await GET(adminReq(`?view=user&name=${'가'.repeat(150)}`));

    const call = mockUserEvents.mock.calls[0][0];
    expect(call.name).toHaveLength(100);
  });

  it('로그인 세션이 없으면 401 이다', async () => {
    const res = await GET(new NextRequest(`${BASE}?view=user&name=a`));

    expect(res.status).toBe(401);
    expect(mockUserEvents).not.toHaveBeenCalled();
  });

  it('함수가 아직 만들어지지 않은 등 저장소 오류는 502 이고 원문을 싣지 않는다', async () => {
    mockUserEvents.mockRejectedValue(new UsageLogQueryError('PGRST202'));

    const res = await GET(adminReq('?view=user&name=임성빈'));

    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain('PGRST202');
  });
});
