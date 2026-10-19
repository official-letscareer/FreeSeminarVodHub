'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { UsageUserEvent, UsageUserEvents } from '@/lib/usageLogAdmin';
import {
  buildNavigationSessions,
  pageLabel,
  type NavNode,
  type NavSession,
} from '@/lib/usageNavTree';

const LOAD_FAILED_MESSAGE = '이용 로그를 불러오지 못했습니다.';
const KST_TIME = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function formatTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '-' : KST_TIME.format(date);
}

function formatDuration(sec: number): string {
  const total = Math.round(sec);
  if (total < 60) return `${total}초`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes}분 ${total % 60}초`;
  return `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`;
}

function formatPosition(sec: number): string {
  const total = Math.floor(sec);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

interface UserGroup {
  key: string;
  name: string | null;
  authMethods: string[];
  sessions: NavSession[];
  watchedSec: number;
  lastSeen: string;
}

/** 검색 결과를 이용자별로 묶는다. 이용자 키가 있으면 키로, 없으면 이름으로 묶고 둘 다 없으면 익명이다. */
function groupByUser(events: UsageUserEvent[]): UserGroup[] {
  const groups = new Map<string, UsageUserEvent[]>();
  for (const event of events) {
    const key =
      event.userKey ??
      (event.userName ? `name:${event.userName}` : 'anonymous');
    const list = groups.get(key);
    if (list) list.push(event);
    else groups.set(key, [event]);
  }

  return [...groups.entries()]
    .map(([key, list]) => {
      const sessions = buildNavigationSessions(list);
      return {
        key,
        name: list.find((e) => e.userName)?.userName ?? null,
        authMethods: [
          ...new Set(list.map((e) => e.authMethod).filter(Boolean)),
        ] as string[],
        sessions,
        watchedSec: sessions.reduce((sum, s) => sum + s.watchedSec, 0),
        lastSeen: sessions[0]?.endedAt ?? '',
      };
    })
    .sort((a, b) => (a.lastSeen < b.lastSeen ? 1 : -1));
}

async function readMessage(res: Response): Promise<string> {
  const body: unknown = await res.json().catch(() => null);
  if (typeof body === 'object' && body !== null && 'message' in body) {
    const message = (body as { message: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return LOAD_FAILED_MESSAGE;
}

function NodeBadges({ node }: { node: NavNode }) {
  return (
    <>
      {node.via && (
        <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700">
          클릭: {node.via}
        </span>
      )}
      {node.from === null && !node.estimated && (
        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
          {node.ref ? `외부 유입: ${node.ref}` : '직접 진입'}
        </span>
      )}
      {node.from !== null && node.via === null && (
        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
          클릭 기록 없음 (뒤로가기 등)
        </span>
      )}
      {node.estimated && (
        <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">
          경로 추정
        </span>
      )}
    </>
  );
}

function NodeView({ node }: { node: NavNode }) {
  const video = node.video;
  return (
    <li className="relative pl-5 pb-3 before:absolute before:left-0 before:top-0 before:h-full before:w-px before:bg-gray-300 last:before:h-3 after:absolute after:left-0 after:top-3 after:w-4 after:border-t after:border-gray-300">
      <div className="rounded-md border border-gray-200 bg-white px-3 py-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium text-gray-900">
            {pageLabel(node.path, node.vodId, node.vodTitle)}
          </span>
          <span className="text-xs text-gray-400">{node.path}</span>
          <NodeBadges node={node} />
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
          <span>{formatTime(node.enteredAt)}</span>
          {node.dwellSec !== null && (
            <span>머문 시간 {formatDuration(node.dwellSec)}</span>
          )}
          {video && (
            <span>
              재생 {video.plays}회 · 시청 {formatDuration(video.watchedSec)}
              {video.lastPositionSec !== null &&
                ` · 마지막 위치 ${formatPosition(video.lastPositionSec)}`}
              {video.seeks > 0 && ` · 위치 이동 ${video.seeks}회`}
              {video.ended > 0 && ' · 끝까지 시청'}
            </span>
          )}
        </div>
      </div>
      {node.children.length > 0 && <NodeList nodes={node.children} nested />}
    </li>
  );
}

function NodeList({
  nodes,
  nested = false,
}: {
  nodes: NavNode[];
  nested?: boolean;
}) {
  return (
    <ul className={nested ? 'mt-2 ml-3' : ''}>
      {nodes.map((node) => (
        <NodeView key={node.id} node={node} />
      ))}
    </ul>
  );
}

function SessionView({
  session,
  open,
}: {
  session: NavSession;
  open: boolean;
}) {
  return (
    <details
      open={open}
      className="rounded-lg border border-gray-200 bg-gray-50"
    >
      <summary className="cursor-pointer select-none px-3 py-2 text-sm">
        <span className="font-medium text-gray-900">
          {formatTime(session.startedAt)}
        </span>
        <span className="ml-2 text-gray-500">
          페이지 {session.pageCount}개 · 이벤트 {session.eventCount}건
          {session.watchedSec > 0 &&
            ` · 시청 ${formatDuration(session.watchedSec)}`}
        </span>
      </summary>
      <div className="px-3 pb-3 pt-1">
        <NodeList nodes={session.roots} />
      </div>
    </details>
  );
}

function UserCard({ group }: { group: UserGroup }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          {group.name ?? '익명'}
          {group.authMethods.map((method) => (
            <span
              key={method}
              className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-normal text-gray-600"
            >
              {method === 'sso' ? '렛커 로그인' : '이름+전화번호 등'}
            </span>
          ))}
        </CardTitle>
        <p className="text-xs text-gray-500">
          세션 {group.sessions.length}개 · 총 시청{' '}
          {formatDuration(group.watchedSec)} · 마지막 활동{' '}
          {formatTime(group.lastSeen)}
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {group.sessions.map((session, index) => (
          <SessionView
            key={session.sessionId}
            session={session}
            open={index === 0}
          />
        ))}
      </CardContent>
    </Card>
  );
}

/**
 * 이름(부분 일치) 또는 이름+전화번호(정확히 일치)로 한 사람의 이용 내역을 찾아
 * 세션별 이동 경로 트리로 보여준다(LC-3438).
 *
 * 전화번호는 로그에 저장되지 않는다. 서버가 이름과 합쳐 만든 키로만 찾으므로 이름과 함께 입력해야 한다.
 */
export default function UserUsageSearch({ days }: { days: number }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<UsageUserEvents | null>(null);
  const [searched, setSearched] = useState<{
    name: string;
    phone: string;
  } | null>(null);
  const latestRequest = useRef(0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const requestId = ++latestRequest.current;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ view: 'user', days: String(days) });
      if (name.trim()) params.set('name', name.trim());
      if (phone.trim()) params.set('phone', phone.trim());
      const res = await fetch(`/api/admin/usage-logs?${params.toString()}`, {
        cache: 'no-store',
      });
      if (requestId !== latestRequest.current) return;
      if (res.status === 401) {
        router.push('/admin');
        return;
      }
      if (!res.ok) {
        setResult(null);
        setError(await readMessage(res));
        return;
      }
      setResult((await res.json()) as UsageUserEvents);
      setSearched({ name: name.trim(), phone: phone.trim() });
    } catch {
      if (requestId !== latestRequest.current) return;
      setResult(null);
      setError(LOAD_FAILED_MESSAGE);
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  }

  const groups = result ? groupByUser(result.events) : [];

  return (
    <section className="space-y-4" aria-label="유저별 이용 내역">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">유저별 이용 내역</CardTitle>
          <p className="text-sm text-gray-500">
            이름으로 찾으면 이름이 포함된 모든 이용자가, 전화번호를 함께 넣으면
            그 이용자만 나옵니다. 전화번호는 저장하지 않아 이름과 함께 입력해야
            찾을 수 있습니다.
          </p>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleSubmit}
            className="flex flex-wrap items-end gap-3"
          >
            <label className="flex flex-col gap-1 text-sm text-gray-700">
              이름
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 임성빈"
                className="w-44"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-gray-700">
              전화번호 (선택)
              <Input
                value={phone}
                onChange={(e) =>
                  setPhone(e.target.value.replace(/[^\d-]/g, '').slice(0, 13))
                }
                placeholder="01012345678"
                inputMode="numeric"
                className="w-44"
              />
            </label>
            <Button
              type="submit"
              disabled={loading || (!name.trim() && !phone.trim())}
            >
              {loading ? '찾는 중...' : '이용 내역 보기'}
            </Button>
            <span className="text-xs text-gray-400">최근 {days}일</span>
          </form>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {result && !error && (
        <>
          {result.truncated && (
            <Alert>
              <AlertDescription>
                이벤트가 많아 가장 최근 것만 보여줍니다. 기간을 줄여 다시
                찾아보세요.
              </AlertDescription>
            </Alert>
          )}
          {groups.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">
              {searched?.name} 이용자의 최근 {days}일 이용 내역이 없습니다.
            </p>
          ) : (
            groups.map((group) => <UserCard key={group.key} group={group} />)
          )}
        </>
      )}
    </section>
  );
}
