/** @jest-environment jsdom */

type UsageLogModule = typeof import('@/lib/usageLog');

const ENDPOINT = '/api/vod/log';
const PHONE = '01012345678';

// 해시 계산을 하지 않는다는 것을 확인하려고 둔 감시용 목이다.
const digest = jest.fn();

function setCrypto(value: unknown) {
  Object.defineProperty(globalThis, 'crypto', {
    value,
    configurable: true,
    writable: true,
  });
}

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

let fetchMock: jest.Mock;
let beaconMock: jest.Mock;
let loaded: UsageLogModule[] = [];

function load(): UsageLogModule {
  jest.resetModules();
  // 모듈 상태(큐, 타이머, 식별 캐시)를 테스트마다 새로 시작해야 해서 동적으로 읽는다.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('@/lib/usageLog') as UsageLogModule;
  loaded.push(mod);
  return mod;
}

function fetchBody(call = 0) {
  return JSON.parse(fetchMock.mock.calls[call][1].body as string);
}

function login(name = '홍길동') {
  localStorage.setItem(
    'auth_session',
    JSON.stringify({
      name,
      phoneNum: PHONE,
      isVerified: true,
      verifiedAt: '2026-10-12T00:00:00.000Z',
    }),
  );
}

describe('usageLog 큐', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    loaded = [];
    sessionStorage.clear();
    localStorage.clear();
    setCrypto({ randomUUID: () => 'uuid-1234', subtle: { digest } });
    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 204 });
    beaconMock = jest.fn().mockReturnValue(true);
    global.fetch = fetchMock as unknown as typeof fetch;
    Object.defineProperty(navigator, 'sendBeacon', {
      value: beaconMock,
      configurable: true,
      writable: true,
    });
  });

  afterEach(async () => {
    // 이전 테스트가 만든 모듈 인스턴스의 남은 이벤트와 타이머를 비운다.
    for (const mod of loaded) await mod.flushUsageLog({ beacon: true });
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('이벤트를 모았다가 5초 뒤 한 번에 보낸다', async () => {
    const { logUsage } = load();

    logUsage({ type: 'page_view', vodId: 7 });
    logUsage({ type: 'video_play', vodId: 7, positionSec: 3 });
    await jest.advanceTimersByTimeAsync(4999);
    expect(fetchMock).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(ENDPOINT);
    expect(init).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const body = fetchBody();
    expect(body.sessionId).toBe('uuid-1234');
    expect(body.events).toHaveLength(2);
    expect(body.events[0]).toMatchObject({
      type: 'page_view',
      vodId: 7,
      pagePath: '/',
    });
    expect(typeof body.events[0].occurredAt).toBe('string');
    expect(Number.isNaN(Date.parse(body.events[0].occurredAt))).toBe(false);
  });

  it('보낸 뒤에는 큐가 비어 같은 이벤트를 다시 보내지 않는다', async () => {
    const { logUsage } = load();

    logUsage({ type: 'page_view' });
    await jest.advanceTimersByTimeAsync(5000);
    await jest.advanceTimersByTimeAsync(10000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('20개가 되면 5초를 기다리지 않고 바로 보낸다', async () => {
    const { logUsage } = load();

    for (let i = 0; i < 19; i += 1) logUsage({ type: 'video_progress' });
    await jest.advanceTimersByTimeAsync(0);
    expect(fetchMock).not.toHaveBeenCalled();

    logUsage({ type: 'video_progress' });
    await jest.advanceTimersByTimeAsync(0);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchBody().events).toHaveLength(20);
  });

  it('pagehide 에서는 sendBeacon 으로 JSON Blob 을 즉시 보낸다', async () => {
    const { logUsage } = load();

    logUsage({ type: 'page_leave', detail: { dwell_sec: 12 } });
    window.dispatchEvent(new Event('pagehide'));

    expect(beaconMock).toHaveBeenCalledTimes(1);
    const [url, blob] = beaconMock.mock.calls[0];
    expect(url).toBe(ENDPOINT);
    expect((blob as Blob).type).toBe('application/json');
    const body = JSON.parse(await readBlob(blob as Blob));
    expect(body.events[0]).toMatchObject({
      type: 'page_leave',
      detail: { dwell_sec: 12 },
    });
    await jest.advanceTimersByTimeAsync(10000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('탭이 hidden 이 되면 beacon 으로 보낸다', () => {
    const { logUsage } = load();
    logUsage({ type: 'video_pause' });

    const spy = jest
      .spyOn(document, 'visibilityState', 'get')
      .mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    spy.mockRestore();

    expect(beaconMock).toHaveBeenCalledTimes(1);
  });

  it('보이는 상태로 돌아올 때는 보내지 않는다', () => {
    const { logUsage } = load();
    logUsage({ type: 'video_pause' });

    document.dispatchEvent(new Event('visibilitychange'));

    expect(beaconMock).not.toHaveBeenCalled();
  });

  it('flushUsageLog({ beacon: true }) 는 큐를 바로 beacon 으로 보낸다', async () => {
    const { logUsage, flushUsageLog } = load();
    logUsage({ type: 'video_leave', watchedSec: 40 });

    await flushUsageLog({ beacon: true });

    expect(beaconMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe('실패는 조용히 버린다', () => {
    it('fetch 가 거절돼도 던지지 않고 다시 보내지도 않는다', async () => {
      fetchMock.mockRejectedValue(new Error('offline'));
      const { logUsage, flushUsageLog } = load();

      logUsage({ type: 'page_view' });
      await expect(flushUsageLog()).resolves.toBeUndefined();
      await jest.advanceTimersByTimeAsync(20000);

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('fetch 가 동기적으로 던져도 삼킨다', async () => {
      fetchMock.mockImplementation(() => {
        throw new Error('boom');
      });
      const { logUsage, flushUsageLog } = load();

      logUsage({ type: 'page_view' });

      await expect(flushUsageLog()).resolves.toBeUndefined();
    });

    it('sendBeacon 이 없거나 던져도 삼킨다', async () => {
      Object.defineProperty(navigator, 'sendBeacon', {
        value: undefined,
        configurable: true,
        writable: true,
      });
      const { logUsage } = load();

      logUsage({ type: 'page_leave' });

      expect(() => window.dispatchEvent(new Event('pagehide'))).not.toThrow();
    });

    it('logUsage 는 잘못된 입력에도 던지지 않는다', () => {
      const { logUsage } = load();

      expect(() =>
        logUsage(undefined as unknown as Parameters<typeof logUsage>[0]),
      ).not.toThrow();
    });
  });

  describe('세션 ID', () => {
    it('sessionStorage 에 저장하고 같은 탭에서 재사용한다', async () => {
      const first = load();
      first.logUsage({ type: 'page_view' });
      await first.flushUsageLog();
      const firstId = fetchBody().sessionId;

      // 새 모듈 인스턴스는 새 페이지 로드를 뜻한다. load() 가 목 호출 기록도 비운다.
      const second = load();
      second.logUsage({ type: 'page_view' });
      await second.flushUsageLog();

      expect(firstId).toBe('uuid-1234');
      expect(fetchBody().sessionId).toBe('uuid-1234');
      expect(sessionStorage.length).toBe(1);
    });

    it('randomUUID 가 없으면 대체 값을 만든다', async () => {
      setCrypto({ subtle: { digest } });
      const { logUsage, flushUsageLog } = load();

      logUsage({ type: 'page_view' });
      await flushUsageLog();

      const { sessionId } = fetchBody();
      expect(typeof sessionId).toBe('string');
      expect(sessionId.length).toBeGreaterThan(0);
      expect(sessionId.length).toBeLessThanOrEqual(64);
    });

    it('sessionStorage 를 못 쓰면 메모리 값을 계속 쓴다', async () => {
      let counter = 0;
      setCrypto({
        randomUUID: () => `uuid-${(counter += 1)}`,
        subtle: { digest },
      });
      const getItem = jest
        .spyOn(Storage.prototype, 'getItem')
        .mockImplementation(() => {
          throw new Error('blocked');
        });
      const { logUsage, flushUsageLog } = load();

      logUsage({ type: 'page_view' });
      await flushUsageLog();
      logUsage({ type: 'page_view' });
      await flushUsageLog();
      getItem.mockRestore();

      expect(fetchBody(0).sessionId).toBe('uuid-1');
      expect(fetchBody(1).sessionId).toBe('uuid-1');
    });
  });

  describe('식별 정보를 보내지 않는다', () => {
    it('로그인 세션이 있어도 본문은 sessionId 와 events 뿐이고 이름·전화번호·키가 없다', async () => {
      login();
      const { logUsage, flushUsageLog } = load();

      logUsage({ type: 'page_view' });
      await flushUsageLog();

      const [, init] = fetchMock.mock.calls[0];
      expect(Object.keys(fetchBody()).sort()).toEqual(['events', 'sessionId']);
      expect(init.body).not.toContain('홍길동');
      expect(init.body).not.toContain(PHONE);
      expect(init.body).not.toContain('userName');
      expect(init.body).not.toContain('userKey');
      expect(digest).not.toHaveBeenCalled();
    });

    it('pagehide beacon 본문에도 이름·전화번호·키가 없다', async () => {
      login();
      const { logUsage } = load();

      logUsage({ type: 'page_leave' });
      window.dispatchEvent(new Event('pagehide'));

      const text = await readBlob(beaconMock.mock.calls[0][1] as Blob);
      expect(Object.keys(JSON.parse(text)).sort()).toEqual([
        'events',
        'sessionId',
      ]);
      expect(text).not.toContain('홍길동');
      expect(text).not.toContain(PHONE);
    });

    it('로그인 세션 저장소를 읽지 않는다', async () => {
      const getItem = jest.spyOn(Storage.prototype, 'getItem');
      const { logUsage, flushUsageLog } = load();

      logUsage({ type: 'page_view' });
      await flushUsageLog();

      expect(getItem).not.toHaveBeenCalledWith('auth_session');
      getItem.mockRestore();
    });
  });
});
