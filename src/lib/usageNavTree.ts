import type { UsageUserEvent } from './usageLogAdmin';

/**
 * 이용 로그를 "어느 화면에서 어떤 클릭으로 어느 화면에 갔는지" 트리로 묶는다(LC-3438).
 *
 * 세션(브라우저 탭) 단위로 `page_view` 를 노드로 만든다. 부모는 그 화면이 기록한 `detail.from`
 * (직전에 본 화면의 경로)과 같은 경로의 가장 가까운 앞선 노드다. 목록에서 영상 A 를 보고 돌아와
 * 영상 B 를 열면 둘 다 목록 노드의 자식이 된다.
 *
 * `from` 이 기록되지 않은 옛 로그는 시간순으로 바로 앞 화면의 자식으로 이어 붙이고 `estimated` 로 표시한다.
 * 재생·일시정지·이탈 같은 이벤트는 같은 경로의 가장 최근 노드에 합친다.
 */

export interface NavVideoSummary {
  plays: number;
  pauses: number;
  seeks: number;
  ended: number;
  /** `video_leave` 의 시청 시간 합(초) */
  watchedSec: number;
  lastPositionSec: number | null;
}

export interface NavNode {
  id: string;
  path: string;
  vodId: number | null;
  vodTitle: string | null;
  enteredAt: string;
  dwellSec: number | null;
  /** 이 화면으로 오기 직전에 누른 링크·버튼 이름 */
  via: string | null;
  /** 이 탭에서 처음 연 화면이 다른 사이트에서 왔다면 그 도메인 */
  ref: string | null;
  /** 기록된 직전 경로. 기록이 없으면 null */
  from: string | null;
  /** 옛 로그라 시간순으로 이어 붙인 것 */
  estimated: boolean;
  video: NavVideoSummary | null;
  children: NavNode[];
}

export interface NavSession {
  sessionId: string;
  authMethod: string | null;
  userName: string | null;
  startedAt: string;
  endedAt: string;
  eventCount: number;
  pageCount: number;
  watchedSec: number;
  roots: NavNode[];
}

function emptyVideo(): NavVideoSummary {
  return {
    plays: 0,
    pauses: 0,
    seeks: 0,
    ended: 0,
    watchedSec: 0,
    lastPositionSec: null,
  };
}

function readString(
  detail: UsageUserEvent['detail'],
  key: string,
): string | null {
  const value = detail[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function newNode(event: UsageUserEvent, id: string): NavNode {
  const hasFrom = typeof event.detail.from === 'string';
  return {
    id,
    path: event.pagePath ?? '(경로 없음)',
    vodId: event.vodId,
    vodTitle: event.vodTitle,
    enteredAt: event.occurredAt,
    dwellSec: null,
    via: readString(event.detail, 'via'),
    ref: readString(event.detail, 'ref'),
    from: hasFrom ? readString(event.detail, 'from') : null,
    estimated: false,
    video: null,
    children: [],
  };
}

function findExact(nodes: NavNode[], path: string): NavNode | null {
  for (let i = nodes.length - 1; i >= 0; i -= 1) {
    if (nodes[i].path === path) return nodes[i];
  }
  return null;
}

function findTarget(nodes: NavNode[], path: string | null): NavNode | null {
  if (nodes.length === 0) return null;
  if (path) {
    for (let i = nodes.length - 1; i >= 0; i -= 1) {
      if (nodes[i].path === path) return nodes[i];
    }
  }
  return nodes[nodes.length - 1];
}

function applyEvent(node: NavNode, event: UsageUserEvent): void {
  switch (event.eventType) {
    case 'page_leave': {
      const dwell = event.detail.dwell_sec;
      if (typeof dwell === 'number') node.dwellSec = dwell;
      return;
    }
    case 'video_play':
    case 'video_pause':
    case 'video_seek':
    case 'video_ended':
    case 'video_leave': {
      const video = (node.video ??= emptyVideo());
      if (event.eventType === 'video_play') video.plays += 1;
      if (event.eventType === 'video_pause') video.pauses += 1;
      if (event.eventType === 'video_seek') video.seeks += 1;
      if (event.eventType === 'video_ended') video.ended += 1;
      if (event.eventType === 'video_leave') {
        video.watchedSec += event.watchedSec ?? 0;
      }
      if (event.positionSec !== null) video.lastPositionSec = event.positionSec;
      return;
    }
    default:
      return;
  }
}

function buildSession(sessionId: string, events: UsageUserEvent[]): NavSession {
  const ordered = [...events].sort((a, b) =>
    a.occurredAt < b.occurredAt ? -1 : a.occurredAt > b.occurredAt ? 1 : 0,
  );

  const nodes: NavNode[] = [];
  const roots: NavNode[] = [];

  function attach(node: NavNode, parent: NavNode | null) {
    if (parent) parent.children.push(node);
    else roots.push(node);
    nodes.push(node);
  }

  for (const event of ordered) {
    if (event.eventType === 'page_view') {
      const node = newNode(event, `${sessionId}:${nodes.length}`);
      const hasFrom = typeof event.detail.from === 'string';
      if (hasFrom) {
        // 기록된 직전 경로와 같은 경로의 가장 가까운 앞선 노드가 부모다. 없으면(직접 진입 등) 뿌리다.
        const from = readString(event.detail, 'from');
        attach(node, from ? findExact(nodes, from) : null);
      } else {
        node.estimated = nodes.length > 0;
        attach(node, nodes.length > 0 ? nodes[nodes.length - 1] : null);
      }
      continue;
    }

    let target = findTarget(nodes, event.pagePath);
    if (!target) {
      // page_view 가 기록되기 전(옛 로그, 일부 유실)에 온 이벤트도 버리지 않는다.
      target = newNode(event, `${sessionId}:${nodes.length}`);
      target.estimated = true;
      attach(target, null);
    }
    applyEvent(target, event);
  }

  let watchedSec = 0;
  for (const node of nodes) watchedSec += node.video?.watchedSec ?? 0;

  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  return {
    sessionId,
    authMethod: first.authMethod,
    userName: first.userName,
    startedAt: first.occurredAt,
    endedAt: last.occurredAt,
    eventCount: ordered.length,
    pageCount: nodes.length,
    watchedSec,
    roots,
  };
}

/** 세션별 이동 경로 트리. 가장 최근에 시작한 세션이 앞에 온다. */
export function buildNavigationSessions(
  events: UsageUserEvent[],
): NavSession[] {
  const bySession = new Map<string, UsageUserEvent[]>();
  for (const event of events) {
    const list = bySession.get(event.sessionId);
    if (list) list.push(event);
    else bySession.set(event.sessionId, [event]);
  }

  return [...bySession.entries()]
    .map(([sessionId, list]) => buildSession(sessionId, list))
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
}

/** 화면 경로를 사람이 읽을 이름으로 바꾼다. */
export function pageLabel(
  path: string,
  vodId: number | null,
  vodTitle: string | null,
): string {
  if (path === '/vod') return 'VOD 목록';
  if (/^\/vod\/\d+/.test(path)) {
    return vodTitle ?? (vodId !== null ? `VOD #${vodId}` : path);
  }
  if (path === '/login') return '로그인';
  if (path === '/membership') return '멤버십';
  return path;
}
