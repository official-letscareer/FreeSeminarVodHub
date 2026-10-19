import type { UsageUserEvent } from '@/lib/usageLogAdmin';
import { buildNavigationSessions, pageLabel } from '@/lib/usageNavTree';

let seq = 0;
function ev(over: Partial<UsageUserEvent>): UsageUserEvent {
  seq += 1;
  return {
    occurredAt: new Date(Date.UTC(2026, 9, 19, 1, 0, seq)).toISOString(),
    eventType: 'page_view',
    vodId: null,
    vodTitle: null,
    pagePath: '/vod',
    positionSec: null,
    durationSec: null,
    watchedSec: null,
    userName: '김렛커',
    authMethod: 'sso',
    sessionId: 's1',
    userKey: 'k',
    detail: {},
    ...over,
  };
}

const view = (
  path: string,
  detail: UsageUserEvent['detail'],
  extra: Partial<UsageUserEvent> = {},
) => ev({ eventType: 'page_view', pagePath: path, detail, ...extra });

beforeEach(() => {
  seq = 0;
});

describe('buildNavigationSessions', () => {
  it('목록에서 영상을 열고 돌아와 다른 영상을 열면 두 영상이 목록의 자식이다', () => {
    const [session] = buildNavigationSessions([
      view('/vod', { from: '' }),
      view('/vod/1', { from: '/vod', via: '영상 A' }, { vodId: 1 }),
      view('/vod', { from: '/vod/1', via: '목록으로' }),
      view('/vod/2', { from: '/vod', via: '영상 B' }, { vodId: 2 }),
    ]);

    expect(session.roots).toHaveLength(1);
    const list = session.roots[0];
    expect(list.path).toBe('/vod');
    expect(list.children.map((c) => c.path)).toEqual(['/vod/1']);
    const backToList = list.children[0].children[0];
    expect(backToList.path).toBe('/vod');
    expect(backToList.via).toBe('목록으로');
    expect(backToList.children.map((c) => [c.path, c.via])).toEqual([
      ['/vod/2', '영상 B'],
    ]);
    expect(session.pageCount).toBe(4);
  });

  it('직접 진입(from 이 빈 문자열)은 새 뿌리다', () => {
    const [session] = buildNavigationSessions([
      view('/vod', { from: '' }),
      view('/vod/5', { from: '' }, { vodId: 5 }),
    ]);

    expect(session.roots.map((n) => n.path)).toEqual(['/vod', '/vod/5']);
  });

  it('외부에서 왔으면 ref 도메인을 남긴다', () => {
    const [session] = buildNavigationSessions([
      view('/vod/9', { from: '', ref: 'kakao.com' }, { vodId: 9 }),
    ]);

    expect(session.roots[0].ref).toBe('kakao.com');
  });

  it('from 의 경로를 본 적이 없으면 뿌리로 둔다', () => {
    const [session] = buildNavigationSessions([
      view('/vod/3', { from: '/vod' }, { vodId: 3 }),
    ]);

    expect(session.roots).toHaveLength(1);
    expect(session.roots[0].from).toBe('/vod');
  });

  it('from 이 기록되지 않은 옛 로그는 시간순으로 이어 붙이고 추정으로 표시한다', () => {
    const [session] = buildNavigationSessions([
      view('/vod', {}),
      view('/vod/1', {}, { vodId: 1 }),
    ]);

    const list = session.roots[0];
    expect(list.estimated).toBe(false);
    expect(list.children[0].path).toBe('/vod/1');
    expect(list.children[0].estimated).toBe(true);
  });

  it('재생·이탈 이벤트는 같은 경로의 가장 최근 노드에 합친다', () => {
    const [session] = buildNavigationSessions([
      view('/vod', { from: '' }),
      view('/vod/1', { from: '/vod' }, { vodId: 1, vodTitle: '영상 A' }),
      ev({ eventType: 'video_play', pagePath: '/vod/1', vodId: 1 }),
      ev({ eventType: 'video_pause', pagePath: '/vod/1', positionSec: 30 }),
      ev({ eventType: 'video_seek', pagePath: '/vod/1', positionSec: 90 }),
      ev({
        eventType: 'video_leave',
        pagePath: '/vod/1',
        positionSec: 120,
        watchedSec: 100,
      }),
      ev({
        eventType: 'page_leave',
        pagePath: '/vod/1',
        detail: { dwell_sec: 130 },
      }),
    ]);

    const node = session.roots[0].children[0];
    expect(node.dwellSec).toBe(130);
    expect(node.video).toEqual({
      plays: 1,
      pauses: 1,
      seeks: 1,
      ended: 0,
      watchedSec: 100,
      lastPositionSec: 120,
    });
    expect(session.watchedSec).toBe(100);
  });

  it('page_view 없이 온 이벤트도 버리지 않고 추정 노드로 만든다', () => {
    const [session] = buildNavigationSessions([
      ev({ eventType: 'video_play', pagePath: '/vod/4', vodId: 4 }),
    ]);

    expect(session.roots[0].path).toBe('/vod/4');
    expect(session.roots[0].estimated).toBe(true);
    expect(session.roots[0].video?.plays).toBe(1);
  });

  it('세션은 최근 것이 앞에 오고 세션끼리 섞이지 않는다', () => {
    const sessions = buildNavigationSessions([
      view('/vod', { from: '' }, { sessionId: 'old' }),
      view('/vod', { from: '' }, { sessionId: 'new' }),
      view('/vod/1', { from: '/vod' }, { sessionId: 'old' }),
    ]);

    expect(sessions.map((s) => s.sessionId)).toEqual(['new', 'old']);
    expect(sessions[1].roots[0].children).toHaveLength(1);
    expect(sessions[0].roots[0].children).toHaveLength(0);
  });
});

describe('pageLabel', () => {
  it('목록·영상·로그인은 읽을 이름으로, 그 밖은 경로 그대로 보인다', () => {
    expect(pageLabel('/vod', null, null)).toBe('VOD 목록');
    expect(pageLabel('/vod/7', 7, '영상 제목')).toBe('영상 제목');
    expect(pageLabel('/vod/7', 7, null)).toBe('VOD #7');
    expect(pageLabel('/login', null, null)).toBe('로그인');
    expect(pageLabel('/x', null, null)).toBe('/x');
  });
});
