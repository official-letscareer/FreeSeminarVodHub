'use client';

import { getSession } from './auth';
import { USAGE_LIMITS, type UsageEventInput } from './usageLogEvents';

/**
 * VOD 이용 로그(LC-3438) 브라우저 큐.
 *
 * 이벤트를 모아 `POST /api/vod/log` 로 보낸다. 로그는 부가 기능이라 어떤 실패도 화면 밖으로
 * 내보내지 않고, 재시도하지 않는다. 이 파일의 공개 함수는 예외를 던지지 않는다.
 */

const ENDPOINT = '/api/vod/log';
const FLUSH_DELAY_MS = 5000;
const FLUSH_BATCH_SIZE = 20;
const SESSION_ID_STORAGE_KEY = 'vod_usage_session_id';

interface QueuedEvent extends UsageEventInput {
  occurredAt: string;
}

interface Identity {
  userName: string | null;
  userKey: string | null;
}

interface ResolvedIdentity extends Identity {
  /** `${이름}:${전화번호}`. 같은 로그인 세션인지 비교하는 데만 쓰고 서버로 보내지 않는다. */
  source: string;
}

const NO_IDENTITY: Identity = { userName: null, userKey: null };

let queue: QueuedEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let listenersAttached = false;
let memorySessionId: string | null = null;
let resolvedIdentity: ResolvedIdentity | null = null;
let pendingIdentity: {
  source: string;
  promise: Promise<ResolvedIdentity>;
} | null = null;

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

// ─── 식별 ────────────────────────────────────────────────────────────────────
async function sha256Hex(text: string): Promise<string | null> {
  try {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) return null;
    const digest = await subtle.digest(
      'SHA-256',
      new TextEncoder().encode(text),
    );
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return null;
  }
}

function readLoginSession(): { name: string; source: string } | null {
  try {
    const session = getSession();
    if (!session || typeof session.name !== 'string' || !session.name) {
      return null;
    }
    return {
      name: session.name,
      source: `${session.name}:${session.phoneNum}`,
    };
  } catch {
    return null;
  }
}

/**
 * 이름+전화번호 로그인 세션이 있으면 이름과 해시를 만든다. 같은 세션이면 한 번만 계산한다.
 * 전화번호 원문은 해시 입력으로만 쓰고 반환값에 담지 않는다. SSO 사용자는 이 세션이
 * 없고, 서버가 SSO 프로필에서 직접 식별한다.
 */
function prepareIdentity(): Promise<Identity> {
  const session = readLoginSession();
  if (!session) return Promise.resolve(NO_IDENTITY);
  if (resolvedIdentity?.source === session.source) {
    return Promise.resolve(resolvedIdentity);
  }
  if (pendingIdentity?.source === session.source)
    return pendingIdentity.promise;

  const promise = sha256Hex(session.source).then((userKey) => {
    const next = { source: session.source, userName: session.name, userKey };
    resolvedIdentity = next;
    return next;
  });
  pendingIdentity = { source: session.source, promise };
  return promise;
}

/** beacon 경로용. 기다릴 수 없으므로 이미 계산된 해시만 쓴다. */
function peekIdentity(): Identity {
  const session = readLoginSession();
  if (!session) return NO_IDENTITY;
  return {
    userName: session.name,
    userKey:
      resolvedIdentity?.source === session.source
        ? resolvedIdentity.userKey
        : null,
  };
}

// ─── 전송 ────────────────────────────────────────────────────────────────────
function toBodies(events: QueuedEvent[], identity: Identity): string[] {
  const sessionId = getSessionId();
  const bodies: string[] = [];
  for (let i = 0; i < events.length; i += USAGE_LIMITS.MAX_EVENTS) {
    bodies.push(
      JSON.stringify({
        sessionId,
        userName: identity.userName,
        userKey: identity.userKey,
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
 * `beacon` 은 페이지를 떠나는 중일 때 쓴다. 응답을 기다릴 수 없어 `sendBeacon` 으로 보내고,
 * 식별도 이미 계산된 값만 쓴다.
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
      for (const body of toBodies(events, peekIdentity())) {
        navigator.sendBeacon(
          ENDPOINT,
          new Blob([body], { type: 'application/json' }),
        );
      }
      return;
    }

    const identity = await prepareIdentity();
    await Promise.all(
      toBodies(events, identity).map((body) =>
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
    // 첫 호출에서 해시 계산을 시작해 두면 pagehide 때 이미 값이 있다.
    void prepareIdentity();

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
