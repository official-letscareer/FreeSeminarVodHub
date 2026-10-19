/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const pushMock = jest.fn();
const routerMock = { push: pushMock };
jest.mock('next/navigation', () => ({ useRouter: () => routerMock }));

import UserUsageSearch from '@/components/admin/UserUsageSearch';

function res(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

let seq = 0;
function event(over: Record<string, unknown>) {
  seq += 1;
  return {
    occurredAt: new Date(Date.UTC(2026, 9, 19, 1, 0, seq)).toISOString(),
    eventType: 'page_view',
    vodId: null,
    vodTitle: null,
    pagePath: '/vod',
    positionSec: null,
    durationSec: null,
    watchedSec: null,
    userName: '임성빈',
    authMethod: 'sso',
    sessionId: 's1',
    userKey: 'k1',
    detail: {},
    ...over,
  };
}

const EVENTS = [
  event({ detail: { from: '' } }),
  event({
    pagePath: '/vod/28',
    vodId: 28,
    vodTitle: '마케팅 취업 준비 101',
    detail: { from: '/vod', via: '마케팅 취업 준비 101 카드' },
  }),
  event({ eventType: 'video_play', pagePath: '/vod/28', vodId: 28 }),
  event({
    eventType: 'video_leave',
    pagePath: '/vod/28',
    vodId: 28,
    positionSec: 125,
    watchedSec: 90,
  }),
  event({
    eventType: 'page_leave',
    pagePath: '/vod/28',
    detail: { dwell_sec: 95 },
  }),
];

function search(name: string, phone = '') {
  fireEvent.change(screen.getByLabelText('이름'), { target: { value: name } });
  if (phone) {
    fireEvent.change(screen.getByLabelText(/전화번호/), {
      target: { value: phone },
    });
  }
  fireEvent.click(screen.getByRole('button', { name: '이용 내역 보기' }));
}

beforeEach(() => {
  jest.clearAllMocks();
  seq = 0;
});

describe('UserUsageSearch', () => {
  it('이름이 없으면 검색 버튼이 비활성이다', () => {
    render(<UserUsageSearch days={30} />);

    expect(
      screen.getByRole('button', { name: '이용 내역 보기' }),
    ).toBeDisabled();
  });

  it('이름과 기간으로 조회하고 이동 경로를 트리로 보여준다', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        res(200, { events: EVENTS, truncated: false }),
      ) as unknown as typeof fetch;
    render(<UserUsageSearch days={7} />);

    search('임성빈');

    expect(await screen.findByText('VOD 목록')).toBeInTheDocument();
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain('view=user');
    expect(url).toContain('days=7');
    expect(url).toContain(`name=${encodeURIComponent('임성빈')}`);

    // 영상 노드: 어떤 클릭으로 왔는지, 머문 시간, 시청 요약
    expect(screen.getByText('마케팅 취업 준비 101')).toBeInTheDocument();
    expect(
      screen.getByText('클릭: 마케팅 취업 준비 101 카드'),
    ).toBeInTheDocument();
    expect(screen.getByText('직접 진입')).toBeInTheDocument();
    expect(screen.getByText(/머문 시간 1분 35초/)).toBeInTheDocument();
    expect(screen.getByText(/재생 1회 · 시청 1분 30초/)).toBeInTheDocument();
    expect(screen.getByText(/마지막 위치 2:05/)).toBeInTheDocument();
    // 목록 노드 아래에 영상 노드가 중첩된다
    const list = screen.getByText('VOD 목록').closest('li') as HTMLElement;
    expect(list.querySelector('ul')).toHaveTextContent('마케팅 취업 준비 101');
  });

  it('전화번호는 숫자와 하이픈만 받고 그대로 서버에 넘긴다', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        res(200, { events: [], truncated: false }),
      ) as unknown as typeof fetch;
    render(<UserUsageSearch days={30} />);

    search('임성빈', '010-1234-5678abc');

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain('phone=010-1234-5678');
    expect(url).not.toContain('abc');
  });

  it('결과가 없으면 안내 문구를 보여준다', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        res(200, { events: [], truncated: false }),
      ) as unknown as typeof fetch;
    render(<UserUsageSearch days={30} />);

    search('없는사람');

    expect(
      await screen.findByText(
        /없는사람 이용자의 최근 30일 이용 내역이 없습니다/,
      ),
    ).toBeInTheDocument();
  });

  it('이벤트가 잘렸으면 알려 준다', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        res(200, { events: EVENTS, truncated: true }),
      ) as unknown as typeof fetch;
    render(<UserUsageSearch days={30} />);

    search('임성빈');

    expect(
      await screen.findByText(/가장 최근 것만 보여줍니다/),
    ).toBeInTheDocument();
  });

  it('서버가 준 오류 문구를 그대로 보여준다', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        res(400, { message: '전화번호만으로는 찾을 수 없습니다.' }),
      ) as unknown as typeof fetch;
    render(<UserUsageSearch days={30} />);

    search('임성빈');

    expect(
      await screen.findByText('전화번호만으로는 찾을 수 없습니다.'),
    ).toBeInTheDocument();
  });

  it('401 이면 관리자 로그인으로 보낸다', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(res(401, {})) as unknown as typeof fetch;
    render(<UserUsageSearch days={30} />);

    search('임성빈');

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/admin'));
  });

  it('이름이 같은 이용자도 키가 다르면 따로 보여준다', async () => {
    const other = event({
      userKey: 'k2',
      sessionId: 's2',
      detail: { from: '' },
    });
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        res(200, { events: [...EVENTS, other], truncated: false }),
      ) as unknown as typeof fetch;
    render(<UserUsageSearch days={30} />);

    search('임성빈');

    await screen.findAllByText('임성빈');
    expect(screen.getAllByText('임성빈')).toHaveLength(2);
  });
});
