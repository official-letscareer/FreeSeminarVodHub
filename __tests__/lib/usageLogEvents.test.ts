import {
  USAGE_EVENT_TYPES,
  USAGE_LIMITS,
  sanitizeUsageBatch,
} from '@/lib/usageLogEvents';

const NOW = new Date('2026-10-12T03:00:00.000Z');

function batch(events: unknown[], extra: Record<string, unknown> = {}) {
  return { sessionId: 'sess-1', events, ...extra };
}

function one(event: Record<string, unknown>) {
  return sanitizeUsageBatch(batch([{ type: 'page_view', ...event }]), NOW);
}

describe('sanitizeUsageBatch', () => {
  it('유효한 배치를 정규화해 돌려준다', () => {
    const result = sanitizeUsageBatch(
      batch(
        [
          {
            type: 'video_seek',
            vodId: 7,
            youtubeId: 'abc123XYZ',
            pagePath: '/vod/7',
            positionSec: 12.34,
            durationSec: 600,
            watchedSec: 9.96,
            detail: {
              from_sec: 10,
              to_sec: 25,
              method: 'skip',
              on: true,
              x: null,
            },
            occurredAt: '2026-10-12T02:59:00.000Z',
          },
        ],
        { userName: '홍길동', userKey: 'a'.repeat(64) },
      ),
      NOW,
    );

    expect(result).toEqual({
      sessionId: 'sess-1',
      events: [
        {
          type: 'video_seek',
          vodId: 7,
          youtubeId: 'abc123XYZ',
          pagePath: '/vod/7',
          positionSec: 12.3,
          durationSec: 600,
          watchedSec: 10,
          detail: {
            from_sec: 10,
            to_sec: 25,
            method: 'skip',
            on: true,
            x: null,
          },
          occurredAt: '2026-10-12T02:59:00.000Z',
        },
      ],
    });
  });

  it('비어 있는 선택 값은 null, detail 은 빈 객체가 된다', () => {
    const result = one({});

    expect(result?.events[0]).toMatchObject({
      vodId: null,
      youtubeId: null,
      pagePath: null,
      positionSec: null,
      durationSec: null,
      watchedSec: null,
      detail: {},
    });
    expect(Object.keys(result ?? {}).sort()).toEqual(['events', 'sessionId']);
  });

  it('허용된 이벤트 종류를 모두 받는다', () => {
    const events = USAGE_EVENT_TYPES.map((type) => ({ type }));
    const result = sanitizeUsageBatch(batch(events), NOW);

    expect(result?.events.map((e) => e.type)).toEqual([...USAGE_EVENT_TYPES]);
  });

  describe('배치 단위', () => {
    it.each([
      ['객체가 아님', 'x'],
      ['null', null],
      ['배열', []],
    ])('본문이 %s 이면 null', (_label, raw) => {
      expect(sanitizeUsageBatch(raw, NOW)).toBeNull();
    });

    it('sessionId 가 없거나 비었거나 65자이면 null, 64자는 통과', () => {
      const events = [{ type: 'page_view' }];
      expect(sanitizeUsageBatch({ events }, NOW)).toBeNull();
      expect(sanitizeUsageBatch({ sessionId: '', events }, NOW)).toBeNull();
      expect(sanitizeUsageBatch({ sessionId: 1, events }, NOW)).toBeNull();
      expect(
        sanitizeUsageBatch({ sessionId: 'a'.repeat(65), events }, NOW),
      ).toBeNull();
      expect(
        sanitizeUsageBatch({ sessionId: 'a'.repeat(64), events }, NOW),
      ).not.toBeNull();
    });

    it('events 가 비었거나 51개이면 null, 1개와 50개는 통과', () => {
      const make = (n: number) =>
        Array.from({ length: n }, () => ({ type: 'page_view' }));

      expect(sanitizeUsageBatch(batch(make(0)), NOW)).toBeNull();
      expect(sanitizeUsageBatch(batch(make(51)), NOW)).toBeNull();
      expect(sanitizeUsageBatch(batch(make(1)), NOW)?.events).toHaveLength(1);
      expect(sanitizeUsageBatch(batch(make(50)), NOW)?.events).toHaveLength(
        USAGE_LIMITS.MAX_EVENTS,
      );
      expect(
        sanitizeUsageBatch({ sessionId: 's', events: 'page_view' }, NOW),
      ).toBeNull();
    });

    it('본문의 userName, userKey 는 값이 무엇이든 읽지 않고 결과에 싣지 않는다', () => {
      const events = [{ type: 'page_view' }];

      for (const extra of [
        { userName: '홍길동', userKey: 'a'.repeat(64) },
        { userName: '가'.repeat(101), userKey: 'a'.repeat(65) },
        { userName: 1, userKey: { nested: true } },
      ]) {
        const result = sanitizeUsageBatch(batch(events, extra), NOW);

        expect(result).not.toBeNull();
        expect(Object.keys(result ?? {}).sort()).toEqual([
          'events',
          'sessionId',
        ]);
        expect(JSON.stringify(result)).not.toContain('홍길동');
      }
    });
  });

  describe('이벤트 단위: 어긴 이벤트만 버린다', () => {
    it('허용 목록 밖 type 과 객체가 아닌 항목은 버리고 나머지는 남긴다', () => {
      const result = sanitizeUsageBatch(
        batch([
          { type: 'video_play' },
          { type: 'drop_table' },
          'video_pause',
          null,
          { type: 'video_pause' },
        ]),
        NOW,
      );

      expect(result?.events.map((e) => e.type)).toEqual([
        'video_play',
        'video_pause',
      ]);
    });

    it('유효한 이벤트가 하나도 없으면 null', () => {
      expect(
        sanitizeUsageBatch(batch([{ type: 'nope' }, { type: 5 }]), NOW),
      ).toBeNull();
    });

    it.each([
      ['vodId 0', { vodId: 0 }],
      ['vodId 음수', { vodId: -1 }],
      ['vodId 소수', { vodId: 1.5 }],
      ['vodId 문자열', { vodId: '7' }],
      ['youtubeId 21자', { youtubeId: 'a'.repeat(21) }],
      ['youtubeId 숫자', { youtubeId: 5 }],
      ['pagePath 가 / 로 시작하지 않음', { pagePath: 'vod/7' }],
      ['pagePath 201자', { pagePath: '/' + 'a'.repeat(200) }],
      ['positionSec 음수', { positionSec: -0.1 }],
      ['positionSec 86400 초과', { positionSec: 86400.1 }],
      ['durationSec NaN', { durationSec: Number.NaN }],
      ['watchedSec 문자열', { watchedSec: '10' }],
      ['detail 배열', { detail: [1] }],
      [
        'detail 키 21개',
        {
          detail: Object.fromEntries(
            Array.from({ length: 21 }, (_, i) => [`k${i}`, i]),
          ),
        },
      ],
      ['detail 값이 객체', { detail: { a: { b: 1 } } }],
      ['detail 값이 배열', { detail: { a: [1] } }],
      ['detail 문자열 101자', { detail: { a: 'x'.repeat(101) } }],
      ['detail 키가 너무 김', { detail: { ['k'.repeat(51)]: 1 } }],
    ])('%s 이면 그 이벤트를 버린다', (_label, bad) => {
      const result = sanitizeUsageBatch(
        batch([{ type: 'page_view', ...bad }, { type: 'video_play' }]),
        NOW,
      );

      expect(result?.events.map((e) => e.type)).toEqual(['video_play']);
    });

    it('경계값은 통과한다', () => {
      const detail = Object.fromEntries(
        Array.from({ length: 20 }, (_, i) => [`k${i}`, i]),
      );
      const result = one({
        vodId: 1,
        youtubeId: 'a'.repeat(20),
        pagePath: '/' + 'a'.repeat(199),
        positionSec: 0,
        durationSec: 86400,
        watchedSec: 86399.96,
        detail: { ...detail, k0: 'x'.repeat(100) },
      });

      expect(result?.events[0]).toMatchObject({
        vodId: 1,
        positionSec: 0,
        durationSec: 86400,
        watchedSec: 86400,
      });
    });

    it('소수 첫째 자리까지 반올림한다', () => {
      const result = one({
        positionSec: 1.25,
        durationSec: 2.04,
        watchedSec: 0.06,
      });

      expect(result?.events[0]).toMatchObject({
        positionSec: 1.3,
        durationSec: 2,
        watchedSec: 0.1,
      });
    });
  });

  describe('occurredAt', () => {
    const serverNow = NOW.toISOString();

    it('범위 안이면 그대로 쓴다(-24h, +1h 경계 포함)', () => {
      const past = new Date(NOW.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const future = new Date(NOW.getTime() + 60 * 60 * 1000).toISOString();

      expect(one({ occurredAt: past })?.events[0].occurredAt).toBe(past);
      expect(one({ occurredAt: future })?.events[0].occurredAt).toBe(future);
    });

    it('24시간보다 오래됐거나 1시간보다 미래이면 서버 시각으로 대체한다', () => {
      const tooOld = new Date(
        NOW.getTime() - 24 * 60 * 60 * 1000 - 1,
      ).toISOString();
      const tooNew = new Date(NOW.getTime() + 60 * 60 * 1000 + 1).toISOString();

      expect(one({ occurredAt: tooOld })?.events[0].occurredAt).toBe(serverNow);
      expect(one({ occurredAt: tooNew })?.events[0].occurredAt).toBe(serverNow);
    });

    it('없거나 읽을 수 없으면 서버 시각으로 대체하고 이벤트는 남긴다', () => {
      expect(one({})?.events[0].occurredAt).toBe(serverNow);
      expect(one({ occurredAt: 'yesterday' })?.events[0].occurredAt).toBe(
        serverNow,
      );
      expect(one({ occurredAt: { a: 1 } })?.events[0].occurredAt).toBe(
        serverNow,
      );
    });
  });
});
