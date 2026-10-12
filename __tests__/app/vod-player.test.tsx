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

// 이 화면의 관심사는 조회와 이용권 안내다. YouTube IFrame API 와 배너 이미지는 끌어오지 않는다.
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

const INACTIVE_BODY = {
  code: 'VOD_PASS_INACTIVE',
  message: '활성화되지 않은 VOD 이용권이 있습니다.',
  pass: { applicationId: 123, durationDays: 30, expectedEndDate: '2026-11-11' },
  inactiveCount: 1,
};

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

const DIALOG_TITLE = '현재 보유 중인 이용권이 있습니다. 사용하시겠습니까?';

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

describe('VodPlayerClient — 비활성 이용권 안내 (LC-3438)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('직접 진입에서 403 VOD_PASS_INACTIVE 이면 /login 으로 보내지 않고 모달을 연다', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(403, INACTIVE_BODY),
      ) as unknown as typeof fetch;
    render(<VodPlayerClient id="7" />);

    expect(await screen.findByText(DIALOG_TITLE)).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith('/api/vod/7');
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('활성화에 성공하면 같은 VOD 를 다시 조회해 재생 화면을 보여준다', async () => {
    let vodCalls = 0;
    global.fetch = jest.fn((url: string) => {
      if (url === '/api/vod/pass/activate') {
        return Promise.resolve(jsonResponse(200, { startsAt: null }));
      }
      vodCalls += 1;
      return Promise.resolve(
        vodCalls === 1
          ? jsonResponse(403, INACTIVE_BODY)
          : jsonResponse(200, VOD),
      );
    }) as unknown as typeof fetch;
    render(<VodPlayerClient id="7" />);

    fireEvent.click(await screen.findByRole('button', { name: '사용하기' }));

    expect(await screen.findByText('마케팅 취업 준비 101')).toBeInTheDocument();
    expect(screen.getByTestId('video-player')).toHaveTextContent('abc123XYZ');
    expect(screen.queryByText(DIALOG_TITLE)).toBeNull();
    expect(global.fetch).toHaveBeenLastCalledWith('/api/vod/7');
    expect(vodCalls).toBe(2);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('나중에를 누르면 /vod 로 돌아간다', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(403, INACTIVE_BODY),
      ) as unknown as typeof fetch;
    render(<VodPlayerClient id="7" />);

    fireEvent.click(await screen.findByRole('button', { name: '나중에' }));

    expect(pushMock).toHaveBeenCalledWith('/vod');
  });

  it('401 이면 기존대로 /login 으로 보낸다', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(401, { message: '인증이 필요합니다.' }),
      ) as unknown as typeof fetch;
    render(<VodPlayerClient id="7" />);

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/login'));
    expect(screen.queryByText(DIALOG_TITLE)).toBeNull();
  });

  it('404 는 기존대로 존재하지 않는 VOD 문구를 보여준다', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(404, { message: 'VOD를 찾을 수 없습니다.' }),
      ) as unknown as typeof fetch;
    render(<VodPlayerClient id="7" />);

    expect(
      await screen.findByText('존재하지 않는 VOD입니다.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(DIALOG_TITLE)).toBeNull();
  });
});
