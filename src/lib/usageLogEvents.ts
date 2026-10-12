/**
 * VOD 이용 로그(LC-3438) 이벤트 정의와 입력 검증.
 *
 * 브라우저 큐(`usageLog.ts`)와 서버 라우트(`/api/vod/log`)가 함께 쓴다. 부수효과가 없는
 * 순수 모듈이다 — 서버는 `sanitizeUsageBatch` 로 본문을 검증하고, 이 목록 밖의 값은 버린다.
 */

export const USAGE_EVENT_TYPES = [
  'page_view',
  'page_leave',
  'video_ready',
  'video_play',
  'video_pause',
  'video_ended',
  'video_seek',
  'video_rate_change',
  'video_fullscreen',
  'video_progress',
  'video_leave',
  'pass_prompt_shown',
  'pass_activated',
  'pass_activate_failed',
] as const;

export type UsageEventType = (typeof USAGE_EVENT_TYPES)[number];

export type UsageDetailValue = string | number | boolean | null;
export type UsageDetail = Record<string, UsageDetailValue>;

/** 브라우저가 기록하는 이벤트. 시각·경로는 비우면 큐가 채운다. */
export interface UsageEventInput {
  type: UsageEventType;
  vodId?: number;
  youtubeId?: string;
  pagePath?: string;
  positionSec?: number;
  durationSec?: number;
  watchedSec?: number;
  detail?: UsageDetail;
  /** ISO 8601 */
  occurredAt?: string;
}

/** 검증을 통과한 이벤트. 비어 있는 값은 모두 null 이다. */
export interface UsageEvent {
  type: UsageEventType;
  vodId: number | null;
  youtubeId: string | null;
  pagePath: string | null;
  positionSec: number | null;
  durationSec: number | null;
  watchedSec: number | null;
  detail: UsageDetail;
  /** ISO 8601 */
  occurredAt: string;
}

export interface UsageBatch {
  sessionId: string;
  userName: string | null;
  userKey: string | null;
  events: UsageEvent[];
}

export const USAGE_LIMITS = {
  MAX_EVENTS: 50,
  SESSION_ID_MAX: 64,
  YOUTUBE_ID_MAX: 20,
  PAGE_PATH_MAX: 200,
  /** positionSec, durationSec, watchedSec 의 상한(24시간) */
  SECONDS_MAX: 86400,
  DETAIL_KEYS_MAX: 20,
  DETAIL_KEY_LENGTH_MAX: 50,
  DETAIL_STRING_MAX: 100,
  USER_NAME_MAX: 100,
  USER_KEY_MAX: 64,
  USER_AGENT_MAX: 200,
  /** occurredAt 이 서버 시각보다 이만큼 이전이면 서버 시각으로 대체한다 */
  OCCURRED_PAST_MS: 24 * 60 * 60 * 1000,
  /** occurredAt 이 서버 시각보다 이만큼 이후이면 서버 시각으로 대체한다 */
  OCCURRED_FUTURE_MS: 60 * 60 * 1000,
} as const;

const EVENT_TYPE_SET: ReadonlySet<string> = new Set(USAGE_EVENT_TYPES);

const REJECTED = Symbol('rejected');
type Rejected = typeof REJECTED;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAbsent(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

function readSeconds(value: unknown): number | null | Rejected {
  if (isAbsent(value)) return null;
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > USAGE_LIMITS.SECONDS_MAX
  ) {
    return REJECTED;
  }
  return Math.round(value * 10) / 10;
}

function readDetail(value: unknown): UsageDetail | Rejected {
  if (isAbsent(value)) return {};
  if (!isRecord(value)) return REJECTED;

  const keys = Object.keys(value);
  if (keys.length > USAGE_LIMITS.DETAIL_KEYS_MAX) return REJECTED;

  const detail: UsageDetail = {};
  for (const key of keys) {
    if (key.length > USAGE_LIMITS.DETAIL_KEY_LENGTH_MAX) return REJECTED;
    const item = value[key];
    const valid =
      item === null ||
      typeof item === 'boolean' ||
      (typeof item === 'number' && Number.isFinite(item)) ||
      (typeof item === 'string' &&
        item.length <= USAGE_LIMITS.DETAIL_STRING_MAX);
    if (!valid) return REJECTED;
    detail[key] = item as UsageDetailValue;
  }
  return detail;
}

