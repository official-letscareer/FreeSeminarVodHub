jest.mock('@/lib/kv');

import { GET } from '@/app/api/admin/usage-logs/route';
import { NextRequest } from 'next/server';
import { getUsageRecent, getUsageSummary, getUsageUsers } from '@/lib/kv';
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

const BASE = 'http://localhost/api/admin/usage-logs';
const TOKEN = 'b'.repeat(64);

function adminReq(query = ''): NextRequest {
  const req = new NextRequest(`${BASE}${query}`);
  req.cookies.set('admin_verified', '1');
  return req;
}

const originalToken = process.env.USAGE_LOG_READ_TOKEN;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.USAGE_LOG_READ_TOKEN = TOKEN;
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(() => {
  if (originalToken === undefined) delete process.env.USAGE_LOG_READ_TOKEN;
  else process.env.USAGE_LOG_READ_TOKEN = originalToken;
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
