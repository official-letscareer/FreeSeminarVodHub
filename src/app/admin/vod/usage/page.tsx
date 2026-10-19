'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import UserUsageSearch from '@/components/admin/UserUsageSearch';
import {
  ADMIN_SESSION_NOT_CONFIGURED_MESSAGE,
  usageEventLabel,
} from '@/lib/usageLogAdmin';
import type {
  UsageRecentEvent,
  UsageSummary,
  UsageUser,
} from '@/lib/usageLogAdmin';

const PERIODS = [7, 30, 90] as const;
const DEFAULT_PERIOD = 30;
const RECENT_LIMIT = 50;
const USERS_LIMIT = 100;

const NOT_CONFIGURED_MESSAGE =
  '이용 로그 조회 토큰이 설정되지 않았습니다. 개발 담당자에게 환경변수 USAGE_LOG_READ_TOKEN 설정과 Supabase 토큰 해시 등록을 요청해 주세요.';
const SESSION_NOT_CONFIGURED_MESSAGE =
  '관리자 세션 비밀키가 설정되지 않았습니다. 개발 담당자에게 환경변수 ADMIN_SESSION_SECRET 설정을 요청해 주세요. 설정한 뒤에는 한 번 다시 로그인해야 합니다.';
const LOAD_FAILED_MESSAGE = '이용 로그를 불러오지 못했습니다.';
const EMPTY_MESSAGE = '이 기간에 기록된 데이터가 없습니다.';
const EMPTY_RECENT_MESSAGE = '기록된 이벤트가 없습니다.';

const TH = 'p-2 text-left font-medium text-gray-600 whitespace-nowrap';
const TD = 'p-2 whitespace-nowrap';
const ROW = 'border-b border-gray-100 hover:bg-gray-50 transition-colors';

interface UsageData {
  summary: UsageSummary;
  events: UsageRecentEvent[];
  users: UsageUser[];
}

