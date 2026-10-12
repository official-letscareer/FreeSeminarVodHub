jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: jest.fn(),
  },
}));

import { supabase } from '@/lib/supabase';
import { getUsageRecent, getUsageSummary, getUsageUsers } from '@/lib/kv';
import {
  UsageLogForbiddenError,
  UsageLogNotConfiguredError,
  UsageLogQueryError,
} from '@/lib/usageLogAdmin';

const mockRpc = supabase!.rpc as unknown as jest.Mock;
const TOKEN = 'a'.repeat(64);

const originalToken = process.env.USAGE_LOG_READ_TOKEN;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.USAGE_LOG_READ_TOKEN = TOKEN;
});

afterAll(() => {
  if (originalToken === undefined) delete process.env.USAGE_LOG_READ_TOKEN;
  else process.env.USAGE_LOG_READ_TOKEN = originalToken;
});

describe('getUsageSummary', () => {
  it('토큰과 기간을 RPC 인자로 넘기고 반환값을 파싱한다', async () => {
    mockRpc.mockResolvedValue({
      data: {
        days: 7,
        generated_at: '2026-10-12T00:00:00+00:00',
        totals: {
          sessions: 5,
          viewers: 3,
          plays: 8,
          views: 6,
          watched_min: 42,
        },
        vods: [
          {
            vod_id: 1,
            title: '영상A',
            plays: 8,
            viewers: 3,
            views: 6,
            ended: 2,
            avg_watched_sec: 90,
            total_watched_min: 9,
            avg_exit_pct: 35,
          },
        ],
        daily: [{ date: '2026-10-12', sessions: 2, plays: 4, watched_min: 20 }],
        pass: { prompt_shown: 4, activated: 3, failed: 1 },
      },
      error: null,
    });

    const result = await getUsageSummary(7);

    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('vod_usage_summary', {
      p_token: TOKEN,
      p_days: 7,
    });
    expect(result.totals).toEqual({
      sessions: 5,
      viewers: 3,
      plays: 8,
      views: 6,
      watchedMin: 42,
    });
    expect(result.vods[0]).toEqual({
      vodId: 1,
      title: '영상A',
      plays: 8,
      viewers: 3,
      views: 6,
      ended: 2,
      avgWatchedSec: 90,
      totalWatchedMin: 9,
      avgExitPct: 35,
    });
    expect(result.daily).toEqual([
      { date: '2026-10-12', sessions: 2, plays: 4, watchedMin: 20 },
    ]);
    expect(result.pass).toEqual({ promptShown: 4, activated: 3, failed: 1 });
  });

  it.each([
    [0, 1],
    [-5, 1],
    [999, 180],
    [7.9, 7],
    [Number.NaN, 30],
  ])('days %p 는 %p 로 보정해서 보낸다', async (input, expected) => {
    mockRpc.mockResolvedValue({ data: {}, error: null });

    await getUsageSummary(input);

    expect(mockRpc).toHaveBeenCalledWith('vod_usage_summary', {
      p_token: TOKEN,
      p_days: expected,
    });
  });

  it('토큰 환경변수가 없으면 UsageLogNotConfiguredError 를 던지고 RPC 를 부르지 않는다', async () => {
    delete process.env.USAGE_LOG_READ_TOKEN;

    await expect(getUsageSummary(30)).rejects.toBeInstanceOf(
      UsageLogNotConfiguredError,
    );
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('공백뿐인 토큰도 설정되지 않은 것으로 본다', async () => {
    process.env.USAGE_LOG_READ_TOKEN = '  \n';

    await expect(getUsageSummary(30)).rejects.toBeInstanceOf(
      UsageLogNotConfiguredError,
    );
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('토큰 앞뒤 공백은 잘라서 보낸다', async () => {
    process.env.USAGE_LOG_READ_TOKEN = `${TOKEN}\n`;
    mockRpc.mockResolvedValue({ data: {}, error: null });

    await getUsageSummary(30);

    expect(mockRpc).toHaveBeenCalledWith('vod_usage_summary', {
      p_token: TOKEN,
      p_days: 30,
    });
  });

  it('42501 은 UsageLogForbiddenError 로 구분한다', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'forbidden' },
    });

    await expect(getUsageSummary(30)).rejects.toBeInstanceOf(
      UsageLogForbiddenError,
    );
  });

  it('그 밖의 RPC 오류는 UsageLogQueryError 이고 원문과 토큰을 담지 않는다', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: {
        code: 'PGRST202',
        message: `function not found for token ${TOKEN}`,
      },
    });

    const error = await getUsageSummary(30).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UsageLogQueryError);
    expect((error as UsageLogQueryError).code).toBe('PGRST202');
    expect((error as Error).message).not.toContain(TOKEN);
    expect(JSON.stringify(error)).not.toContain(TOKEN);
  });

  it.each([[null], ['문자열'], [[1, 2]], [{ totals: 'x', vods: 'x' }]])(
    '잘못된 반환 형태 %p 는 빈 값으로 처리한다',
    async (data) => {
      mockRpc.mockResolvedValue({ data, error: null });

      const result = await getUsageSummary(30);

      expect(result.vods).toEqual([]);
      expect(result.daily).toEqual([]);
      expect(result.totals).toEqual({
        sessions: 0,
        viewers: 0,
        plays: 0,
        views: 0,
        watchedMin: 0,
      });
      expect(result.pass).toEqual({ promptShown: 0, activated: 0, failed: 0 });
    },
  );

  it('형태가 틀린 행은 버리고 나머지는 남긴다', async () => {
    mockRpc.mockResolvedValue({
      data: {
        totals: { plays: 'many', views: 4 },
        vods: [
          { vod_id: 'x', plays: 1 },
          null,
          { vod_id: 2, title: 7, plays: 3, avg_exit_pct: 'x' },
        ],
        daily: [{ sessions: 1 }, { date: '2026-10-11', plays: 2 }],
      },
      error: null,
    });

    const result = await getUsageSummary(30);

    expect(result.totals.plays).toBe(0);
    expect(result.totals.views).toBe(4);
    expect(result.vods).toEqual([
      {
        vodId: 2,
        title: null,
        plays: 3,
        viewers: 0,
        views: 0,
        ended: 0,
        avgWatchedSec: null,
        totalWatchedMin: 0,
        avgExitPct: null,
      },
    ]);
    expect(result.daily).toEqual([
      { date: '2026-10-11', sessions: 0, plays: 2, watchedMin: 0 },
    ]);
  });
});

