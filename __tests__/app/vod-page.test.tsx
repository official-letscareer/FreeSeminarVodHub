/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const pushMock = jest.fn();
// 실제 useRouter 처럼 렌더마다 같은 객체를 돌려준다. 새 객체를 주면 router 를 의존성으로 둔
// 조회 효과가 렌더마다 다시 돈다.
const routerMock = { push: pushMock };
jest.mock('next/navigation', () => ({
  useRouter: () => routerMock,
}));

// 이 화면의 관심사는 목록 조회와 이용권 안내다. 배너·카드의 이미지 로딩은 끌어오지 않는다.
jest.mock('@/components/banner-carousel', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/components/vod-card', () => ({
  __esModule: true,
  default: ({ vod }: { vod: { title: string } }) => <div>{vod.title}</div>,
}));
jest.mock('@/components/vod-list-item', () => ({
  __esModule: true,
  default: ({ vod }: { vod: { title: string } }) => <div>{vod.title}</div>,
}));

import VodListPage from '@/app/vod/page';

const INACTIVE_BODY = {
  code: 'VOD_PASS_INACTIVE',
  message: '활성화되지 않은 VOD 이용권이 있습니다.',
  pass: { applicationId: 123, durationDays: 30, expectedEndDate: '2026-11-11' },
  inactiveCount: 1,
};

const VODS = [
  {
    id: 1,
    title: '마케팅 취업 준비 101',
    youtubeId: 'abc',
    description: '',
    publishedAt: null,
    order: 1,
    embedEnabled: true,
    createdAt: '2024-01-01',
  },
];

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

describe('VodListPage — 비활성 이용권 안내 (LC-3438)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('/api/vod 가 403 VOD_PASS_INACTIVE 이면 /login 으로 보내지 않고 모달을 연다', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(403, INACTIVE_BODY),
      ) as unknown as typeof fetch;
    render(<VodListPage />);

    expect(
      await screen.findByText(
        '현재 보유 중인 이용권이 있습니다. 사용하시겠습니까?',
      ),
    ).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('나중에를 누르면 모달을 닫고 빈 상태와 다시 열기 버튼을 보여준다', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(403, INACTIVE_BODY),
      ) as unknown as typeof fetch;
    render(<VodListPage />);
    fireEvent.click(await screen.findByRole('button', { name: '나중에' }));

    expect(
      screen.queryByText('현재 보유 중인 이용권이 있습니다. 사용하시겠습니까?'),
    ).toBeNull();
    expect(
      screen.getByText('이용권을 활성화하면 시청할 수 있습니다'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '이용권 활성화하기' }));
    expect(
      await screen.findByText(
        '현재 보유 중인 이용권이 있습니다. 사용하시겠습니까?',
      ),
    ).toBeInTheDocument();
  });

  it('활성화에 성공하면 목록을 다시 조회해 보여준다', async () => {
    let listCalls = 0;
    global.fetch = jest.fn((url: string) => {
      if (url === '/api/vod/pass/activate') {
        return Promise.resolve(jsonResponse(200, { startsAt: null }));
      }
      listCalls += 1;
      return Promise.resolve(
        listCalls === 1
          ? jsonResponse(403, INACTIVE_BODY)
          : jsonResponse(200, VODS),
      );
    }) as unknown as typeof fetch;
    render(<VodListPage />);

    fireEvent.click(await screen.findByRole('button', { name: '사용하기' }));

    expect(await screen.findByText('마케팅 취업 준비 101')).toBeInTheDocument();
    expect(listCalls).toBe(2);
    expect(
      screen.queryByText('이용권을 활성화하면 시청할 수 있습니다'),
    ).toBeNull();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('401 이면 기존대로 /login 으로 보낸다', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(401, { message: '인증이 필요합니다.' }),
      ) as unknown as typeof fetch;
    render(<VodListPage />);

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/login'));
    expect(
      screen.queryByText('현재 보유 중인 이용권이 있습니다. 사용하시겠습니까?'),
    ).toBeNull();
  });

  it('사유가 다른 403 은 모달 없이 목록 오류 문구를 보여준다', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(403, { code: 'OTHER' }),
      ) as unknown as typeof fetch;
    render(<VodListPage />);

    expect(
      await screen.findByText('VOD 목록을 불러오지 못했습니다.'),
    ).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