// ─── 표시 형식 ────────────────────────────────────────────────────────────────
const KST_PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** ISO 8601 시각을 KST `YYYY-MM-DD HH:mm:ss` 로 바꾼다. 읽을 수 없으면 `-`. */
function formatKst(iso: string | null): string {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  const p: Record<string, string> = {};
  for (const part of KST_PARTS.formatToParts(date)) p[part.type] = part.value;
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

function formatCount(value: number): string {
  return value.toLocaleString('ko-KR');
}

function formatDuration(sec: number | null): string {
  if (sec === null) return '-';
  const total = Math.round(sec);
  if (total < 60) return `${total}초`;
  return `${Math.floor(total / 60)}분 ${total % 60}초`;
}

/** 재생 위치. 61.4 -> 1:01 */
function formatPosition(sec: number | null): string {
  if (sec === null) return '-';
  const total = Math.floor(sec);
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function formatPercent(value: number | null): string {
  return value === null ? '-' : `${Math.round(value)}%`;
}

function vodTitle(title: string | null, vodId: number | null): string {
  if (title) return title;
  return vodId === null ? '-' : `삭제된 영상 (#${vodId})`;
}

function isUsageSummary(value: unknown): value is UsageSummary {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.totals === 'object' &&
    v.totals !== null &&
    typeof v.pass === 'object' &&
    v.pass !== null &&
    Array.isArray(v.vods) &&
    Array.isArray(v.daily)
  );
}

async function readMessage(res: Response): Promise<string> {
  const body: unknown = await res.json().catch(() => null);
  if (typeof body === 'object' && body !== null && 'message' in body) {
    const message = (body as { message: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return LOAD_FAILED_MESSAGE;
}

// ─── 화면 ─────────────────────────────────────────────────────────────────────
function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="py-4 gap-2">
      <CardHeader className="px-4">
        <CardTitle className="text-sm font-medium text-gray-600">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4">
        <p className="text-2xl font-bold text-gray-900">{formatCount(value)}</p>
      </CardContent>
    </Card>
  );
}

function Section({
  title,
  empty,
  emptyMessage = EMPTY_MESSAGE,
  children,
}: {
  title: string;
  empty: boolean;
  emptyMessage?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {empty ? (
          <p className="text-sm text-gray-500 py-6 text-center">
            {emptyMessage}
          </p>
        ) : (
          <div className="overflow-x-auto">{children}</div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminVodUsagePage() {
  const router = useRouter();
  const [days, setDays] = useState<number>(DEFAULT_PERIOD);
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // 기간을 빠르게 바꿨을 때 늦게 도착한 이전 응답이 화면을 덮어쓰지 않게 한다.
  const latestRequest = useRef(0);

  const load = useCallback(
    async (period: number) => {
      const requestId = ++latestRequest.current;
      setLoading(true);
      setError('');
      try {
        const [summaryRes, recentRes, usersRes] = await Promise.all([
          fetch(`/api/admin/usage-logs?view=summary&days=${period}`),
          fetch(`/api/admin/usage-logs?view=recent&limit=${RECENT_LIMIT}`),
          fetch(
            `/api/admin/usage-logs?view=users&days=${period}&limit=${USERS_LIMIT}`,
          ),
        ]);
        if (requestId !== latestRequest.current) return;

        const responses = [summaryRes, recentRes, usersRes];
        if (responses.some((res) => res.status === 401)) {
          router.push('/admin');
          return;
        }
        const failed = responses.find((res) => !res.ok);
        if (failed) {
          setData(null);
          const message = await readMessage(failed);
          if (failed.status !== 503) {
            setError(message);
          } else {
            // 503 은 두 가지다. 서버 문구로 세션 비밀키 미설정과 조회 토큰 미설정을 구분한다.
            setError(
              message === ADMIN_SESSION_NOT_CONFIGURED_MESSAGE
                ? SESSION_NOT_CONFIGURED_MESSAGE
                : NOT_CONFIGURED_MESSAGE,
            );
          }
          return;
        }

        const [summary, recent, users] = await Promise.all([
          summaryRes.json(),
          recentRes.json(),
          usersRes.json(),
        ]);
        if (requestId !== latestRequest.current) return;
        if (!isUsageSummary(summary)) throw new Error('invalid summary');

        setData({
          summary,
          events: Array.isArray(recent?.events) ? recent.events : [],
          users: Array.isArray(users?.users) ? users.users : [],
        });
      } catch {
        if (requestId !== latestRequest.current) return;
        setData(null);
        setError(LOAD_FAILED_MESSAGE);
      } finally {
        if (requestId === latestRequest.current) setLoading(false);
      }
    },
    [router],
  );

  useEffect(() => {
    void load(days);
  }, [days, load]);

  return (
    <div className="space-y-6">
      <UserUsageSearch days={days} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2" role="group" aria-label="조회 기간">
          {PERIODS.map((period) => (
            <Button
              key={period}
              variant={days === period ? 'default' : 'outline'}
              aria-pressed={days === period}
              onClick={() => setDays(period)}
            >
              {period}일
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {data && (
            <span className="text-xs text-gray-500">
              조회 시각 {formatKst(data.summary.generatedAt)} (KST)
            </span>
          )}
          <Button
            variant="outline"
            onClick={() => void load(days)}
            disabled={loading}
          >
            {loading ? '불러오는 중...' : '새로고침'}
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading && (
        <div className="space-y-4" aria-busy="true">
          <p className="text-sm text-gray-500">이용 로그를 불러오는 중...</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
          <Skeleton className="h-48" />
        </div>
      )}

      {!loading && data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="방문 세션" value={data.summary.totals.sessions} />
            <StatCard label="시청자" value={data.summary.totals.viewers} />
            <StatCard label="재생" value={data.summary.totals.plays} />
            <StatCard
              label="시청 시간(분)"
              value={data.summary.totals.watchedMin}
            />
          </div>

          <Section title="영상별" empty={data.summary.vods.length === 0}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className={TH}>제목</th>
                  <th className={TH}>재생</th>
                  <th className={TH}>시청자</th>
                  <th className={TH}>시청 횟수</th>
                  <th className={TH}>끝까지 본 횟수</th>
                  <th className={TH}>평균 시청 시간</th>
                  <th className={TH}>평균 이탈 진행률</th>
                </tr>
              </thead>
              <tbody>
                {data.summary.vods.map((vod) => (
                  <tr key={vod.vodId} className={ROW}>
                    <td className="p-2 min-w-48">
                      {vodTitle(vod.title, vod.vodId)}
                    </td>
                    <td className={TD}>{formatCount(vod.plays)}</td>
                    <td className={TD}>{formatCount(vod.viewers)}</td>
                    <td className={TD}>{formatCount(vod.views)}</td>
                    <td className={TD}>{formatCount(vod.ended)}</td>
                    <td className={TD}>{formatDuration(vod.avgWatchedSec)}</td>
                    <td className={TD}>{formatPercent(vod.avgExitPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <Section title="일별 추이" empty={data.summary.daily.length === 0}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className={TH}>날짜</th>
                  <th className={TH}>방문 세션</th>
                  <th className={TH}>재생</th>
                  <th className={TH}>시청 시간(분)</th>
                </tr>
              </thead>
              <tbody>
                {data.summary.daily.map((day) => (
                  <tr key={day.date} className={ROW}>
                    <td className={TD}>{day.date}</td>
                    <td className={TD}>{formatCount(day.sessions)}</td>
                    <td className={TD}>{formatCount(day.plays)}</td>
                    <td className={TD}>{formatCount(day.watchedMin)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <Section title="사용자별" empty={data.users.length === 0}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className={TH}>이름</th>
                  <th className={TH}>본 영상 수</th>
                  <th className={TH}>총 시청 분</th>
                  <th className={TH}>마지막 이용</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((user, index) => (
                  <tr
                    key={`${user.userKey ?? user.userName ?? 'anonymous'}-${index}`}
                    className={ROW}
                  >
                    <td className={TD}>{user.userName ?? '(익명)'}</td>
                    <td className={TD}>{formatCount(user.vods)}</td>
                    <td className={TD}>{formatCount(user.watchedMin)}</td>
                    <td className={TD}>{formatKst(user.lastSeen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <Section
            title="최근 이벤트"
            empty={data.events.length === 0}
            emptyMessage={EMPTY_RECENT_MESSAGE}
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className={TH}>시각(KST)</th>
                  <th className={TH}>이벤트</th>
                  <th className={TH}>영상</th>
                  <th className={TH}>위치</th>
                  <th className={TH}>사용자</th>
                  <th className={TH}>세션</th>
                </tr>
              </thead>
              <tbody>
                {data.events.map((event, index) => (
                  <tr
                    key={`${event.sessionId}-${event.occurredAt}-${index}`}
                    className={ROW}
                  >
                    <td className={TD}>{formatKst(event.occurredAt)}</td>
                    <td className={TD}>{usageEventLabel(event.eventType)}</td>
                    <td className="p-2 min-w-40">
                      {vodTitle(event.vodTitle, event.vodId)}
                    </td>
                    <td className={TD}>{formatPosition(event.positionSec)}</td>
                    <td className={TD}>{event.userName ?? '(익명)'}</td>
                    <td className={`${TD} font-mono text-xs`}>
                      {event.sessionId.slice(0, 8)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">이용권 활성화 안내</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3">
                <StatCard
                  label="안내 노출"
                  value={data.summary.pass.promptShown}
                />
                <StatCard
                  label="활성화 성공"
                  value={data.summary.pass.activated}
                />
                <StatCard
                  label="활성화 실패"
                  value={data.summary.pass.failed}
                />
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
