jest.mock('@/lib/kv');

import { POST } from '@/app/api/auth/verify/route';
import { NextRequest } from 'next/server';
import { isAllowedUser, checkRateLimit, getAccessSettings } from '@/lib/kv';
import { AccessSettings } from '@/lib/types';

const mockIsAllowedUser = isAllowedUser as jest.MockedFunction<typeof isAllowedUser>;
const mockCheckRateLimit = checkRateLimit as jest.MockedFunction<typeof checkRateLimit>;
const mockGetAccessSettings = getAccessSettings as jest.MockedFunction<typeof getAccessSettings>;

const OFF_SETTINGS: AccessSettings = {
  requireChallengeParticipation: false,
  requireChallengeOption: false,
  allowedOptionCodes: [],
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

    const res = await POST(makeRequest({ name: '홍길동', phoneNum: '010-1234-5678' }));
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

    const res = await POST(makeRequest({ name: '홍길동', phoneNum: '010 1234 5678' }));
    expect(res.status).toBe(200);
  });

  // ─── 예외 유저 (Supabase allowed_users) ───────────────────────────
  it('예외 유저 등록됨 → isChallenge: true (외부 API 미호출)', async () => {
    mockIsAllowedUser.mockResolvedValue(true);

    const res = await POST(makeRequest({ name: '홍길동', phoneNum: '01012345678' }));
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

    const res = await POST(makeRequest({ name: '홍길동', phoneNum: '01012345678' }));
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

    const res = await POST(makeRequest({ name: '홍길동', phoneNum: '01012345678' }));
    const body = await res.json();
    expect(body.isChallenge).toBe(true);
  });

  it('외부 API → { data: true }', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: true }),
    });

    const res = await POST(makeRequest({ name: '홍길동', phoneNum: '01012345678' }));
    const body = await res.json();
    expect(body.isChallenge).toBe(true);
  });

  it('외부 API → { data: { isChallenge: true } }', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { isChallenge: true } }),
    });

    const res = await POST(makeRequest({ name: '홍길동', phoneNum: '01012345678' }));
    const body = await res.json();
    expect(body.isChallenge).toBe(true);
  });

  it('외부 API → { isChallenge: false }', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ isChallenge: false }),
    });

    const res = await POST(makeRequest({ name: '홍길동', phoneNum: '01012345678' }));
    const body = await res.json();
    expect(body.isChallenge).toBe(false);
  });

  // ─── 외부 API 에러 ────────────────────────────────────────────────
  it('외부 API 404 → isChallenge: false', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 404,
    });

    const res = await POST(makeRequest({ name: '홍길동', phoneNum: '01012345678' }));
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

    const res = await POST(makeRequest({ name: '홍길동', phoneNum: '01012345678' }));
    expect(res.status).toBe(502);
  });

  it('외부 API 네트워크 에러 → 502 반환', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

    const res = await POST(makeRequest({ name: '홍길동', phoneNum: '01012345678' }));
    expect(res.status).toBe(502);
  });

  // ─── 서버 설정 ────────────────────────────────────────────────────
  it('LETSCAREER_API_URL 미설정 시 500 반환', async () => {
    delete process.env.LETSCAREER_API_URL;

    const res = await POST(makeRequest({ name: '홍길동', phoneNum: '01012345678' }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toBe('서버 설정 오류입니다.');
  });

  // ─── 쿠키 설정 ────────────────────────────────────────────────────
  it('isChallenge: true 시 auth_verified 쿠키 설정', async () => {
    mockIsAllowedUser.mockResolvedValue(true);

    const res = await POST(makeRequest({ name: '홍길동', phoneNum: '01012345678' }));
    const cookie = res.headers.get('set-cookie');
    expect(cookie).toContain('auth_verified=1');
  });

  it('isChallenge: false 시 쿠키 미설정', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 404,
    });

    const res = await POST(makeRequest({ name: '홍길동', phoneNum: '01012345678' }));
    const cookie = res.headers.get('set-cookie');
    expect(cookie).toBeNull();
  });

  // ─── Rate Limiting ────────────────────────────────────────────────
  it('Rate Limit 초과 시 429 반환', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0 });

    const res = await POST(makeRequest({ name: '홍길동', phoneNum: '01012345678' }));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.message).toContain('요청이 너무 많습니다');
  });

  it('Rate Limit 실패 시에도 요청 통과', async () => {
    mockCheckRateLimit.mockRejectedValue(new Error('Redis error'));
    mockIsAllowedUser.mockResolvedValue(true);

    const res = await POST(makeRequest({ name: '홍길동', phoneNum: '01012345678' }));
    expect(res.status).toBe(200);
  });

  // ─── 챌린지 참여자/옵션 필터(LC-3208) ────────────────────────────
  describe('챌린지 참여자/옵션 필터(LC-3208)', () => {
    it('참여 필터가 켜져 있어도 외부 API가 isChallenge:true를 준 시점에 이미 참여가 확인된 것이라 통과한다', async () => {
      mockGetAccessSettings.mockResolvedValue({
        requireChallengeParticipation: true,
        requireChallengeOption: false,
        allowedOptionCodes: [],
      });
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => true,
      });

      const res = await POST(makeRequest({ name: '홍길동', phoneNum: '01012345678' }));
      const body = await res.json();
      expect(body.isChallenge).toBe(true);
    });

    it('옵션 필터가 켜져 있고 허용 옵션 코드를 하나도 안 갖고 있으면 isChallenge:false', async () => {
      mockGetAccessSettings.mockResolvedValue({
        requireChallengeParticipation: false,
        requireChallengeOption: true,
        allowedOptionCodes: ['WFB1', 'LFB2'],
      });
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: { isChallenge: true, optionCodes: ['PLUS1'] } }),
      });

      const res = await POST(makeRequest({ name: '홍길동', phoneNum: '01012345678' }));
      const body = await res.json();
      expect(body.isChallenge).toBe(false);
    });

    it('옵션 필터가 켜져 있고 허용 옵션 코드를 하나라도 갖고 있으면 통과한다', async () => {
      mockGetAccessSettings.mockResolvedValue({
        requireChallengeParticipation: false,
        requireChallengeOption: true,
        allowedOptionCodes: ['WFB1', 'LFB2'],
      });
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: { isChallenge: true, optionCodes: ['WFB1'] } }),
      });

      const res = await POST(makeRequest({ name: '홍길동', phoneNum: '01012345678' }));
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

      const res = await POST(makeRequest({ name: '홍길동', phoneNum: '01012345678' }));
      const body = await res.json();
      expect(body.isChallenge).toBe(true);
    });

    it('예외 유저는 필터를 타지 않는다 — getAccessSettings가 호출되지 않는다', async () => {
      mockIsAllowedUser.mockResolvedValue(true);
      mockGetAccessSettings.mockResolvedValue({
        requireChallengeParticipation: true,
        requireChallengeOption: true,
        allowedOptionCodes: ['WFB1'],
      });

      const res = await POST(makeRequest({ name: '홍길동', phoneNum: '01012345678' }));
      const body = await res.json();
      expect(body.isChallenge).toBe(true);
      expect(mockGetAccessSettings).not.toHaveBeenCalled();
    });
  });
});