/** 서버 시각 기준 허용 범위 밖이거나 읽을 수 없으면 서버 시각을 쓴다. */
function readOccurredAt(value: unknown, now: Date): string {
  const parsed =
    typeof value === 'string' || typeof value === 'number'
      ? new Date(value).getTime()
      : NaN;
  const nowMs = now.getTime();
  const inRange =
    Number.isFinite(parsed) &&
    parsed >= nowMs - USAGE_LIMITS.OCCURRED_PAST_MS &&
    parsed <= nowMs + USAGE_LIMITS.OCCURRED_FUTURE_MS;
  return new Date(inRange ? parsed : nowMs).toISOString();
}

function sanitizeEvent(raw: unknown, now: Date): UsageEvent | null {
  if (!isRecord(raw)) return null;

  const { type, vodId, youtubeId, pagePath } = raw;
  if (typeof type !== 'string' || !EVENT_TYPE_SET.has(type)) return null;

  if (
    !isAbsent(vodId) &&
    !(typeof vodId === 'number' && Number.isSafeInteger(vodId) && vodId > 0)
  ) {
    return null;
  }
  if (
    !isAbsent(youtubeId) &&
    !(
      typeof youtubeId === 'string' &&
      youtubeId.length > 0 &&
      youtubeId.length <= USAGE_LIMITS.YOUTUBE_ID_MAX
    )
  ) {
    return null;
  }
  if (
    !isAbsent(pagePath) &&
    !(
      typeof pagePath === 'string' &&
      pagePath.startsWith('/') &&
      pagePath.length <= USAGE_LIMITS.PAGE_PATH_MAX
    )
  ) {
    return null;
  }

  const positionSec = readSeconds(raw.positionSec);
  const durationSec = readSeconds(raw.durationSec);
  const watchedSec = readSeconds(raw.watchedSec);
  const detail = readDetail(raw.detail);
  if (
    positionSec === REJECTED ||
    durationSec === REJECTED ||
    watchedSec === REJECTED ||
    detail === REJECTED
  ) {
    return null;
  }

  return {
    type: type as UsageEventType,
    vodId: isAbsent(vodId) ? null : (vodId as number),
    youtubeId: isAbsent(youtubeId) ? null : (youtubeId as string),
    pagePath: isAbsent(pagePath) ? null : (pagePath as string),
    positionSec,
    durationSec,
    watchedSec,
    detail,
    occurredAt: readOccurredAt(raw.occurredAt, now),
  };
}

/**
 * `POST /api/vod/log` 본문을 검증한다.
 *
 * 규칙을 어긴 이벤트는 버리고 나머지는 남긴다. 배치 자체가 틀렸거나(세션 ID, 이벤트 개수,
 * 이름·키 길이) 남는 이벤트가 하나도 없으면 null 이다.
 *
 * @param now 테스트가 시각을 고정할 때만 넘긴다.
 */
export function sanitizeUsageBatch(
  raw: unknown,
  now: Date = new Date(),
): UsageBatch | null {
  if (!isRecord(raw)) return null;

  const { sessionId, userName, userKey, events } = raw;

  if (
    typeof sessionId !== 'string' ||
    sessionId.length < 1 ||
    sessionId.length > USAGE_LIMITS.SESSION_ID_MAX
  ) {
    return null;
  }
  if (
    !Array.isArray(events) ||
    events.length < 1 ||
    events.length > USAGE_LIMITS.MAX_EVENTS
  ) {
    return null;
  }
  if (
    !isAbsent(userName) &&
    !(
      typeof userName === 'string' &&
      userName.length <= USAGE_LIMITS.USER_NAME_MAX
    )
  ) {
    return null;
  }
  if (
    !isAbsent(userKey) &&
    !(
      typeof userKey === 'string' && userKey.length <= USAGE_LIMITS.USER_KEY_MAX
    )
  ) {
    return null;
  }

  const valid: UsageEvent[] = [];
  for (const item of events) {
    const event = sanitizeEvent(item, now);
    if (event) valid.push(event);
  }
  if (valid.length === 0) return null;

  return {
    sessionId,
    userName: userName || null,
    userKey: userKey || null,
    events: valid,
  };
}
