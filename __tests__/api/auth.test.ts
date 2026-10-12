jest.mock('@/lib/kv');

import { POST } from '@/app/api/auth/verify/route';
import { NextRequest } from 'next/server';
import { isAllowedUser, checkRateLimit, getAccessSettings } from '@/lib/kv';
import { AccessSettings } from '@/lib/types';

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
    const GUIDE = '렛츠커리어 로그인으로 이용권을 확인해주세요.';
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

      expect(body.isChallenge).toBe(true);
      expect(body.message).toBeUndefined();
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

    it('ON + canWatchVod false → 통과하지 못하고 이용권을 단정하지 않는 안내를 준다', async () => {
      gateSettings();
      mockVerifyChallenge({ isChallenge: true, canWatchVod: false });

      const { body, cookie } = await verify();

      expect(body.isChallenge).toBe(false);
      expect(body.message).toBe(GUIDE);
      expect(cookie).toBeNull();
    });

    it('ON + 챌린지가 아니고 canWatchVod false → 같은 안내를 준다', async () => {
      gateSettings();
      mockVerifyChallenge({ isChallenge: false, canWatchVod: false });

      const { body, cookie } = await verify();

      expect(body.isChallenge).toBe(false);
      expect(body.message).toBe(GUIDE);
      expect(cookie).toBeNull();
    });

    it('ON + 챌린지가 아니고 canWatchVod true → 통과시키지 않고 안내도 주지 않는다', async () => {
      gateSettings();
      mockVerifyChallenge({ isChallenge: false, canWatchVod: true });

      const { body, cookie } = await verify();

      expect(body.isChallenge).toBe(false);
      expect(body.message).toBeUndefined();
      expect(cookie).toBeNull();
    });

    it('ON + canWatchVod 필드 없음(null) → 기존 필터로 되돌아간다', async () => {
      gateSettings({
        requireChallengeOption: true,
        allowedOptionCodes: ['WFB1'],
      });
      mockVerifyChallenge({ isChallenge: true, optionCodes: ['PLUS1'] });

      const { body, cookie } = await verify();

      expect(body.isChallenge).toBe(false);
      expect(body.message).toBeUndefined();
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

        expect(body.isChallenge).toBe(true);
        expect(body.message).toBeUndefined();
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

      expect(body.isChallenge).toBe(false);
      expect(body.message).toBe(GUIDE);
    });
  });
});
