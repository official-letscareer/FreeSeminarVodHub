'use client';

import { useCallback, useEffect, useRef } from 'react';
import { flushUsageLog, logUsage } from './usageLog';
import type { UsageEventInput } from './usageLogEvents';

const PROGRESS_INTERVAL_MS = 30_000;
/** 슬라이더를 끄는 동안 쏟아지는 변경을 하나의 이동으로 묶는 대기 시간 */
const SCRUB_SETTLE_MS = 500;

const STATE_ENDED = 0;
const STATE_PLAYING = 1;
const STATE_PAUSED = 2;

interface Source {
  vodId?: number;
  youtubeId: string;
  /** 현재 재생 위치(초). 읽을 수 없으면 undefined */
  readPosition: () => number | undefined;
  readDuration: () => number | undefined;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function safeRead(read: () => number | undefined): number | undefined {
  try {
    const value = read();
    return typeof value === 'number' && Number.isFinite(value)
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}

/** 로그 기록 실패가 재생 컨트롤로 번지지 않게 한다. */
function attempt(fn: () => void): void {
  try {
    fn();
  } catch {
    // 이용 로그는 부가 기능이다.
  }
}

/**
 * 영상 플레이어의 이용 로그(LC-3438).
 *
 * 누적 시청 시간(`watchedSec`)은 재생 상태(YouTube state 1)로 있었던 실제 경과 시간의 합이다.
 * 재생 위치의 차이로 계산하지 않으므로 건너뛰기·되감기는 들어가지 않는다.
 *
 * 이 훅은 플레이어 초기화 효과보다 먼저 호출해야 한다. 언마운트 때 이 훅의 정리가 먼저
 * 돌아야 플레이어가 파괴되기 전에 마지막 위치를 읽을 수 있다.
 */
export function useVideoUsageLog(source: Source) {
  const sourceRef = useRef(source);
  const watchedMsRef = useRef(0);
  const playingSinceRef = useRef<number | null>(null);
  // 사용자가 재생한 상태인지. 버퍼링 뒤 다시 오는 state 1 을 video_play 로 세지 않기 위함이다.
  const playLoggedRef = useRef(false);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrubRef = useRef<{
    from: number | undefined;
    to: number;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  const leftRef = useRef(false);

  useEffect(() => {
    sourceRef.current = source;
  });

  const watchedSec = useCallback((): number => {
    const since = playingSinceRef.current;
    const running = since === null ? 0 : Date.now() - since;
    return round1((watchedMsRef.current + running) / 1000);
  }, []);

  const emit = useCallback(
    (type: UsageEventInput['type'], extra: Partial<UsageEventInput> = {}) => {
      const { vodId, youtubeId, readPosition, readDuration } =
        sourceRef.current;
      logUsage({
        type,
        vodId,
        youtubeId,
        positionSec: safeRead(readPosition),
        durationSec: safeRead(readDuration),
        watchedSec: watchedSec(),
        ...extra,
      });
    },
    [watchedSec],
  );

  const stopWatching = useCallback(() => {
    const since = playingSinceRef.current;
    if (since !== null) {
      watchedMsRef.current += Date.now() - since;
      playingSinceRef.current = null;
    }
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  }, []);

  const flushScrub = useCallback(() => {
    const pending = scrubRef.current;
    if (!pending) return;
    clearTimeout(pending.timer);
    scrubRef.current = null;
    emit('video_seek', {
      positionSec: pending.to,
      detail: {
        from_sec: pending.from === undefined ? null : round1(pending.from),
        to_sec: round1(pending.to),
        method: 'scrub',
      },
    });
  }, [emit]);

  const logReady = useCallback(() => {
    attempt(() => emit('video_ready'));
  }, [emit]);

  const logState = useCallback(
    (state: number) => {
      attempt(() => {
        if (state === STATE_PLAYING) {
          if (playingSinceRef.current === null) {
            playingSinceRef.current = Date.now();
          }
          if (!progressTimerRef.current) {
            progressTimerRef.current = setInterval(
              () => attempt(() => emit('video_progress')),
              PROGRESS_INTERVAL_MS,
            );
          }
          if (!playLoggedRef.current) {
            playLoggedRef.current = true;
            emit('video_play');
          }
          return;
        }

        // 일시정지·종료·버퍼링 모두 재생 시간 누적은 멈춘다. 기록하는 것은 앞의 둘뿐이다.
        stopWatching();
        if (state === STATE_PAUSED) {
          playLoggedRef.current = false;
          emit('video_pause');
        } else if (state === STATE_ENDED) {
          playLoggedRef.current = false;
          emit('video_ended');
        }
      });
    },
    [emit, stopWatching],
  );

  const logSkip = useCallback(
    (from: number, to: number) => {
      attempt(() =>
        emit('video_seek', {
          positionSec: to,
          detail: {
            from_sec: round1(from),
            to_sec: round1(to),
            method: 'skip',
          },
        }),
      );
    },
    [emit],
  );

  /** 슬라이더 이동. 끌고 있는 동안의 변경은 하나로 묶어 마지막 위치만 기록한다. */
  const logScrub = useCallback(
    (to: number) => {
      attempt(() => {
        const pending = scrubRef.current;
        if (pending) clearTimeout(pending.timer);
        scrubRef.current = {
          from: pending
            ? pending.from
            : safeRead(sourceRef.current.readPosition),
          to,
          timer: setTimeout(() => attempt(flushScrub), SCRUB_SETTLE_MS),
        };
      });
    },
    [flushScrub],
  );

  const logRate = useCallback(
    (rate: number) => {
      attempt(() => emit('video_rate_change', { detail: { rate } }));
    },
    [emit],
  );

  const logFullscreen = useCallback(
    (on: boolean) => {
      attempt(() => emit('video_fullscreen', { detail: { on } }));
    },
    [emit],
  );

  const { youtubeId } = source;
  useEffect(() => {
    // 영상이 바뀌면 이전 영상은 떠난 것이다. 새 영상은 처음부터 센다.
    watchedMsRef.current = 0;
    playingSinceRef.current = null;
    playLoggedRef.current = false;
    leftRef.current = false;

    const leave = () =>
      attempt(() => {
        if (leftRef.current) return;
        leftRef.current = true;
        flushScrub();
        stopWatching();
        emit('video_leave');
      });
    const handlePageHide = () => {
      leave();
      void flushUsageLog({ beacon: true });
    };

    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      leave();
    };
  }, [youtubeId, emit, flushScrub, stopWatching]);

  return { logReady, logState, logSkip, logScrub, logRate, logFullscreen };
}
