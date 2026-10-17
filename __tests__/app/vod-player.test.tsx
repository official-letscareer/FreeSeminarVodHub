/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';

const pushMock = jest.fn();
// 실제 useRouter 처럼 렌더마다 같은 객체를 돌려준다. 새 객체를 주면 router 를 의존성으로 둔
// 조회 효과가 렌더마다 다시 돈다.
const routerMock = { push: pushMock };
jest.mock('next/navigation', () => ({
  useRouter: () => routerMock,
}));

// 이 화면의 관심사는 조회와 접근 거절 처리다. YouTube IFrame API 와 배너 이미지는 끌어오지 않는다.
jest.mock('@/components/banner-carousel', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/components/video-player', () => ({
  __esModule: true,
  default: ({ youtubeId }: { youtubeId: string }) => (
    <div data-testid="video-player">{youtubeId}</div>
  ),
}));

import VodPlayerClient from '@/app/vod/[id]/VodPlayerClient';

const VOD = {
  id: 7,
  title: '마케팅 취업 준비 101',
  youtubeId: 'abc123XYZ',
  description: '',
  publishedAt: null,
  order: 1,
  embedEnabled: true,
  createdAt: '2024-01-01',
};

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

describe('VodPlayerClient — 조회와 접근 처리', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('조회에 성공하면 재생 화면을 보여주고 활성화 안내는 없다', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse(200, VOD)) as unknown as typeof fetch;
    render(<VodPlayerClient id="7" />);

    expect(await screen.findByText('마케팅 취업 준비 101')).toBeInTheDocument();
    expect(screen.getByTestId('video-player')).toHaveTextContent('abc123XYZ');
    expect(screen.queryByText(/활성화/)).toBeNull();
    expect(global.fetch).toHaveBeenCalledWith('/api/vod/7');
  });

  it('401 이면 /login 으로 보낸다', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(401, { message: '인증이 필요합니다.' }),
      ) as unknown as typeof fetch;
    render(<VodPlayerClient id="7" />);

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/login'));
  });

  it('404 는 존재하지 않는 VOD 문구를 보여준다', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(404, { message: 'VOD를 찾을 수 없습니다.' }),
      ) as unknown as typeof fetch;
    render(<VodPlayerClient id="7" />);

    expect(
      await screen.findByText('존재하지 않는 VOD입니다.'),
    ).toBeInTheDocument();
  });
});
