/**
 * VOD 이용 로그 어드민 조회(LC-3438)의 타입, 오류, 반환값 파싱, 이벤트 라벨.
 *
 * 서버(`kv.ts`, `/api/admin/usage-logs`)와 화면(`/admin/vod/usage`)이 함께 쓴다. 부수효과도, Supabase
 * 의존도 없는 순수 모듈이라 클라이언트 번들에 넣어도 된다. 어떤 값도 토큰을 다루지 않는다.
 */
import type { UsageEventType } from './usageLogEvents';

// ─── 오류 ────────────────────────────────────────────────────────────────────
/** 환경변수 USAGE_LOG_READ_TOKEN 이 없다. */
export class UsageLogNotConfiguredError extends Error {
  constructor() {
    super('이용 로그 조회 토큰이 설정되지 않았습니다.');
    this.name = 'UsageLogNotConfiguredError';
  }
}

/** DB 가 토큰을 거절했다(SQLSTATE 42501). 환경변수의 토큰과 DB 에 등록한 해시가 다르다. */
export class UsageLogForbiddenError extends Error {
  constructor() {
    super('이용 로그 조회 토큰이 거절되었습니다.');
    this.name = 'UsageLogForbiddenError';
  }
}

/** 그 밖의 RPC 오류. 원문은 담지 않고 SQLSTATE 코드만 남긴다. */
export class UsageLogQueryError extends Error {
  readonly code: string | null;

  constructor(code: string | null) {
    super('이용 로그를 조회하지 못했습니다.');
    this.name = 'UsageLogQueryError';
    this.code = code;
  }
}

/**
 * 관리자 세션 서명 비밀키(ADMIN_SESSION_SECRET)가 없을 때 라우트가 503 으로 돌려주는 문구.
 * 화면이 토큰 미설정 503 과 구분하는 기준이라 라우트와 화면이 같은 값을 쓴다.
 */
export const ADMIN_SESSION_NOT_CONFIGURED_MESSAGE =
  '관리자 세션 비밀키가 설정되지 않았습니다.';

// ─── 범위 보정 ───────────────────────────────────────────────────────────────
export const USAGE_ADMIN_LIMITS = {
  DAYS_MIN: 1,
  DAYS_MAX: 180,
  DAYS_DEFAULT: 30,
  LIMIT_MIN: 1,
  LIMIT_MAX: 200,
  LIMIT_DEFAULT: 100,
} as const;

