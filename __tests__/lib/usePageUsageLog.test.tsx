/** @jest-environment jsdom */
import { renderHook } from '@testing-library/react';

jest.mock('@/lib/usageLog', () => ({
  logUsage: jest.fn(),
  flushUsageLog: jest.fn(),
}));

import { flushUsageLog, logUsage } from '@/lib/usageLog';
import { usePageUsageLog } from '@/lib/usePageUsageLog';

const mockLog = logUsage as jest.Mock;
const mockFlush = flushUsageLog as jest.Mock;

function types() {
  return mockLog.mock.calls.map(([event]) => event.type);
}

describe('usePageUsageLog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    window.history.pushState({}, '', '/vod/7');
    sessionStorage.clear();
  });

  afterEach(() => jest.useRealTimers());

  it('마운트하면 page_view 를 기록한다', () => {
    renderHook(() => usePageUsageLog({ enabled: true, vodId: 7 }));

    expect(mockLog).toHaveBeenCalledTimes(1);
    expect(mockLog).toHaveBeenCalledWith({
      type: 'page_view',
      vodId: 7,
      pagePath: '/vod/7',
      detail: { from: '' },
    });
  });

  it('언마운트하면 머문 시간과 함께 page_leave 를 기록한다', () => {
    const { unmount } = renderHook(() =>
      usePageUsageLog({ enabled: true, vodId: 7 }),
    );

    jest.advanceTimersByTime(12_400);
    unmount();

    expect(mockLog).toHaveBeenLastCalledWith({
      type: 'page_leave',
      vodId: 7,
      pagePath: '/vod/7',
      detail: { dwell_sec: 12 },
    });
  });

  it('pagehide 에서 page_leave 를 기록하고 큐를 beacon 으로 비운다', () => {
    renderHook(() => usePageUsageLog({ enabled: true }));

    window.dispatchEvent(new Event('pagehide'));

    expect(types()).toEqual(['page_view', 'page_leave']);
    expect(mockFlush).toHaveBeenCalledWith({ beacon: true });
  });

  it('pagehide 뒤 언마운트해도 page_leave 는 한 번만 나간다', () => {
    const { unmount } = renderHook(() => usePageUsageLog({ enabled: true }));

    window.dispatchEvent(new Event('pagehide'));
    unmount();

    expect(types().filter((type) => type === 'page_leave')).toHaveLength(1);
  });

  it('언마운트 시점에 주소가 바뀌어 있어도 마운트 때의 경로로 기록한다', () => {
    const { unmount } = renderHook(() => usePageUsageLog({ enabled: true }));

    window.history.pushState({}, '', '/vod');
    unmount();

    expect(mockLog).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'page_leave', pagePath: '/vod/7' }),
    );
  });

  it('enabled 가 false 이면 아무것도 기록하지 않고, 켜지는 순간 page_view 를 기록한다', () => {
    const { rerender, unmount } = renderHook(
      ({ enabled }) => usePageUsageLog({ enabled }),
      { initialProps: { enabled: false } },
    );

    window.dispatchEvent(new Event('pagehide'));
    expect(mockLog).not.toHaveBeenCalled();

    rerender({ enabled: true });
    expect(types()).toEqual(['page_view']);

    unmount();
    expect(types()).toEqual(['page_view', 'page_leave']);
  });
});
