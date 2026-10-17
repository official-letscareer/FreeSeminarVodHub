/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';

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
  });
});
