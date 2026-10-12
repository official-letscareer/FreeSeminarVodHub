/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';

jest.mock('@/lib/usageLog', () => ({
  logUsage: jest.fn(),
  flushUsageLog: jest.fn(),
}));

import { flushUsageLog, logUsage } from '@/lib/usageLog';
import VideoPlayer from '@/components/video-player';

const mockLog = logUsage as jest.Mock;
const mockFlush = flushUsageLog as jest.Mock;

interface PlayerEvents {
  onReady: () => void;
  onStateChange: (e: { data: number }) => void;
}

let events: PlayerEvents;
let position = 0;
let destroy: jest.Mock;
let seekTo: jest.Mock;

class FakePlayer {
  constructor(_el: HTMLElement, options: { events: PlayerEvents }) {
    events = options.events;
  }
  playVideo = jest.fn();
  pauseVideo = jest.fn();
  seekTo = (...args: unknown[]) => seekTo(...args);
  setPlaybackRate = jest.fn();
  getCurrentTime = () => position;
  getDuration = () => 600;
  destroy = () => destroy();
}

function loggedEvents() {
  return mockLog.mock.calls.map(([event]) => event);
}

function ofType(type: string) {
  return loggedEvents().filter((event) => event.type === type);
}

function setState(state: number) {
  act(() => events.onStateChange({ data: state }));
}

function renderPlayer() {
  const view = render(<VideoPlayer youtubeId="yt-abc" vodId={7} />);
  act(() => events.onReady());
  return view;
}

