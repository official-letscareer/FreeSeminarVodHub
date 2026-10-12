/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const routerMock = { push: jest.fn() };
jest.mock('next/navigation', () => ({
  useRouter: () => routerMock,
}));

jest.mock('@/lib/usageLog', () => ({
  logUsage: jest.fn(),
  flushUsageLog: jest.fn(),
}));

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
jest.mock('@/components/video-player', () => ({
  __esModule: true,
  default: ({ youtubeId, vodId }: { youtubeId: string; vodId?: number }) => (
    <div data-testid="video-player" data-vod-id={vodId}>
      {youtubeId}
    </div>
  ),
}));

import { logUsage } from '@/lib/usageLog';
import VodListPage from '@/app/vod/page';
import VodPlayerClient from '@/app/vod/[id]/VodPlayerClient';

const mockLog = logUsage as jest.Mock;

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

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function types() {
  return mockLog.mock.calls.map(([event]) => event.type);
}

describe('이용 로그 화면 연결 (LC-3438)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.history.pushState({}, '', '/');
  });

  describe('VOD 목록', () => {
    it('목록이 열리면 page_view 를 기록하고 떠나면 page_leave 를 기록한다', async () => {
      window.history.pushState({}, '', '/vod');
      global.fetch = jest
        .fn()
        .mockResolvedValue(jsonResponse(200, [VOD])) as unknown as typeof fetch;

      const { unmount } = render(<VodListPage />);
      await screen.findByText('마케팅 취업 준비 101');

      expect(mockLog).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'page_view', pagePath: '/vod' }),
      );

      unmount();

      expect(mockLog).toHaveBeenLastCalledWith(
        expect.objectContaining({
          type: 'page_leave',
          pagePath: '/vod',
          detail: { dwell_sec: expect.any(Number) },
        }),
      );
    });
  });

  describe('VOD 재생 화면', () => {
    it('영상이 로드된 뒤 page_view 를 vodId 와 함께 기록하고 플레이어에 vodId 를 넘긴다', async () => {
      window.history.pushState({}, '', '/vod/7');
      global.fetch = jest
        .fn()
        .mockResolvedValue(jsonResponse(200, VOD)) as unknown as typeof fetch;

      render(<VodPlayerClient id="7" />);

      expect(await screen.findByTestId('video-player')).toHaveAttribute(
        'data-vod-id',
        '7',
      );
      expect(mockLog).toHaveBeenCalledWith({
        type: 'page_view',
        vodId: 7,
        pagePath: '/vod/7',
      });
    });

    it('이용권 안내 모달만 뜬 상태에서는 page_view 를 기록하지 않는다', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue(
          jsonResponse(403, INACTIVE_BODY),
        ) as unknown as typeof fetch;

      render(<VodPlayerClient id="7" />);
      await screen.findByRole('button', { name: '사용하기' });

      expect(types()).toEqual(['pass_prompt_shown']);
    });

    it('활성화에 성공하면 pass_activated 다음 영상이 로드되며 page_view 를 기록한다', async () => {
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
      await screen.findByTestId('video-player');

      expect(types()).toEqual([
        'pass_prompt_shown',
        'pass_activated',
        'page_view',
      ]);
    });
  });

  describe('이용권 활성화 모달', () => {
    it('목록에서 활성화가 409 로 실패하면 pass_activate_failed 에 상태 코드를 담는다', async () => {
      global.fetch = jest.fn((url: string) =>
        Promise.resolve(
          url === '/api/vod/pass/activate'
            ? jsonResponse(409, { message: '기간이 겹칩니다.' })
            : jsonResponse(403, INACTIVE_BODY),
        ),
      ) as unknown as typeof fetch;

      render(<VodListPage />);
      fireEvent.click(await screen.findByRole('button', { name: '사용하기' }));
      await screen.findByText('기간이 겹칩니다.');

      expect(mockLog).toHaveBeenCalledWith({
        type: 'pass_activate_failed',
        detail: { status: 409 },
      });
      expect(types()).not.toContain('pass_activated');
    });

    it('응답을 받지 못한 실패는 status 0 으로 남긴다', async () => {
      global.fetch = jest.fn((url: string) =>
        url === '/api/vod/pass/activate'
          ? Promise.reject(new Error('network'))
          : Promise.resolve(jsonResponse(403, INACTIVE_BODY)),
      ) as unknown as typeof fetch;

      render(<VodListPage />);
      fireEvent.click(await screen.findByRole('button', { name: '사용하기' }));

      await waitFor(() =>
        expect(mockLog).toHaveBeenCalledWith({
          type: 'pass_activate_failed',
          detail: { status: 0 },
        }),
      );
    });

    it('모달이 열릴 때마다 pass_prompt_shown 을 기록한다', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue(
          jsonResponse(403, INACTIVE_BODY),
        ) as unknown as typeof fetch;

      render(<VodListPage />);
      fireEvent.click(await screen.findByRole('button', { name: '나중에' }));
      fireEvent.click(
        await screen.findByRole('button', { name: '이용권 활성화하기' }),
      );
      await screen.findByRole('button', { name: '사용하기' });

      expect(types().filter((t) => t === 'pass_prompt_shown')).toHaveLength(2);
    });
  });
});
