import {
  getMyVodPasses,
  activateVodPass,
  pickActivatablePass,
  expectedEndDate,
  VodPass,
} from '@/lib/vodPass';

const originalFetch = global.fetch;

function pass(overrides: Partial<VodPass>): VodPass {
  return {
    applicationId: 1,
    status: 'UNACTIVATED',
    durationDays: 30,
    startsAt: null,
    endsAt: null,
    ...overrides,
  };
}

describe('getMyVodPasses', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    process.env.LETSCAREER_API_URL = 'https://api.example.com';
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('LETSCAREER_API_URL 미설정 시 null 이고 요청을 보내지 않는다', async () => {
    delete process.env.LETSCAREER_API_URL;
    expect(await getMyVodPasses('token')).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('Bearer 헤더와 no-store 로 GET /api/v1/vod-pass 를 호출하고 passes 를 파싱한다', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 200,
        message: 'OK',
        data: {
          passes: [
            {
              applicationId: 7,
              paymentId: 70,
              startsAt: null,
              endsAt: null,
              status: 'UNACTIVATED',
              paidAmount: 9900,
              refundable: true,
              durationDays: 30,
            },
          ],
        },
      }),
    });

    const result = await getMyVodPasses('access.jwt.value');

    expect(result).toEqual([
      {
        applicationId: 7,
        status: 'UNACTIVATED',
        durationDays: 30,
        startsAt: null,
        endsAt: null,
      },
    ]);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/vod-pass',
      expect.objectContaining({
        headers: { Authorization: 'Bearer access.jwt.value' },
        cache: 'no-store',
      }),
    );
  });

  it('data 로 감싸지 않은 응답도 읽는다', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        passes: [
          {
            applicationId: 1,
            status: 'ACTIVE',
            durationDays: 30,
            startsAt: '2026-10-01T00:00:00',
            endsAt: '2026-10-31T00:00:00',
          },
        ],
      }),
    });

    const result = await getMyVodPasses('token');

    expect(result).toHaveLength(1);
    expect(result?.[0].endsAt).toBe('2026-10-31T00:00:00');
  });

  it('형태가 맞지 않는 항목은 건너뛴다', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          passes: [
            null,
            { applicationId: 'x', status: 'ACTIVE', durationDays: 30 },
            { applicationId: 2, status: 'ACTIVE', durationDays: 30 },
          ],
        },
      }),
    });

    const result = await getMyVodPasses('token');

    expect(result?.map((p) => p.applicationId)).toEqual([2]);
  });

  it('passes 가 없으면 null', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ data: {} }),
    });
    expect(await getMyVodPasses('token')).toBeNull();
  });

  it('401 응답이면 null', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 401 });
    expect(await getMyVodPasses('token')).toBeNull();
  });

  it('네트워크 에러여도 예외를 던지지 않고 null', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('network down'));
    expect(await getMyVodPasses('token')).toBeNull();
  });
});

describe('activateVodPass', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    process.env.LETSCAREER_API_URL = 'https://api.example.com';
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('POST /api/v1/vod-pass/{applicationId}/activate 를 Bearer 로 호출하고 기간을 돌려준다', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 200,
        message: 'OK',
        data: {
          applicationId: 7,
          status: 'ACTIVE',
          durationDays: 30,
          startsAt: '2026-10-12T10:00:00',
          endsAt: '2026-11-11T10:00:00',
        },
      }),
    });

    const result = await activateVodPass('access.jwt.value', 7);

    expect(result).toEqual({
      ok: true,
      startsAt: '2026-10-12T10:00:00',
      endsAt: '2026-11-11T10:00:00',
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/vod-pass/7/activate',
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer access.jwt.value' },
      }),
    );
  });

  it('404 는 상태와 BE 메시지를 그대로 돌려준다', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({
        status: 404,
        message: '이용권을 찾을 수 없습니다.',
      }),
    });

    const result = await activateVodPass('token', 999);

    expect(result).toEqual({
      ok: false,
      status: 404,
      message: '이용권을 찾을 수 없습니다.',
    });
  });

  it('409 는 상태와 BE 메시지를 그대로 돌려준다', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        status: 409,
        message: '이미 이용 중인 이용권과 기간이 겹칩니다.',
      }),
    });

    const result = await activateVodPass('token', 7);

    expect(result).toEqual({
      ok: false,
      status: 409,
      message: '이미 이용 중인 이용권과 기간이 겹칩니다.',
    });
  });

  it('오류 본문이 JSON 이 아니어도 상태를 보존한다', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('not json');
      },
    });

    const result = await activateVodPass('token', 7);

    expect(result).toMatchObject({ ok: false, status: 500 });
  });

  it('성공 응답 본문을 읽지 못해도 성공으로 돌려준다', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('empty');
      },
    });

    const result = await activateVodPass('token', 7);

    expect(result).toEqual({ ok: true, startsAt: null, endsAt: null });
  });

  it('네트워크 에러는 502 로 돌려준다', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('network down'));

    const result = await activateVodPass('token', 7);

    expect(result).toMatchObject({ ok: false, status: 502 });
  });

  it('LETSCAREER_API_URL 미설정이면 요청을 보내지 않고 502', async () => {
    delete process.env.LETSCAREER_API_URL;

    const result = await activateVodPass('token', 7);

    expect(result).toMatchObject({ ok: false, status: 502 });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('pickActivatablePass', () => {
  it('UNACTIVATED 중 applicationId 가 가장 작은 것을 고른다', () => {
    const picked = pickActivatablePass([
      pass({ applicationId: 30 }),
      pass({ applicationId: 10 }),
      pass({ applicationId: 20 }),
    ]);
    expect(picked?.applicationId).toBe(10);
  });

  it('UNACTIVATED 가 아닌 이용권은 더 작은 id 여도 건너뛴다', () => {
    const picked = pickActivatablePass([
      pass({ applicationId: 1, status: 'ACTIVE' }),
      pass({ applicationId: 2, status: 'CANCELED' }),
      pass({ applicationId: 3, status: 'EXPIRED' }),
      pass({ applicationId: 4, status: 'SCHEDULED' }),
      pass({ applicationId: 9 }),
    ]);
    expect(picked?.applicationId).toBe(9);
  });

  it('미활성 이용권이 없으면 null', () => {
    expect(
      pickActivatablePass([pass({ applicationId: 1, status: 'ACTIVE' })]),
    ).toBeNull();
    expect(pickActivatablePass([])).toBeNull();
  });
});

describe('expectedEndDate (KST)', () => {
  it('KST 자정 직전(UTC 14:59:59)은 같은 KST 날짜에 일수를 더한다', () => {
    // 2026-10-12 23:59:59 KST
    const now = new Date('2026-10-12T14:59:59Z');
    expect(expectedEndDate(30, now)).toBe('2026-11-11');
  });

  it('KST 자정(UTC 15:00:00)은 다음 KST 날짜에 일수를 더한다', () => {
    // 2026-10-13 00:00:00 KST
    const now = new Date('2026-10-12T15:00:00Z');
    expect(expectedEndDate(30, now)).toBe('2026-11-12');
  });

  it('UTC 로는 전날인 KST 새벽도 KST 날짜 기준이다', () => {
    // 2026-10-13 08:30 KST == 2026-10-12 23:30 UTC
    const now = new Date('2026-10-12T23:30:00Z');
    expect(expectedEndDate(1, now)).toBe('2026-10-14');
  });

  it('월말·연말을 넘긴다', () => {
    // 2026-12-31 12:00 KST
    const now = new Date('2026-12-31T03:00:00Z');
    expect(expectedEndDate(30, now)).toBe('2027-01-30');
  });
});