describe('VideoPlayer 이용 로그 (LC-3438)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLog.mockReset();
    jest.useFakeTimers();
    position = 0;
    destroy = jest.fn();
    seekTo = jest.fn();
    (window as unknown as { YT: unknown }).YT = { Player: FakePlayer };
  });

  afterEach(() => {
    jest.useRealTimers();
    delete (window as unknown as { YT?: unknown }).YT;
  });

  it('준비되면 video_ready 를 vodId, youtubeId, 길이와 함께 기록한다', () => {
    renderPlayer();

    expect(ofType('video_ready')).toEqual([
      expect.objectContaining({
        vodId: 7,
        youtubeId: 'yt-abc',
        positionSec: 0,
        durationSec: 600,
      }),
    ]);
  });

  describe('재생 상태', () => {
    it('1 은 video_play, 2 는 video_pause, 0 은 video_ended 이다', () => {
      renderPlayer();
      position = 12;

      setState(1);
      position = 30;
      setState(2);
      setState(1);
      position = 600;
      setState(0);

      expect(
        loggedEvents()
          .filter(
            (event) =>
              event.type.startsWith('video_') && event.type !== 'video_ready',
          )
          .map((event) => event.type),
      ).toEqual(['video_play', 'video_pause', 'video_play', 'video_ended']);
      expect(ofType('video_play')[0]).toMatchObject({
        vodId: 7,
        youtubeId: 'yt-abc',
        positionSec: 12,
        durationSec: 600,
      });
      expect(ofType('video_pause')[0]).toMatchObject({ positionSec: 30 });
      expect(ofType('video_ended')[0]).toMatchObject({ positionSec: 600 });
    });

    it('버퍼링(3)과 그 밖의 상태는 기록하지 않고, 버퍼링 뒤 재개를 다시 재생으로 세지 않는다', () => {
      renderPlayer();

      setState(3);
      setState(1);
      setState(3);
      setState(1);
      setState(-1);
      setState(5);

      expect(ofType('video_play')).toHaveLength(1);
      expect(ofType('video_pause')).toHaveLength(0);
      expect(ofType('video_ended')).toHaveLength(0);
    });
  });

  describe('누적 시청 시간', () => {
    it('재생 상태로 있었던 시간만 더하고 멈춘 시간과 위치 이동은 더하지 않는다', () => {
      const { unmount } = renderPlayer();

      setState(1);
      act(() => {
        jest.advanceTimersByTime(10_000);
      });
      position = 10;
      setState(2);
      expect(ofType('video_pause')[0].watchedSec).toBe(10);

      // 멈춰 있던 20초는 세지 않는다.
      act(() => {
        jest.advanceTimersByTime(20_000);
      });
      position = 500; // 위치가 크게 달라져도 시청 시간과 무관하다.
      setState(1);
      act(() => {
        jest.advanceTimersByTime(5_000);
      });
      position = 505;
      unmount();

      expect(ofType('video_leave')).toEqual([
        expect.objectContaining({
          vodId: 7,
          youtubeId: 'yt-abc',
          positionSec: 505,
          durationSec: 600,
          watchedSec: 15,
        }),
      ]);
    });

    it('버퍼링 시간은 세지 않는다', () => {
      renderPlayer();

      setState(1);
      act(() => {
        jest.advanceTimersByTime(4_000);
      });
      setState(3);
      act(() => {
        jest.advanceTimersByTime(6_000);
      });
      setState(1);
      act(() => {
        jest.advanceTimersByTime(2_000);
      });
      setState(2);

      expect(ofType('video_pause')[0].watchedSec).toBe(6);
    });

    it('재생 중에는 30초마다 video_progress 를 남기고 멈추면 그친다', () => {
      renderPlayer();

      setState(1);
      act(() => {
        jest.advanceTimersByTime(29_999);
      });
      expect(ofType('video_progress')).toHaveLength(0);

      act(() => {
        jest.advanceTimersByTime(1);
      });
      expect(ofType('video_progress')).toHaveLength(1);
      expect(ofType('video_progress')[0]).toMatchObject({
        vodId: 7,
        watchedSec: 30,
        durationSec: 600,
      });

      act(() => {
        jest.advanceTimersByTime(30_000);
      });
      expect(ofType('video_progress')).toHaveLength(2);
      expect(ofType('video_progress')[1].watchedSec).toBe(60);

      setState(2);
      act(() => {
        jest.advanceTimersByTime(120_000);
      });
      expect(ofType('video_progress')).toHaveLength(2);
    });
  });

  describe('컨트롤', () => {
    it('10초 건너뛰기는 from_sec, to_sec, method=skip 으로 기록하고 시청 시간은 늘리지 않는다', () => {
      renderPlayer();
      position = 100;

      fireEvent.click(screen.getByTitle('+10초'));

      expect(seekTo).toHaveBeenCalledWith(110, true);
      expect(ofType('video_seek')).toEqual([
        expect.objectContaining({
          vodId: 7,
          youtubeId: 'yt-abc',
          detail: { from_sec: 100, to_sec: 110, method: 'skip' },
          watchedSec: 0,
        }),
      ]);
    });

    it('되감기는 0 아래로 내려가지 않는다', () => {
      renderPlayer();
      position = 4;

      fireEvent.click(screen.getByTitle('-10초'));

      expect(seekTo).toHaveBeenCalledWith(0, true);
      expect(ofType('video_seek')[0].detail).toEqual({
        from_sec: 4,
        to_sec: 0,
        method: 'skip',
      });
    });

    it('슬라이더를 끄는 동안의 변경은 하나의 video_seek(scrub)로 묶는다', () => {
      renderPlayer();
      position = 50;
      const slider = screen.getByRole('slider');

      fireEvent.change(slider, { target: { value: '60' } });
      position = 60;
      act(() => {
        jest.advanceTimersByTime(200);
      });
      fireEvent.change(slider, { target: { value: '90' } });
      expect(ofType('video_seek')).toHaveLength(0);
      expect(seekTo).toHaveBeenCalledTimes(2);

      act(() => {
        jest.advanceTimersByTime(500);
      });

      expect(ofType('video_seek')).toEqual([
        expect.objectContaining({
          positionSec: 90,
          detail: { from_sec: 50, to_sec: 90, method: 'scrub' },
        }),
      ]);
    });

    it('배속을 바꾸면 video_rate_change 를 기록한다', () => {
      renderPlayer();

      fireEvent.click(screen.getByRole('button', { name: '1.5x' }));

      expect(ofType('video_rate_change')).toEqual([
        expect.objectContaining({ vodId: 7, detail: { rate: 1.5 } }),
      ]);
    });

    it('전체화면 전환을 video_fullscreen 으로 기록한다', () => {
      renderPlayer();

      Object.defineProperty(document, 'fullscreenElement', {
        value: document.body,
        configurable: true,
      });
      act(() => {
        document.dispatchEvent(new Event('fullscreenchange'));
      });
      Object.defineProperty(document, 'fullscreenElement', {
        value: null,
        configurable: true,
      });
      act(() => {
        document.dispatchEvent(new Event('fullscreenchange'));
      });

      expect(ofType('video_fullscreen').map((e) => e.detail)).toEqual([
        { on: true },
        { on: false },
      ]);
    });
  });

  describe('떠날 때', () => {
    it('언마운트하면 플레이어를 파괴하기 전에 video_leave 를 기록한다', () => {
      const { unmount } = renderPlayer();
      position = 77;

      unmount();

      expect(ofType('video_leave')).toHaveLength(1);
      expect(ofType('video_leave')[0].positionSec).toBe(77);
      const leaveOrder = mockLog.mock.invocationCallOrder.at(-1)!;
      expect(leaveOrder).toBeLessThan(destroy.mock.invocationCallOrder[0]);
      expect(destroy).toHaveBeenCalledTimes(1);
    });

    it('pagehide 에서 video_leave 를 기록하고 beacon 으로 비우며, 이후 언마운트는 다시 기록하지 않는다', () => {
      const { unmount } = renderPlayer();
      setState(1);
      act(() => {
        jest.advanceTimersByTime(8_000);
      });

      act(() => {
        window.dispatchEvent(new Event('pagehide'));
      });
      unmount();

      expect(ofType('video_leave')).toHaveLength(1);
      expect(ofType('video_leave')[0].watchedSec).toBe(8);
      expect(mockFlush).toHaveBeenCalledWith({ beacon: true });
    });

    it('떠난 뒤에는 진행 기록이 계속 나가지 않는다', () => {
      const { unmount } = renderPlayer();
      setState(1);

      unmount();
      act(() => {
        jest.advanceTimersByTime(120_000);
      });

      expect(ofType('video_progress')).toHaveLength(0);
    });
  });

  describe('기존 동작', () => {
    it('로그 기록이 던져도 컨트롤은 그대로 동작한다', () => {
      mockLog.mockImplementation(() => {
        throw new Error('log failed');
      });
      renderPlayer();
      position = 20;

      expect(() => fireEvent.click(screen.getByTitle('+10초'))).not.toThrow();
      expect(() => setState(1)).not.toThrow();
      expect(seekTo).toHaveBeenCalledWith(30, true);
    });

    it('vodId 없이도 렌더되고 기록한다', () => {
      render(<VideoPlayer youtubeId="yt-abc" />);
      act(() => events.onReady());

      expect(ofType('video_ready')[0]).toMatchObject({ youtubeId: 'yt-abc' });
      expect(ofType('video_ready')[0].vodId).toBeUndefined();
    });
  });
});
