/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { within } from '@testing-library/react';
import AdminVodUsagePage from '@/app/admin/vod/usage/page';
import { USAGE_EVENT_TYPES } from '@/lib/usageLogEvents';

// next/navigation 의 useRouter 는 렌더마다 같은 객체를 돌려준다. 목도 그래야 효과가 다시 돌지 않는다.
const mockPush = jest.fn();
const mockRouter = { push: mockPush };
jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}));

const SUMMARY = {
  days: 30,
  generatedAt: '2026-10-12T08:30:00+00:00',
  totals: { sessions: 12, viewers: 7, plays: 20, views: 15, watchedMin: 1234 },
  vods: [
    {
      vodId: 1,
      title: '영상A',
      plays: 11,
      viewers: 5,
      views: 9,
      ended: 3,
      avgWatchedSec: 125,
      totalWatchedMin: 40,
      avgExitPct: 62,
    },
    {
      vodId: 99,
      title: null,
      plays: 2,
      viewers: 1,
      views: 1,
      ended: 0,
      avgWatchedSec: 30,
      totalWatchedMin: 1,
      avgExitPct: null,
    },
  ],
  daily: [
    { date: '2026-10-12', sessions: 4, plays: 6, watchedMin: 30 },
    { date: '2026-10-11', sessions: 2, plays: 3, watchedMin: 12 },
  ],
  pass: { promptShown: 8, activated: 5, failed: 2 },
};

const EVENTS = [
  {
    occurredAt: '2026-10-12T08:24:42+00:00',
    eventType: 'video_leave',
    vodId: 1,
    vodTitle: '영상A',
    pagePath: '/vod/1',
    positionSec: 61.4,
    durationSec: 100,
    watchedSec: 60,
    userName: '홍길동',
    authMethod: 'sso',
    sessionId: 'abcdef1234567890',
  },
  {
    occurredAt: '2026-10-12T08:20:00+00:00',
    eventType: 'pass_activated',
    vodId: null,
    vodTitle: null,
    pagePath: '/vod',
    positionSec: null,
    durationSec: null,
    watchedSec: null,
    userName: null,
    authMethod: 'verified',
    sessionId: 'zzzzzzzz9999',
  },
];

const USERS = [
  {
    userName: '홍길동',
    userKey: 'k1',
    views: 3,
    vods: 2,
    watchedMin: 45,
    lastSeen: '2026-10-12T08:24:42+00:00',
  },
  {
    userName: null,
    userKey: null,
    views: 5,
    vods: 3,
    watchedMin: 20,
    lastSeen: '2026-10-11T15:00:00+00:00',
  },
];

const EMPTY_SUMMARY = {
  ...SUMMARY,
  totals: { sessions: 0, viewers: 0, plays: 0, views: 0, watchedMin: 0 },
  vods: [],
  daily: [],
  pass: { promptShown: 0, activated: 0, failed: 0 },
};

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

