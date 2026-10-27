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

// 이 화면의 관심사는 목록 조회와 접근 거절 처리다. 배너·카드의 이미지 로딩은 끌어오지 않는다.
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

describe('VodListPage — 목록 조회와 접근 처리', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('조회에 성공하면 목록을 보여주고 활성화 안내는 없다 (이용권은 구매 즉시 시작된다)', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse(200, VODS)) as unknown as typeof fetch;
    render(<VodListPage />);

    expect(await screen.findByText('마케팅 취업 준비 101')).toBeInTheDocument();
    expect(screen.queryByText(/활성화/)).toBeNull();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('401 이면 /login 으로 보낸다 (이용권·레거시 권한이 없는 경우도 같다)', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(401, { message: '인증이 필요합니다.' }),
      ) as unknown as typeof fetch;
    render(<VodListPage />);

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/login'));
  });

  it('그 밖의 오류는 /login 으로 보내지 않고 목록 오류 문구를 보여준다', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(403, { message: '권한 없음' }),
      ) as unknown as typeof fetch;
    render(<VodListPage />);

    expect(
      await screen.findByText('VOD 목록을 불러오지 못했습니다.'),
    ).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('로그아웃은 서버에 로그인 쿠키 삭제를 요청한 뒤 /login 으로 보낸다 (LC-3515)', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse(200, VODS)) as unknown as typeof fetch;
    render(<VodListPage />);
    await screen.findByText('마케팅 취업 준비 101');

    fireEvent.click(screen.getByRole('button', { name: '로그아웃' }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/login'));
    expect(global.fetch).toHaveBeenCalledWith('/api/auth/logout', {
      method: 'POST',
    });
  });
});
