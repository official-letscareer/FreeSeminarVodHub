jest.mock('@/lib/kv');

import { POST } from '@/app/api/auth/verify/route';
import { NextRequest } from 'next/server';
import {
  isAllowedUser,
  checkRateLimit,
  getAccessSettings,
  getGroupAccessRules,
} from '@/lib/kv';
import { AccessSettings, GroupAccessRule } from '@/lib/types';

const mockIsAllowedUser = isAllowedUser as jest.MockedFunction<
  typeof isAllowedUser
>;
const mockCheckRateLimit = checkRateLimit as jest.MockedFunction<
  typeof checkRateLimit
>;
const mockGetAccessSettings = getAccessSettings as jest.MockedFunction<
  typeof getAccessSettings
>;

const OFF_SETTINGS: AccessSettings = {
  requireChallengeParticipation: false,
  requireChallengeOption: false,
  allowedOptionCodes: [],
  requireVodPass: false,
};

const originalFetch = global.fetch;

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/auth/verify', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/auth/verify', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    mockIsAllowedUser.mockResolvedValue(false);
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 4 });
    // 필터가 둘 다 꺼진 기본값 — LC-3208 이전과 동일하게 동작해야 하는 기존
    // 테스트들이 이 기본값으로 그대로 통과한다. 필터 자체는 별도 describe에서 검증.
    mockGetAccessSettings.mockResolvedValue(OFF_SETTINGS);
    process.env.LETSCAREER_API_URL = 'https://api.example.com';
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  // ─── 입력 검증 ─────────────────────────────────────────────────────
  it('이름 빈값이면 400 반환', async () => {
    const res = await POST(makeRequest({ name: '', phoneNum: '01012345678' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('이름을 입력해주세요.');
  });

  it('이름 누락 시 400 반환', async () => {
    const res = await POST(makeRequest({ phoneNum: '01012345678' }));
    expect(res.status).toBe(400);
  });

  it('전화번호 형식 오류 시 400 반환', async () => {
    const res = await POST(makeRequest({ name: '홍길동', phoneNum: '123' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain('전화번호');
  });

  it('잘못된 JSON 입력 시 400 반환', async () => {
    const req = new NextRequest('http://localhost/api/auth/verify', {
      method: 'POST',
      body: 'invalid json',
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('잘못된 요청입니다.');
  });

  // ─── 전화번호 자동 정규화 ──────────────────────────────────────────
  it('하이픈 포함 전화번호 자동 정규화', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => true,
    });

    const res = await POST(
      makeRequest({ name: '홍길동', phoneNum: '010-1234-5678' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isChallenge).toBe(true);
  });

  it('공백 포함 전화번호 자동 정규화', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => true,
    });

    const res = await POST(
      makeRequest({ name: '홍길동', phoneNum: '010 1234 5678' }),
    );
    expect(res.status).toBe(200);
  });

  // ─── 예외 유저 (Supabase allowed_users) ───────────────────────────
  it('예외 유저 등록됨 → isChallenge: true (외부 API 미호출)', async () => {
    mockIsAllowedUser.mockResolvedValue(true);

    const res = await POST(
      makeRequest({ name: '홍길동', phoneNum: '01012345678' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isChallenge).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('예외 유저 확인 실패 시 외부 API로 폴백', async () => {
    mockIsAllowedUser.mockRejectedValue(new Error('Supabase error'));
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => true,
    });

    const res = await POST(
      makeRequest({ name: '홍길동', phoneNum: '01012345678' }),
    );
    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalled();
  });

  // ─── 외부 API 응답 형식별 처리 ────────────────────────────────────
  it('외부 API → plain boolean true', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => true,
    });

    const res = await POST(
      makeRequest({ name: '홍길동', phoneNum: '01012345678' }),
    );
    const body = await res.json();
    expect(body.isChallenge).toBe(true);
  });

  it('외부 API → { data: true }', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: true }),
    });

    const res = await POST(
      makeRequest({ name: '홍길동', phoneNum: '01012345678' }),
    );
    const body = await res.json();
    expect(body.isChallenge).toBe(true);
  });

  it('외부 API → { data: { isChallenge: true } }', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { isChallenge: true } }),
    });

    const res = await POST(
      makeRequest({ name: '홍길동', phoneNum: '01012345678' }),
    );
    const body = await res.json();
    expect(body.isChallenge).toBe(true);
  });

  it('외부 API → { isChallenge: false }', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ isChallenge: false }),
    });

    const res = await POST(
      makeRequest({ name: '홍길동', phoneNum: '01012345678' }),
    );
    const body = await res.json();
    expect(body.isChallenge).toBe(false);
  });

  // ─── 외부 API 에러 ────────────────────────────────────────────────
  it('외부 API 404 → isChallenge: false', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 404,
    });

    const res = await POST(
      makeRequest({ name: '홍길동', phoneNum: '01012345678' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isChallenge).toBe(false);
  });

  it('외부 API 500 → 502 반환', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });

    const res = await POST(
      makeRequest({ name: '홍길동', phoneNum: '01012345678' }),
    );
    expect(res.status).toBe(502);
  });

  it('외부 API 네트워크 에러 → 502 반환', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

    const res = await POST(
      makeRequest({ name: '홍길동', phoneNum: '01012345678' }),
    );
    expect(res.status).toBe(502);
  });

  // ─── 서버 설정 ────────────────────────────────────────────────────
  it('LETSCAREER_API_URL 미설정 시 500 반환', async () => {
    delete process.env.LETSCAREER_API_URL;

    const res = await POST(
      makeRequest({ name: '홍길동', phoneNum: '01012345678' }),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toBe('서버 설정 오류입니다.');
  });

  // ─── 쿠키 설정 ────────────────────────────────────────────────────
  it('isChallenge: true 시 auth_verified 쿠키 설정', async () => {
    mockIsAllowedUser.mockResolvedValue(true);

    const res = await POST(
      makeRequest({ name: '홍길동', phoneNum: '01012345678' }),
    );
    const cookie = res.headers.get('set-cookie');
    expect(cookie).toContain('auth_verified=1');
  });

  it('isChallenge: false 시 쿠키 미설정', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 404,
    });

    const res = await POST(
      makeRequest({ name: '홍길동', phoneNum: '01012345678' }),
    );
    const cookie = res.headers.get('set-cookie');
    expect(cookie).toBeNull();
  });

  // ─── Rate Limiting ────────────────────────────────────────────────
  it('Rate Limit 초과 시 429 반환', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0 });

    const res = await POST(
      makeRequest({ name: '홍길동', phoneNum: '01012345678' }),
    );
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.message).toContain('요청이 너무 많습니다');
  });

  it('Rate Limit 실패 시에도 요청 통과', async () => {
    mockCheckRateLimit.mockRejectedValue(new Error('Redis error'));
    mockIsAllowedUser.mockResolvedValue(true);

    const res = await POST(
      makeRequest({ name: '홍길동', phoneNum: '01012345678' }),
    );
    expect(res.status).toBe(200);
  });

  // ─── 챌린지 참여자/옵션 필터(LC-3208) ────────────────────────────
  describe('챌린지 참여자/옵션 필터(LC-3208)', () => {
    it('참여 필터가 켜져 있어도 외부 API가 isChallenge:true를 준 시점에 이미 참여가 확인된 것이라 통과한다', async () => {
      mockGetAccessSettings.mockResolvedValue({
        requireChallengeParticipation: true,
        requireChallengeOption: false,
        allowedOptionCodes: [],
        requireVodPass: false,
      });
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => true,
      });

      const res = await POST(
        makeRequest({ name: '홍길동', phoneNum: '01012345678' }),
      );
      const body = await res.json();
      expect(body.isChallenge).toBe(true);
    });

    it('옵션 필터가 켜져 있고 허용 옵션 코드를 하나도 안 갖고 있으면 isChallenge:false', async () => {
      mockGetAccessSettings.mockResolvedValue({
        requireChallengeParticipation: false,
        requireChallengeOption: true,
        allowedOptionCodes: ['WFB1', 'LFB2'],
        requireVodPass: false,
      });
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: { isChallenge: true, optionCodes: ['PLUS1'] },
        }),
      });

      const res = await POST(
        makeRequest({ name: '홍길동', phoneNum: '01012345678' }),
      );
      const body = await res.json();
      expect(body.isChallenge).toBe(false);
    });

    it('옵션 필터가 켜져 있고 허용 옵션 코드를 하나라도 갖고 있으면 통과한다', async () => {
      mockGetAccessSettings.mockResolvedValue({
        requireChallengeParticipation: false,
        requireChallengeOption: true,
        allowedOptionCodes: ['WFB1', 'LFB2'],
        requireVodPass: false,
      });
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: { isChallenge: true, optionCodes: ['WFB1'] },
        }),
      });

      const res = await POST(
        makeRequest({ name: '홍길동', phoneNum: '01012345678' }),
      );
      const body = await res.json();
      expect(body.isChallenge).toBe(true);
    });

    it('설정 조회(getAccessSettings) 실패 시에도 요청은 통과시킨다(필터 미적용, fail-open)', async () => {
      mockGetAccessSettings.mockRejectedValue(new Error('Supabase error'));
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: { isChallenge: true, optionCodes: [] } }),
      });

      const res = await POST(
        makeRequest({ name: '홍길동', phoneNum: '01012345678' }),
      );
      const body = await res.json();
      expect(body.isChallenge).toBe(true);
    });

    it('예외 유저는 필터를 타지 않는다 — getAccessSettings가 호출되지 않는다', async () => {
      mockIsAllowedUser.mockResolvedValue(true);
      mockGetAccessSettings.mockResolvedValue({
        requireChallengeParticipation: true,
        requireChallengeOption: true,
        allowedOptionCodes: ['WFB1'],
        requireVodPass: false,
      });

      const res = await POST(
        makeRequest({ name: '홍길동', phoneNum: '01012345678' }),
      );
      const body = await res.json();
      expect(body.isChallenge).toBe(true);
      expect(mockGetAccessSettings).not.toHaveBeenCalled();
    });
  });

  // ─── 이용권 게이트(LC-3438) ───────────────────────────────────────
  describe('이용권 게이트(LC-3438)', () => {
    const ONE_DAY = 'Max-Age=86400';
    const ONE_YEAR = 'Max-Age=31536000';

    function gateSettings(overrides: Partial<AccessSettings> = {}) {
      mockGetAccessSettings.mockResolvedValue({
        ...OFF_SETTINGS,
        requireVodPass: true,
        ...overrides,
      });
    }

    function mockVerifyChallenge(data: Record<string, unknown>) {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data }),
      });
    }

    async function verify() {
      const res = await POST(
        makeRequest({ name: '홍길동', phoneNum: '01012345678' }),
      );
      return { body: await res.json(), cookie: res.headers.get('set-cookie') };
    }

    it('ON + canWatchVod true → 통과하고 쿠키 수명은 24시간이다', async () => {
      gateSettings();
      mockVerifyChallenge({ isChallenge: true, canWatchVod: true });

      const { body, cookie } = await verify();

      expect(body).toEqual({ isChallenge: true });
      expect(cookie).toContain('auth_verified=1');
      expect(cookie).toContain(ONE_DAY);
    });

    it('ON + canWatchVod true → 챌린지 옵션 필터는 보지 않는다', async () => {
      gateSettings({
        requireChallengeOption: true,
        allowedOptionCodes: ['WFB1'],
      });
      mockVerifyChallenge({
        isChallenge: true,
        canWatchVod: true,
        optionCodes: [],
      });

      const { body } = await verify();

      expect(body.isChallenge).toBe(true);
    });

    it('ON + canWatchVod false → 통과하지 못하고 쿠키를 내리지 않는다', async () => {
      gateSettings();
      mockVerifyChallenge({ isChallenge: true, canWatchVod: false });

      const { body, cookie } = await verify();

      expect(body).toEqual({ isChallenge: false });
      expect(cookie).toBeNull();
    });

    it('ON + 챌린지가 아니고 canWatchVod false → 통과하지 못한다', async () => {
      gateSettings();
      mockVerifyChallenge({ isChallenge: false, canWatchVod: false });

      const { body, cookie } = await verify();

      expect(body).toEqual({ isChallenge: false });
      expect(cookie).toBeNull();
    });

    it('ON + 챌린지가 아니고 canWatchVod true → 통과시키지 않는다', async () => {
      gateSettings();
      mockVerifyChallenge({ isChallenge: false, canWatchVod: true });

      const { body, cookie } = await verify();

      expect(body).toEqual({ isChallenge: false });
      expect(cookie).toBeNull();
    });

    it('ON + canWatchVod 필드 없음(null) → 기존 필터로 되돌아간다', async () => {
      gateSettings({
        requireChallengeOption: true,
        allowedOptionCodes: ['WFB1'],
      });
      mockVerifyChallenge({ isChallenge: true, optionCodes: ['PLUS1'] });

      const { body, cookie } = await verify();

      expect(body).toEqual({ isChallenge: false });
      expect(cookie).toBeNull();
    });

    it('ON + canWatchVod 필드 없음(null) + 기존 필터 통과 → 통과하되 쿠키는 24시간이다', async () => {
      gateSettings({
        requireChallengeOption: true,
        allowedOptionCodes: ['WFB1'],
      });
      mockVerifyChallenge({ isChallenge: true, optionCodes: ['WFB1'] });

      const { body, cookie } = await verify();

      expect(body.isChallenge).toBe(true);
      expect(cookie).toContain(ONE_DAY);
    });

    it('OFF + canWatchVod true/false → 기존 판정 그대로 통과하고 쿠키는 1년이다', async () => {
      for (const canWatchVod of [true, false]) {
        mockGetAccessSettings.mockResolvedValue(OFF_SETTINGS);
        mockVerifyChallenge({ isChallenge: true, canWatchVod });

        const { body, cookie } = await verify();

        expect(body).toEqual({ isChallenge: true });
        expect(cookie).toContain(ONE_YEAR);
      }
    });

    it('OFF + canWatchVod null → 기존 판정 그대로 통과하고 쿠키는 1년이다', async () => {
      mockGetAccessSettings.mockResolvedValue(OFF_SETTINGS);
      mockVerifyChallenge({ isChallenge: true });

      const { body, cookie } = await verify();

      expect(body.isChallenge).toBe(true);
      expect(cookie).toContain(ONE_YEAR);
    });

    it('예외 유저는 게이트가 켜져 있어도 쿠키가 1년이다 — 설정을 읽지 않는다', async () => {
      mockIsAllowedUser.mockResolvedValue(true);
      gateSettings();

      const { body, cookie } = await verify();

      expect(body.isChallenge).toBe(true);
      expect(cookie).toContain(ONE_YEAR);
      expect(mockGetAccessSettings).not.toHaveBeenCalled();
    });

    it('최상위 형태 응답({ isChallenge, canWatchVod })도 읽는다', async () => {
      gateSettings();
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ isChallenge: true, canWatchVod: false }),
      });

      const { body } = await verify();

      expect(body).toEqual({ isChallenge: false });
    });
  });

  // ─── 계정 존재 여부 비노출 ─────────────────────────────────────────
  // 이 경로는 비인증이다. 통과하지 못한 사유(가입 안 됨 / 가입했지만 이용권 없음 / 게이트
  // 상태)가 응답에서 갈리면 이름+전화번호 조합으로 가입 여부를 알아낼 수 있다.
  describe('그룹 접근 규칙', () => {
    const mockGetGroupAccessRules = getGroupAccessRules as jest.MockedFunction<
      typeof getGroupAccessRules
    >;

    const RULE: GroupAccessRule = {
      id: 1,
      programType: 'CHALLENGE',
      programId: 42,
      programTitle: '10월 챌린지',
      programStartDate: '2026-10-01T01:00:00+00:00',
      programEndDate: '2026-10-10T13:00:00+00:00',
      planTypes: ['BASIC'],
      graceDays: 7,
      memo: null,
      createdAt: '2026-09-01T00:00:00+00:00',
    };

    const APPLICATION = {
      programType: 'CHALLENGE',
      programId: 42,
      planType: 'BASIC',
      startDate: '2026-10-01T10:00:00',
      endDate: '2026-10-10T22:00:00',
    };

    // 2026-10-12 12:00 KST. 접근 종료는 10-17 23:59:59.999 KST = 14:59:59.999Z
    const NOW = new Date('2026-10-12T03:00:00Z');
    const SECONDS_TO_END = Math.floor(
      (new Date('2026-10-17T14:59:59.999Z').getTime() - NOW.getTime()) / 1000,
    );

    function mockVerifyChallenge(data: Record<string, unknown>) {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data }),
      });
    }

    async function verify() {
      const res = await POST(
        makeRequest({ name: '홍길동', phoneNum: '01012345678' }),
      );
      return { body: await res.json(), cookie: res.headers.get('set-cookie') };
    }

    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(NOW);
      mockGetGroupAccessRules.mockResolvedValue([RULE]);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('챌린지 참여자가 아니어도 규칙에 맞으면 통과하고, 쿠키는 접근 종료 시각까지다', async () => {
      mockVerifyChallenge({
        isChallenge: false,
        programApplications: [APPLICATION],
      });

      const { body, cookie } = await verify();

      expect(body).toEqual({ isChallenge: true });
      expect(cookie).toContain('auth_verified=1');
      expect(cookie).toContain(`Max-Age=${SECONDS_TO_END}`);
    });

    it('게이트 ON 에서 이용권이 없어도 규칙에 맞으면 통과하고, 쿠키는 기존 상한(24시간)을 넘지 않는다', async () => {
      mockGetAccessSettings.mockResolvedValue({
        ...OFF_SETTINGS,
        requireVodPass: true,
      });
      mockVerifyChallenge({
        isChallenge: true,
        canWatchVod: false,
        programApplications: [APPLICATION],
      });

      const { body, cookie } = await verify();

      expect(SECONDS_TO_END).toBeGreaterThan(86400);
      expect(body).toEqual({ isChallenge: true });
      expect(cookie).toContain('Max-Age=86400');
    });

    it('최상위 형태 응답({ isChallenge, programApplications })도 읽는다', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          isChallenge: false,
          programApplications: [APPLICATION],
        }),
      });

      const { body } = await verify();

      expect(body).toEqual({ isChallenge: true });
    });

    it('규칙에 맞지 않으면 통과하지 못하고 쿠키를 내리지 않는다 (응답 본문은 같다)', async () => {
      mockVerifyChallenge({
        isChallenge: false,
        programApplications: [{ ...APPLICATION, planType: 'LIGHT' }],
      });

      const { body, cookie } = await verify();

      expect(body).toEqual({ isChallenge: false });
      expect(cookie).toBeNull();
    });

    it('규칙 조회가 실패하면 막힌 결과를 그대로 둔다', async () => {
      mockGetGroupAccessRules.mockRejectedValue(new Error('token missing'));
      mockVerifyChallenge({
        isChallenge: false,
        programApplications: [APPLICATION],
      });

      const { body, cookie } = await verify();

      expect(body).toEqual({ isChallenge: false });
      expect(cookie).toBeNull();
    });

    it('기존 판정으로 통과하면 규칙을 조회하지 않고 쿠키도 1년 그대로다', async () => {
      mockVerifyChallenge({
        isChallenge: true,
        programApplications: [APPLICATION],
      });

      const { body, cookie } = await verify();

      expect(body).toEqual({ isChallenge: true });
      expect(cookie).toContain('Max-Age=31536000');
      expect(mockGetGroupAccessRules).not.toHaveBeenCalled();
    });

    it('VOD_ACCESS_SHARED_SECRET 이 있으면 verify-challenge 에 X-Vod-Access-Secret 헤더를 보낸다', async () => {
      process.env.VOD_ACCESS_SHARED_SECRET = 'shared-secret';
      mockVerifyChallenge({ isChallenge: false });

      try {
        await verify();
      } finally {
        delete process.env.VOD_ACCESS_SHARED_SECRET;
      }

      const [, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(init.headers).toEqual({
        'Content-Type': 'application/json; charset=utf-8',
        'X-Vod-Access-Secret': 'shared-secret',
      });
    });

    it('VOD_ACCESS_SHARED_SECRET 이 없으면 헤더 없이 보낸다 (기존 동작)', async () => {
      delete process.env.VOD_ACCESS_SHARED_SECRET;
      mockVerifyChallenge({ isChallenge: false });

      await verify();

      const [, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(init.headers).toEqual({
        'Content-Type': 'application/json; charset=utf-8',
      });
    });

    it('응답 로그에는 원본 대신 요약(isChallenge, canWatchVod, 신청 건수)만 남긴다', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      mockVerifyChallenge({
        isChallenge: false,
        programApplications: [APPLICATION],
      });

      await verify();

      const responseLog = logSpy.mock.calls.find(
        ([label]) => label === 'verify-challenge response:',
      );
      logSpy.mockRestore();
      expect(responseLog?.[1]).toBe(
        JSON.stringify({
          isChallenge: false,
          canWatchVod: null,
          programApplications: 1,
        }),
      );
    });

    it('신청 내역이 없으면(구버전 서버) 규칙을 조회하지 않는다', async () => {
      mockVerifyChallenge({ isChallenge: false });

      await verify();

      expect(mockGetGroupAccessRules).not.toHaveBeenCalled();
    });
  });

  describe('통과 실패 응답은 사유와 무관하게 동일하다', () => {
    const FAILED_CASES: Array<{
      label: string;
      settings: AccessSettings;
      mockBackend: () => void;
    }> = [
      {
        label: 'BE 404 (가입되지 않은 사용자)',
        settings: OFF_SETTINGS,
        mockBackend: () => {
          (global.fetch as jest.Mock).mockResolvedValue({
            ok: false,
            status: 404,
            text: async () => '',
          });
        },
      },
      {
        label: 'BE 200 + isChallenge false',
        settings: OFF_SETTINGS,
        mockBackend: () => {
          (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ data: { isChallenge: false } }),
          });
        },
      },
      {
        label: '게이트 ON + isChallenge false + canWatchVod false',
        settings: { ...OFF_SETTINGS, requireVodPass: true },
        mockBackend: () => {
          (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
              data: { isChallenge: false, canWatchVod: false },
            }),
          });
        },
      },
      {
        label: '게이트 ON + isChallenge true + canWatchVod false',
        settings: { ...OFF_SETTINGS, requireVodPass: true },
        mockBackend: () => {
          (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
              data: { isChallenge: true, canWatchVod: false },
            }),
          });
        },
      },
    ];

    async function run(settings: AccessSettings, mockBackend: () => void) {
      jest.clearAllMocks();
      mockIsAllowedUser.mockResolvedValue(false);
      mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 4 });
      mockGetAccessSettings.mockResolvedValue(settings);
      mockBackend();
      const res = await POST(
        makeRequest({ name: '홍길동', phoneNum: '01012345678' }),
      );
      return {
        status: res.status,
        body: await res.json(),
        cookie: res.headers.get('set-cookie'),
      };
    }

    it.each(FAILED_CASES)(
      '$label → 200 + { isChallenge: false } 이고 쿠키가 없다',
      async ({ settings, mockBackend }) => {
        const { status, body, cookie } = await run(settings, mockBackend);

        expect(status).toBe(200);
        expect(body).toEqual({ isChallenge: false });
        expect(Object.keys(body)).not.toContain('message');
        expect(cookie).toBeNull();
      },
    );

    it('사유가 달라도 상태 코드·본문이 서로 같다', async () => {
      const results = [];
      for (const { settings, mockBackend } of FAILED_CASES) {
        const { status, body } = await run(settings, mockBackend);
        results.push(JSON.stringify({ status, body }));
      }

      expect(new Set(results).size).toBe(1);
    });

    it('챌린지가 아니면 이용권 설정을 읽지 않는다 — 사유별로 처리 경로가 갈리지 않는다', async () => {
      for (const { settings, mockBackend } of FAILED_CASES.slice(0, 3)) {
        await run(settings, mockBackend);
        expect(mockGetAccessSettings).not.toHaveBeenCalled();
      }
    });

    it('통과 응답에도 message 키가 없다', async () => {
      const { body } = await run(
        { ...OFF_SETTINGS, requireVodPass: true },
        () => {
          (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
              data: { isChallenge: true, canWatchVod: true },
            }),
          });
        },
      );

      expect(body).toEqual({ isChallenge: true });
    });
  });
});