/** view 별로 응답을 돌려주는 fetch 목. 요청 URL 은 mock.calls 로 확인한다. */
function mockApi(
  responses: Partial<Record<'summary' | 'recent' | 'users', Response>> = {},
) {
  const fetchMock = jest.fn((input: RequestInfo | URL) => {
    const url = String(input);
    const view = new URL(url, 'http://localhost').searchParams.get('view') as
      | 'summary'
      | 'recent'
      | 'users';
    const preset = responses[view];
    if (preset) return Promise.resolve(preset);
    const body =
      view === 'summary'
        ? SUMMARY
        : view === 'recent'
          ? { events: EVENTS }
          : { users: USERS };
    return Promise.resolve(jsonResponse(body));
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function requestedUrls(fetchMock: jest.Mock): URL[] {
  return fetchMock.mock.calls.map(
    ([input]) => new URL(String(input), 'http://localhost'),
  );
}

function section(title: string): HTMLElement {
  const heading = screen.getByText(title, {
    selector: '[data-slot=card-title]',
  });
  return heading.closest('[data-slot=card]') as HTMLElement;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('AdminVodUsagePage', () => {
  it('불러오는 동안 로딩을 보여주고, 끝나면 요약과 표를 그린다', async () => {
    let resolveSummary!: (res: Response) => void;
    const summaryPending = new Promise<Response>((r) => {
      resolveSummary = r;
    });
    const fetchMock = jest.fn((input: RequestInfo | URL) => {
      const view = new URL(String(input), 'http://localhost').searchParams.get(
        'view',
      );
      if (view === 'summary') return summaryPending;
      return Promise.resolve(
        jsonResponse(view === 'recent' ? { events: EVENTS } : { users: USERS }),
      );
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<AdminVodUsagePage />);

    expect(screen.getByText('이용 로그를 불러오는 중...')).toBeInTheDocument();
    expect(screen.queryByText('영상별')).not.toBeInTheDocument();

    resolveSummary(jsonResponse(SUMMARY));

    expect(await screen.findByText('영상별')).toBeInTheDocument();
    expect(
      screen.queryByText('이용 로그를 불러오는 중...'),
    ).not.toBeInTheDocument();

    // 요약 카드
    for (const label of ['방문 세션', '시청자', '재생', '시청 시간(분)']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.getByText('1,234')).toBeInTheDocument();

    // 영상별
    const vods = within(section('영상별'));
    expect(vods.getByText('영상A')).toBeInTheDocument();
    expect(vods.getByText('2분 5초')).toBeInTheDocument();
    expect(vods.getByText('62%')).toBeInTheDocument();
    expect(vods.getByText('삭제된 영상 (#99)')).toBeInTheDocument();
    expect(vods.getByText('끝까지 본 횟수')).toBeInTheDocument();

    // 일별 추이
    const daily = within(section('일별 추이'));
    expect(daily.getByText('2026-10-12')).toBeInTheDocument();
    expect(daily.getByText('2026-10-11')).toBeInTheDocument();

    // 사용자별
    const users = within(section('사용자별'));
    expect(users.getByText('홍길동')).toBeInTheDocument();
    expect(users.getByText('(익명)')).toBeInTheDocument();
    expect(users.getByText('2026-10-12 17:24:42')).toBeInTheDocument();
    expect(users.getByText('2026-10-12 00:00:00')).toBeInTheDocument();

    // 최근 이벤트: KST 시각, 한글 라벨, 위치, 세션 앞 8자
    const recent = within(section('최근 이벤트'));
    expect(recent.getByText('2026-10-12 17:24:42')).toBeInTheDocument();
    expect(recent.getByText('영상 화면 이탈')).toBeInTheDocument();
    expect(recent.getByText('이용권 활성화 성공')).toBeInTheDocument();
    expect(recent.getByText('1:01')).toBeInTheDocument();
    expect(recent.getByText('abcdef12')).toBeInTheDocument();
    expect(recent.queryByText('abcdef1234567890')).not.toBeInTheDocument();

    // 이용권 활성화 안내 수치
    const pass = within(section('이용권 활성화 안내'));
    expect(pass.getByText('안내 노출')).toBeInTheDocument();
    expect(pass.getByText('8')).toBeInTheDocument();
    expect(pass.getByText('5')).toBeInTheDocument();
    expect(pass.getByText('2')).toBeInTheDocument();
  });

  it('처음에는 30일 기준으로 세 view 를 한 번씩 요청한다', async () => {
    const fetchMock = mockApi();

    render(<AdminVodUsagePage />);
    await screen.findByText('영상별');

    const urls = requestedUrls(fetchMock);
    expect(urls).toHaveLength(3);
    const byView = Object.fromEntries(
      urls.map((u) => [u.searchParams.get('view'), u]),
    );
    expect(byView.summary.searchParams.get('days')).toBe('30');
    expect(byView.users.searchParams.get('days')).toBe('30');
    expect(byView.recent.searchParams.get('limit')).toBe('50');
    expect(
      screen.getByRole('button', { name: '30일', pressed: true }),
    ).toBeInTheDocument();
  });

  it('기간을 바꾸면 days 파라미터로 다시 조회한다', async () => {
    const fetchMock = mockApi();
    render(<AdminVodUsagePage />);
    await screen.findByText('영상별');
    fetchMock.mockClear();

    fireEvent.click(screen.getByRole('button', { name: '7일' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    await screen.findByText('영상별');

    let urls = requestedUrls(fetchMock);
    expect(
      urls
        .filter((u) => u.searchParams.get('view') !== 'recent')
        .map((u) => u.searchParams.get('days')),
    ).toEqual(['7', '7']);
    expect(
      screen.getByRole('button', { name: '7일', pressed: true }),
    ).toBeInTheDocument();

    fetchMock.mockClear();
    fireEvent.click(screen.getByRole('button', { name: '90일' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    await screen.findByText('영상별');

    urls = requestedUrls(fetchMock);
    expect(
      urls
        .filter((u) => u.searchParams.get('view') === 'summary')
        .map((u) => u.searchParams.get('days')),
    ).toEqual(['90']);
  });

  it('새로고침 버튼은 같은 기간으로 다시 조회한다', async () => {
    const fetchMock = mockApi();
    render(<AdminVodUsagePage />);
    await screen.findByText('영상별');
    fetchMock.mockClear();

    fireEvent.click(screen.getByRole('button', { name: '새로고침' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    await screen.findByText('영상별');
    expect(
      requestedUrls(fetchMock)
        .filter((u) => u.searchParams.get('view') === 'summary')
        .map((u) => u.searchParams.get('days')),
    ).toEqual(['30']);
  });

  it('데이터가 없으면 빈 상태 문구를 보여준다', async () => {
    mockApi({
      summary: jsonResponse(EMPTY_SUMMARY),
      recent: jsonResponse({ events: [] }),
      users: jsonResponse({ users: [] }),
    });

    render(<AdminVodUsagePage />);
    await screen.findByText('영상별');

    expect(
      within(section('영상별')).getByText(
        '이 기간에 기록된 데이터가 없습니다.',
      ),
    ).toBeInTheDocument();
    expect(
      within(section('일별 추이')).getByText(
        '이 기간에 기록된 데이터가 없습니다.',
      ),
    ).toBeInTheDocument();
    expect(
      within(section('사용자별')).getByText(
        '이 기간에 기록된 데이터가 없습니다.',
      ),
    ).toBeInTheDocument();
    expect(
      within(section('최근 이벤트')).getByText('기록된 이벤트가 없습니다.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('503 이면 토큰 설정 안내를 보여준다', async () => {
    mockApi({
      summary: jsonResponse(
        { message: '이용 로그 조회 토큰이 설정되지 않았습니다.' },
        503,
      ),
      recent: jsonResponse(
        { message: '이용 로그 조회 토큰이 설정되지 않았습니다.' },
        503,
      ),
      users: jsonResponse(
        { message: '이용 로그 조회 토큰이 설정되지 않았습니다.' },
        503,
      ),
    });

    render(<AdminVodUsagePage />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      '이용 로그 조회 토큰이 설정되지 않았습니다.',
    );
    expect(alert).toHaveTextContent('USAGE_LOG_READ_TOKEN');
    expect(screen.queryByText('영상별')).not.toBeInTheDocument();
  });

  it('502 이면 서버가 준 문구를 보여준다', async () => {
    mockApi({
      summary: jsonResponse(
        { message: '이용 로그 조회 권한 설정이 올바르지 않습니다.' },
        502,
      ),
    });

    render(<AdminVodUsagePage />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '이용 로그 조회 권한 설정이 올바르지 않습니다.',
    );
  });

  it('요청이 실패하면 일반 오류 문구를 보여준다', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('network')) as unknown as typeof fetch;

    render(<AdminVodUsagePage />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '이용 로그를 불러오지 못했습니다.',
    );
  });

  it('401 이면 관리자 로그인으로 보낸다', async () => {
    mockApi({
      summary: jsonResponse({ message: '인증이 필요합니다.' }, 401),
    });

    render(<AdminVodUsagePage />);

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/admin'));
  });

  it('이전 기간의 늦은 응답이 최신 화면을 덮어쓰지 않는다', async () => {
    const SLOW_SUMMARY = {
      ...SUMMARY,
      vods: [{ ...SUMMARY.vods[0], title: '느린 응답 영상' }],
    };
    let resolveSlow!: (res: Response) => void;
    const slow = new Promise<Response>((r) => {
      resolveSlow = r;
    });
    let summaryCalls = 0;
    const fetchMock = jest.fn((input: RequestInfo | URL) => {
      const view = new URL(String(input), 'http://localhost').searchParams.get(
        'view',
      );
      if (view === 'summary') {
        summaryCalls += 1;
        // 첫 번째(30일) 요약만 늦게 도착한다.
        if (summaryCalls === 1) return slow;
        return Promise.resolve(jsonResponse(SUMMARY));
      }
      return Promise.resolve(
        jsonResponse(view === 'recent' ? { events: EVENTS } : { users: USERS }),
      );
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<AdminVodUsagePage />);
    fireEvent.click(screen.getByRole('button', { name: '7일' }));
    await screen.findByText('영상별');

    await act(async () => {
      resolveSlow(jsonResponse(SLOW_SUMMARY));
    });

    const vods = within(section('영상별'));
    expect(vods.queryByText('느린 응답 영상')).not.toBeInTheDocument();
    expect(vods.getByText('영상A')).toBeInTheDocument();
  });

  it('화면의 이벤트 라벨이 이벤트 목록 전체를 덮는다', async () => {
    const events = USAGE_EVENT_TYPES.map((eventType, i) => ({
      ...EVENTS[0],
      eventType,
      sessionId: `session-${i}-padding`,
    }));
    mockApi({ recent: jsonResponse({ events }) });

    render(<AdminVodUsagePage />);
    await screen.findByText('최근 이벤트');

    const rows = within(section('최근 이벤트')).getAllByRole('row');
    // 머리글 행 하나를 뺀다.
    expect(rows).toHaveLength(USAGE_EVENT_TYPES.length + 1);
    for (const type of USAGE_EVENT_TYPES) {
      expect(within(section('최근 이벤트')).queryByText(type)).toBeNull();
    }
  });
});
