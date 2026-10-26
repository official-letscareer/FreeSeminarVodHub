import { getSsoUserProfile } from '@/lib/sso';

const originalFetch = global.fetch;

describe('getSsoUserProfile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    process.env.LETSCAREER_API_URL = 'https://api.example.com';
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('LETSCAREER_API_URL 미설정 시 null 반환 (요청 자체를 보내지 않는다)', async () => {
    delete process.env.LETSCAREER_API_URL;
    const result = await getSsoUserProfile('token');
    expect(result).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('정상 응답이면 name·챌린지 참여여부·옵션 코드를 반환하고 Bearer 헤더로 호출한다', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 200,
        message: 'OK',
        data: {
          name: '홍길동',
          isActiveChallengeParticipant: true,
          optionCodes: ['WFB1', 'LFB2'],
        },
      }),
    });

    const result = await getSsoUserProfile('access.jwt.value');

    expect(result).toEqual({
      name: '홍길동',
      isActiveChallengeParticipant: true,
      optionCodes: ['WFB1', 'LFB2'],
      canWatchVod: null,
      programApplications: [],
      userId: null,
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.com/api/v2/user/sso-profile',
      expect.objectContaining({
        headers: { Authorization: 'Bearer access.jwt.value' },
      }),
    );
  });

  it('isActiveChallengeParticipant·optionCodes가 응답에 없으면 각각 false·빈 배열로 채운다', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 200,
        message: 'OK',
        data: { name: '홍길동' },
      }),
    });

    const result = await getSsoUserProfile('access.jwt.value');

    expect(result).toEqual({
      name: '홍길동',
      isActiveChallengeParticipant: false,
      optionCodes: [],
      canWatchVod: null,
      programApplications: [],
      userId: null,
    });
  });

  describe('userId(LC-3507)', () => {
    function mockProfile(data: Record<string, unknown>) {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ status: 200, message: 'OK', data }),
      });
    }

    it('양의 정수면 그대로 파싱한다', async () => {
      mockProfile({ name: '홍길동', userId: 42 });
      const result = await getSsoUserProfile('token');
      expect(result?.userId).toBe(42);
    });

    it('없거나 잘못된 값이면 null(기록하지 않음)로 파싱한다', async () => {
      for (const userId of [undefined, 0, -1, '42', 1.5]) {
        mockProfile({ name: '홍길동', userId });
        const result = await getSsoUserProfile('token');
        expect(result?.userId).toBeNull();
      }
    });
  });

  describe('canWatchVod(LC-3438)', () => {
    function mockProfile(data: Record<string, unknown>) {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ status: 200, message: 'OK', data }),
      });
    }

    it('true 이면 true 로 파싱한다', async () => {
      mockProfile({ name: '홍길동', canWatchVod: true });
      const result = await getSsoUserProfile('token');
      expect(result?.canWatchVod).toBe(true);
    });

    it('false 이면 false 로 파싱한다', async () => {
      mockProfile({ name: '홍길동', canWatchVod: false });
      const result = await getSsoUserProfile('token');
      expect(result?.canWatchVod).toBe(false);
    });

    it('필드가 없으면 null(구버전 서버)로 파싱한다', async () => {
      mockProfile({ name: '홍길동' });
      const result = await getSsoUserProfile('token');
      expect(result?.canWatchVod).toBeNull();
    });

    it.each([['true'], [1], [0], [null], [{}]])(
      '불리언이 아닌 값(%p)은 null 로 파싱한다',
      async (value) => {
        mockProfile({ name: '홍길동', canWatchVod: value });
        const result = await getSsoUserProfile('token');
        expect(result?.canWatchVod).toBeNull();
      },
    );
  });

  describe('programApplications(그룹 접근 규칙)', () => {
    function mockProfile(data: Record<string, unknown>) {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ status: 200, message: 'OK', data }),
      });
    }

    const challenge = {
      programType: 'CHALLENGE',
      programId: 42,
      planType: 'BASIC',
      startDate: '2026-10-20T10:00:00',
      endDate: '2026-11-20T22:00:00',
    };

    it('신청 내역을 그대로 읽는다 (LIVE 의 planType null 포함)', async () => {
      const live = {
        programType: 'LIVE',
        programId: 7,
        planType: null,
        startDate: '2026-10-25T19:00:00',
        endDate: '2026-10-25T21:00:00',
      };
      mockProfile({ name: '홍길동', programApplications: [challenge, live] });

      const result = await getSsoUserProfile('token');

      expect(result?.programApplications).toEqual([challenge, live]);
    });

    it.each([[undefined], [null], ['[]'], [{}]])(
      '필드가 없거나 배열이 아니면(%p) 빈 배열',
      async (value) => {
        mockProfile({ name: '홍길동', programApplications: value });
        const result = await getSsoUserProfile('token');
        expect(result?.programApplications).toEqual([]);
      },
    );

    it('형식이 틀린 원소만 버리고 나머지는 남긴다', async () => {
      mockProfile({
        name: '홍길동',
        programApplications: [
          challenge,
          { ...challenge, programType: 'REPORT' },
          { ...challenge, programId: '42' },
          { ...challenge, planType: 3 },
          { ...challenge, startDate: '2026-10-20T10:00:00+09:00' },
          { ...challenge, endDate: '2026-13-45T99:00:00' },
          { ...challenge, endDate: undefined },
          null,
          'x',
        ],
      });

      const result = await getSsoUserProfile('token');

      expect(result?.programApplications).toEqual([challenge]);
    });
  });

  it('401(만료·위조 토큰) 응답이면 null 반환', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 401 });
    const result = await getSsoUserProfile('expired.jwt.value');
    expect(result).toBeNull();
  });

  it('네트워크 에러여도 예외를 던지지 않고 null 반환', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('network down'));
    const result = await getSsoUserProfile('token');
    expect(result).toBeNull();
  });

  it('응답 형태가 예상과 다르면(name 없음) null 반환', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ status: 200, message: 'OK', data: {} }),
    });
    const result = await getSsoUserProfile('token');
    expect(result).toBeNull();
  });
});