/** 정수로 읽어 [min, max] 로 자른다. 비어 있거나 숫자가 아니면 fallback 이다. */
export function clampInt(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string' && value.trim() === '') return fallback;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

export function clampUsageDays(value: unknown): number {
  return clampInt(
    value,
    USAGE_ADMIN_LIMITS.DAYS_MIN,
    USAGE_ADMIN_LIMITS.DAYS_MAX,
    USAGE_ADMIN_LIMITS.DAYS_DEFAULT,
  );
}

export function clampUsageLimit(value: unknown): number {
  return clampInt(
    value,
    USAGE_ADMIN_LIMITS.LIMIT_MIN,
    USAGE_ADMIN_LIMITS.LIMIT_MAX,
    USAGE_ADMIN_LIMITS.LIMIT_DEFAULT,
  );
}

// ─── 타입 ────────────────────────────────────────────────────────────────────
export interface UsageTotals {
  sessions: number;
  viewers: number;
  plays: number;
  views: number;
  watchedMin: number;
}

export interface UsageVodRow {
  vodId: number;
  /** vods 에 없는(삭제된) 영상이면 null */
  title: string | null;
  plays: number;
  viewers: number;
  views: number;
  ended: number;
  avgWatchedSec: number | null;
  totalWatchedMin: number;
  /** 0~100. 영상 길이가 있는 시청이 없으면 null */
  avgExitPct: number | null;
}

export interface UsageDailyRow {
  /** Asia/Seoul 기준 YYYY-MM-DD */
  date: string;
  sessions: number;
  plays: number;
  watchedMin: number;
}

export interface UsagePassStats {
  promptShown: number;
  activated: number;
  failed: number;
}

export interface UsageSummary {
  days: number;
  generatedAt: string | null;
  totals: UsageTotals;
  vods: UsageVodRow[];
  daily: UsageDailyRow[];
  pass: UsagePassStats;
}

export interface UsageRecentEvent {
  occurredAt: string;
  /** DB 에 예상 밖의 값이 있어도 그대로 담으려고 string 이다. 라벨은 `usageEventLabel` 로 구한다. */
  eventType: string;
  vodId: number | null;
  vodTitle: string | null;
  pagePath: string | null;
  positionSec: number | null;
  durationSec: number | null;
  watchedSec: number | null;
  userName: string | null;
  authMethod: string | null;
  sessionId: string;
}

export interface UsageUser {
  /** null 이면 익명 */
  userName: string | null;
  userKey: string | null;
  views: number;
  vods: number;
  watchedMin: number;
  lastSeen: string | null;
}

// ─── 이벤트 라벨 ─────────────────────────────────────────────────────────────
/**
 * 키 타입이 `UsageEventType` 이라 `usageLogEvents.ts` 의 목록에 이벤트가 추가되면 여기서 컴파일 오류가 난다.
 */
export const USAGE_EVENT_LABELS: Record<UsageEventType, string> = {
  page_view: '페이지 열람',
  page_leave: '페이지 이탈',
  video_ready: '플레이어 준비',
  video_play: '재생',
  video_pause: '일시정지',
  video_ended: '끝까지 시청',
  video_seek: '위치 이동',
  video_rate_change: '배속 변경',
  video_fullscreen: '전체화면',
  video_progress: '재생 진행',
  video_leave: '영상 화면 이탈',
  pass_prompt_shown: '이용권 활성화 안내',
  pass_activated: '이용권 활성화 성공',
  pass_activate_failed: '이용권 활성화 실패',
};

/** 목록에 없는 값은 원문을 그대로 보여준다. */
export function usageEventLabel(eventType: string): string {
  return Object.hasOwn(USAGE_EVENT_LABELS, eventType)
    ? USAGE_EVENT_LABELS[eventType as UsageEventType]
    : eventType;
}

// ─── 반환값 파싱 ─────────────────────────────────────────────────────────────
// RPC 가 돌려주는 jsonb 는 형태를 믿지 않는다. 틀린 부분은 0, null, 빈 배열로 바꾼다.
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function asRecordList(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function asNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asStringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export function emptyUsageSummary(): UsageSummary {
  return {
    days: 0,
    generatedAt: null,
    totals: { sessions: 0, viewers: 0, plays: 0, views: 0, watchedMin: 0 },
    vods: [],
    daily: [],
    pass: { promptShown: 0, activated: 0, failed: 0 },
  };
}

export function parseUsageSummary(raw: unknown): UsageSummary {
  const root = asRecord(raw);
  const totals = asRecord(root.totals);
  const pass = asRecord(root.pass);

  const vods: UsageVodRow[] = [];
  for (const row of asRecordList(root.vods)) {
    if (typeof row.vod_id !== 'number') continue;
    vods.push({
      vodId: row.vod_id,
      title: asStringOrNull(row.title),
      plays: asNumber(row.plays),
      viewers: asNumber(row.viewers),
      views: asNumber(row.views),
      ended: asNumber(row.ended),
      avgWatchedSec: asNumberOrNull(row.avg_watched_sec),
      totalWatchedMin: asNumber(row.total_watched_min),
      avgExitPct: asNumberOrNull(row.avg_exit_pct),
    });
  }

  const daily: UsageDailyRow[] = [];
  for (const row of asRecordList(root.daily)) {
    if (typeof row.date !== 'string') continue;
    daily.push({
      date: row.date,
      sessions: asNumber(row.sessions),
      plays: asNumber(row.plays),
      watchedMin: asNumber(row.watched_min),
    });
  }

  return {
    days: asNumber(root.days),
    generatedAt: asStringOrNull(root.generated_at),
    totals: {
      sessions: asNumber(totals.sessions),
      viewers: asNumber(totals.viewers),
      plays: asNumber(totals.plays),
      views: asNumber(totals.views),
      watchedMin: asNumber(totals.watched_min),
    },
    vods,
    daily,
    pass: {
      promptShown: asNumber(pass.prompt_shown),
      activated: asNumber(pass.activated),
      failed: asNumber(pass.failed),
    },
  };
}

export function parseUsageRecent(raw: unknown): UsageRecentEvent[] {
  const events: UsageRecentEvent[] = [];
  for (const row of asRecordList(asRecord(raw).events)) {
    if (
      typeof row.occurred_at !== 'string' ||
      typeof row.event_type !== 'string' ||
      typeof row.session_id !== 'string'
    ) {
      continue;
    }
    events.push({
      occurredAt: row.occurred_at,
      eventType: row.event_type,
      vodId: asNumberOrNull(row.vod_id),
      vodTitle: asStringOrNull(row.vod_title),
      pagePath: asStringOrNull(row.page_path),
      positionSec: asNumberOrNull(row.position_sec),
      durationSec: asNumberOrNull(row.duration_sec),
      watchedSec: asNumberOrNull(row.watched_sec),
      userName: asStringOrNull(row.user_name),
      authMethod: asStringOrNull(row.auth_method),
      sessionId: row.session_id,
    });
  }
  return events;
}

export function parseUsageUsers(raw: unknown): UsageUser[] {
  return asRecordList(asRecord(raw).users).map((row) => ({
    userName: asStringOrNull(row.user_name),
    userKey: asStringOrNull(row.user_key),
    views: asNumber(row.views),
    vods: asNumber(row.vods),
    watchedMin: asNumber(row.watched_min),
    lastSeen: asStringOrNull(row.last_seen),
  }));
}