describe('getUsageRecent', () => {
  it('limit 를 보정해서 RPC 에 넘기고 이벤트를 파싱한다', async () => {
    mockRpc.mockResolvedValue({
      data: {
        events: [
          {
            occurred_at: '2026-10-12T08:24:42+00:00',
            event_type: 'video_leave',
            vod_id: 1,
            vod_title: '영상A',
            page_path: '/vod/1',
            position_sec: 50,
            duration_sec: 100,
            watched_sec: 120,
            user_name: '홍길동',
            auth_method: 'sso',
            session_id: 'abcdef123456',
            detail: {},
          },
          { event_type: 'video_play' },
        ],
      },
      error: null,
    });

    const result = await getUsageRecent(9999);

    expect(mockRpc).toHaveBeenCalledWith('vod_usage_recent', {
      p_token: TOKEN,
      p_limit: 200,
    });
    expect(result).toEqual([
      {
        occurredAt: '2026-10-12T08:24:42+00:00',
        eventType: 'video_leave',
        vodId: 1,
        vodTitle: '영상A',
        pagePath: '/vod/1',
        positionSec: 50,
        durationSec: 100,
        watchedSec: 120,
        userName: '홍길동',
        authMethod: 'sso',
        sessionId: 'abcdef123456',
      },
    ]);
  });

  it('events 가 배열이 아니면 빈 배열이다', async () => {
    mockRpc.mockResolvedValue({ data: { events: 'x' }, error: null });

    await expect(getUsageRecent(10)).resolves.toEqual([]);
  });

  it('토큰이 없으면 UsageLogNotConfiguredError 이다', async () => {
    delete process.env.USAGE_LOG_READ_TOKEN;

    await expect(getUsageRecent(10)).rejects.toBeInstanceOf(
      UsageLogNotConfiguredError,
    );
  });
});

describe('getUsageUsers', () => {
  it('days 와 limit 를 보정해서 RPC 에 넘기고 사용자를 파싱한다', async () => {
    mockRpc.mockResolvedValue({
      data: {
        users: [
          {
            user_name: '홍길동',
            user_key: 'k1',
            views: 2,
            vods: 1,
            watched_min: 5,
            last_seen: '2026-10-12T00:00:00+00:00',
          },
          {
            user_name: null,
            user_key: null,
            views: 1,
            vods: 1,
            watched_min: 1,
            last_seen: null,
          },
        ],
      },
      error: null,
    });

    const result = await getUsageUsers(0, 0);

    expect(mockRpc).toHaveBeenCalledWith('vod_usage_users', {
      p_token: TOKEN,
      p_days: 1,
      p_limit: 1,
    });
    expect(result).toEqual([
      {
        userName: '홍길동',
        userKey: 'k1',
        views: 2,
        vods: 1,
        watchedMin: 5,
        lastSeen: '2026-10-12T00:00:00+00:00',
      },
      {
        userName: null,
        userKey: null,
        views: 1,
        vods: 1,
        watchedMin: 1,
        lastSeen: null,
      },
    ]);
  });

  it('42501 은 UsageLogForbiddenError 이다', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'forbidden' },
    });

    await expect(getUsageUsers(30, 100)).rejects.toBeInstanceOf(
      UsageLogForbiddenError,
    );
  });
});
