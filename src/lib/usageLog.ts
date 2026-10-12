'use client';

import { USAGE_LIMITS, type UsageEventInput } from './usageLogEvents';

/**
 * VOD 이용 로그(LC-3438) 브라우저 큐.
 *
 * 이벤트를 모아 `POST /api/vod/log` 로 보낸다. 로그는 부가 기능이라 어떤 실패도 화면 밖으로
 * 내보내지 않고, 재시도하지 않는다. 이 파일의 공개 함수는 예외를 던지지 않는다.
 *
 * 본문은 `{ sessionId, events }` 뿐이다. 이름·전화번호·키 같은 식별 정보는 보내지 않는다.
 * 서버가 쿠키와 SSO 프로필에서 직접 만든다.
 */

const ENDPOINT = '/api/vod/log';
const FLUSH_DELAY_MS = 5000;
const FLUSH_BATCH_SIZE = 20;
const SESSION_ID_STORAGE_KEY = 'vod_usage_session_id';

interface QueuedEvent extends UsageEventInput {
  occurredAt: string;
}

let queue: QueuedEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let listenersAttached = false;
let memorySessionId: string | null = null;

// ─── 세션 ID ─────────────────────────────────────────────────────────────────
function createId(): string {
  try {
    if (
      typeof crypto !== 'undefined' &&
      typeof crypto.randomUUID === 'function'
    ) {
      return crypto.randomUUID();
    }
  } catch {
    // 아래 대체 값을 쓴다.
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function getSessionId(): string {
  try {
    const stored = sessionStorage.getItem(SESSION_ID_STORAGE_KEY);
    if (stored) return stored;
    const id = createId();
    sessionStorage.setItem(SESSION_ID_STORAGE_KEY, id);
    return id;
  } catch {
    // sessionStorage 를 쓸 수 없으면 이 탭의 메모리 값을 쓴다.
    memorySessionId ??= createId();
    return memorySessionId;
  }
}

// ─── 전송 ────────────────────────────────────────────────────────────────────
function toBodies(events: QueuedEvent[]): string[] {
  const sessionId = getSessionId();
  const bodies: string[] = [];
  for (let i = 0; i < events.length; i += USAGE_LIMITS.MAX_EVENTS) {
    bodies.push(
      JSON.stringify({
        sessionId,
        events: events.slice(i, i + USAGE_LIMITS.MAX_EVENTS),
      }),
    );
  }
  return bodies;
}

function clearTimer(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

function attachListeners(): void {
  if (listenersAttached) return;
  listenersAttached = true;
  window.addEventListener('pagehide', () => {
    void flushUsageLog({ beacon: true });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      void flushUsageLog({ beacon: true });
    }
  });
}

/**
 * 쌓인 이벤트를 바로 보낸다. 실패는 버린다.
 *
 * `beacon` 은 페이지를 떠나는 중일 때 쓴다. 응답을 기다릴 수 없어 `sendBeacon` 으로 보낸다.
 */
export async function flushUsageLog(
  options: { beacon?: boolean } = {},
): Promise<void> {
  try {
    clearTimer();
    if (queue.length === 0) return;
    const events = queue;
    queue = [];

    if (options.beacon) {
      for (const body of toBodies(events)) {
        navigator.sendBeacon(
          ENDPOINT,
          new Blob([body], { type: 'application/json' }),
        );
      }
      return;
    }

    await Promise.all(
      toBodies(events).map((body) =>
        fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          keepalive: true,
        }),
      ),
    );
  } catch {
    // 로그는 재생에 영향을 주지 않는다. 실패한 이벤트는 다시 보내지 않는다.
  }
}

/** 이벤트를 큐에 쌓는다. 5초 뒤 또는 20개가 되면 보낸다. 예외를 던지지 않는다. */
export function logUsage(event: UsageEventInput): void {
  try {
    if (typeof window === 'undefined') return;
    attachListeners();

    queue.push({
      ...event,
      pagePath: event.pagePath ?? window.location.pathname,
      occurredAt: event.occurredAt ?? new Date().toISOString(),
    });

    if (queue.length >= FLUSH_BATCH_SIZE) {
      void flushUsageLog();
    } else if (!timer) {
      timer = setTimeout(() => {
        timer = null;
        void flushUsageLog();
      }, FLUSH_DELAY_MS);
    }
  } catch {
    // 로그 기록 실패는 호출한 화면에 알리지 않는다.
  }
}
