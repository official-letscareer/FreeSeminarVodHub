jest.mock('@/lib/kv');

import {
  GET,
  POST,
  PATCH,
  DELETE,
} from '@/app/api/admin/group-access-rules/route';
import { GET as programsGet } from '@/app/api/admin/group-access-rules/programs/route';
import { NextRequest } from 'next/server';
import {
  getGroupAccessRules,
  addGroupAccessRule,
  updateGroupAccessRule,
  deleteGroupAccessRule,
} from '@/lib/kv';
import type { GroupAccessRule } from '@/lib/types';
import { createAdminSession } from '@/lib/adminSession';

const mockGetRules = getGroupAccessRules as jest.MockedFunction<
  typeof getGroupAccessRules
>;
const mockAddRule = addGroupAccessRule as jest.MockedFunction<
  typeof addGroupAccessRule
>;
const mockUpdateRule = updateGroupAccessRule as jest.MockedFunction<
  typeof updateGroupAccessRule
>;
const mockDeleteRule = deleteGroupAccessRule as jest.MockedFunction<
  typeof deleteGroupAccessRule
>;

const BASE_URL = 'http://localhost/api/admin/group-access-rules';

function makeReq(
  method: string,
  url: string,
  body?: unknown,
  admin = true,
): NextRequest {
  const req = new NextRequest(url, {
    method,
    ...(body !== undefined
      ? {
          body: JSON.stringify(body),
          headers: { 'Content-Type': 'application/json' },
        }
      : {}),
  });
  if (admin) {
    req.cookies.set('admin_verified', '1');
    req.cookies.set('admin_session', createAdminSession()!);
  }
  return req;
}

const RULE: GroupAccessRule = {
  id: 1,
  programType: 'CHALLENGE',
  programId: 42,
  programTitle: '10월 챌린지',
  programStartDate: '2026-10-20T01:00:00.000Z',
  programEndDate: '2026-11-20T13:00:00.000Z',
  planTypes: ['BASIC'],
  graceDays: 7,
  memo: null,
  createdAt: '2026-10-12T00:00:00.000Z',
};

const LIVE_RULE: GroupAccessRule = {
  ...RULE,
  id: 2,
  programType: 'LIVE',
  programId: 7,
  planTypes: [],
};

const VALID_POST = {
  programType: 'CHALLENGE',
  programId: 42,
  programTitle: ' 10월 챌린지 ',
  programStartDate: '2026-10-20T10:00:00',
  programEndDate: '2026-11-20T22:00:00',
  planTypes: ['BASIC'],
  graceDays: 7,
  memo: '  ',
};

const originalSessionSecret = process.env.ADMIN_SESSION_SECRET;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.ADMIN_SESSION_SECRET = 'group-access-session-secret-'.repeat(2);
  // 2026-10-12 12:00 KST
  jest.useFakeTimers().setSystemTime(new Date('2026-10-12T03:00:00Z'));
});

afterEach(() => {
  jest.useRealTimers();
  if (originalSessionSecret === undefined)
    delete process.env.ADMIN_SESSION_SECRET;
  else process.env.ADMIN_SESSION_SECRET = originalSessionSecret;
});

describe('미인증', () => {
  it.each([
    ['GET', () => GET(makeReq('GET', BASE_URL, undefined, false))],
    ['POST', () => POST(makeReq('POST', BASE_URL, VALID_POST, false))],
    ['PATCH', () => PATCH(makeReq('PATCH', BASE_URL, {}, false))],
    [
      'DELETE',
      () => DELETE(makeReq('DELETE', `${BASE_URL}?id=1`, undefined, false)),
    ],
    [
      'programs GET',
      () =>
        programsGet(
          makeReq(
            'GET',
            `${BASE_URL}/programs?type=CHALLENGE`,
            undefined,
            false,
          ),
        ),
    ],
  ])('%s → 401 이고 저장소를 부르지 않는다', async (_label, call) => {
    const res = await call();
    expect(res.status).toBe(401);
    expect(mockGetRules).not.toHaveBeenCalled();
    expect(mockAddRule).not.toHaveBeenCalled();
    expect(mockUpdateRule).not.toHaveBeenCalled();
    expect(mockDeleteRule).not.toHaveBeenCalled();
  });

  it('서명 세션 없이 admin_verified 만 있으면 POST 는 401 이다', async () => {
    const req = makeReq('POST', BASE_URL, VALID_POST, false);
    req.cookies.set('admin_verified', '1');
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(mockAddRule).not.toHaveBeenCalled();
  });
});

describe('GET /api/admin/group-access-rules', () => {
  it('규칙 목록을 돌려준다', async () => {
    mockGetRules.mockResolvedValue([RULE]);
    const res = await GET(makeReq('GET', BASE_URL));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([RULE]);
  });
});

describe('POST /api/admin/group-access-rules', () => {
  it('KST 날짜에 오프셋을 붙여 저장하고, 제목은 trim·빈 메모는 null 로 넣는다', async () => {
    mockAddRule.mockResolvedValue(RULE);

    const res = await POST(makeReq('POST', BASE_URL, VALID_POST));

    expect(res.status).toBe(201);
    expect(mockAddRule).toHaveBeenCalledWith({
      programType: 'CHALLENGE',
      programId: 42,
      programTitle: '10월 챌린지',
      programStartDate: '2026-10-20T01:00:00.000Z',
      programEndDate: '2026-11-20T13:00:00.000Z',
      planTypes: ['BASIC'],
      graceDays: 7,
      memo: null,
    });
    expect(await res.json()).toEqual(RULE);
  });

  it('LIVE 는 플랜 없이 등록된다', async () => {
    mockAddRule.mockResolvedValue(LIVE_RULE);
    const res = await POST(
      makeReq('POST', BASE_URL, {
        ...VALID_POST,
        programType: 'LIVE',
        programId: 7,
        planTypes: [],
      }),
    );
    expect(res.status).toBe(201);
  });

  it.each([
    ['종류가 CHALLENGE|LIVE 가 아님', { programType: 'REPORT' }],
    ['프로그램 ID 없음', { programId: undefined }],
    ['프로그램 ID 가 문자열', { programId: '42' }],
    ['LIVE 인데 플랜이 있음', { programType: 'LIVE', planTypes: ['BASIC'] }],
    ['모르는 플랜', { planTypes: ['GOLD'] }],
    ['플랜이 배열이 아님', { planTypes: 'BASIC' }],
    ['grace_days 음수', { graceDays: -1 }],
    ['grace_days 365 초과', { graceDays: 366 }],
    ['grace_days 소수', { graceDays: 1.5 }],
    // 지금(2026-10-12 12:00 KST) - 365일 = 2025-10-12 12:00 KST 보다 1초 전
    ['종료 후 365일이 지남', { programEndDate: '2025-10-12T11:59:59' }],
    ['종료일에 오프셋이 붙음', { programEndDate: '2026-11-20T22:00:00+09:00' }],
    ['시작일 형식 오류', { programStartDate: '2026-10-20' }],
    ['메모가 문자열이 아님', { memo: 3 }],
  ])('%s → 400 이고 저장하지 않는다', async (_label, overrides) => {
    const res = await POST(
      makeReq('POST', BASE_URL, { ...VALID_POST, ...overrides }),
    );
    expect(res.status).toBe(400);
    expect(mockAddRule).not.toHaveBeenCalled();
  });

  it('종료 후 365일 이내(경계 포함) 프로그램은 등록된다', async () => {
    mockAddRule.mockResolvedValue(RULE);
    for (const programEndDate of [
      '2026-10-12T11:59:59',
      '2025-10-12T12:00:00',
    ]) {
      const res = await POST(
        makeReq('POST', BASE_URL, {
          ...VALID_POST,
          programStartDate: '2025-09-01T10:00:00',
          programEndDate,
        }),
      );
      expect(res.status).toBe(201);
    }
  });

  it('종료 후 365일이 지나면 400 문구가 1년 기준이다', async () => {
    const res = await POST(
      makeReq('POST', BASE_URL, {
        ...VALID_POST,
        programEndDate: '2025-10-12T11:59:59',
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe(
      '종료 후 1년이 지난 프로그램에는 규칙을 만들 수 없습니다.',
    );
  });

  it('grace_days 0 과 365 는 허용한다', async () => {
    mockAddRule.mockResolvedValue(RULE);
    for (const graceDays of [0, 365]) {
      const res = await POST(
        makeReq('POST', BASE_URL, { ...VALID_POST, graceDays }),
      );
      expect(res.status).toBe(201);
    }
  });

  it('잘못된 JSON → 400', async () => {
    const req = new NextRequest(BASE_URL, {
      method: 'POST',
      body: 'invalid',
      headers: { 'Content-Type': 'application/json' },
    });
    req.cookies.set('admin_verified', '1');
    req.cookies.set('admin_session', createAdminSession()!);
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/admin/group-access-rules', () => {
  beforeEach(() => {
    mockGetRules.mockResolvedValue([RULE, LIVE_RULE]);
  });

  it('플랜·N·메모만 넘겨 수정한다', async () => {
    const res = await PATCH(
      makeReq('PATCH', BASE_URL, {
        id: 1,
        planTypes: ['BASIC', 'PREMIUM'],
        graceDays: 30,
        memo: ' 연장 ',
        programId: 999,
      }),
    );
    expect(res.status).toBe(200);
    expect(mockUpdateRule).toHaveBeenCalledWith(1, {
      planTypes: ['BASIC', 'PREMIUM'],
      graceDays: 30,
      memo: '연장',
    });
  });

  it.each([
    ['id 없음', { planTypes: [], graceDays: 0 }],
    ['grace_days 범위 밖', { id: 1, planTypes: [], graceDays: 400 }],
    ['플랜 형식 오류', { id: 1, planTypes: ['GOLD'], graceDays: 0 }],
    ['LIVE 규칙에 플랜', { id: 2, planTypes: ['BASIC'], graceDays: 0 }],
  ])('%s → 400', async (_label, body) => {
    const res = await PATCH(makeReq('PATCH', BASE_URL, body));
    expect(res.status).toBe(400);
    expect(mockUpdateRule).not.toHaveBeenCalled();
  });

  it('없는 규칙 → 404', async () => {
    const res = await PATCH(
      makeReq('PATCH', BASE_URL, { id: 99, planTypes: [], graceDays: 0 }),
    );
    expect(res.status).toBe(404);
    expect(mockUpdateRule).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/admin/group-access-rules', () => {
  it('id 로 삭제한다', async () => {
    const res = await DELETE(makeReq('DELETE', `${BASE_URL}?id=3`));
    expect(res.status).toBe(200);
    expect(mockDeleteRule).toHaveBeenCalledWith(3);
  });

  it('id 없음 → 400', async () => {
    const res = await DELETE(makeReq('DELETE', BASE_URL));
    expect(res.status).toBe(400);
    expect(mockDeleteRule).not.toHaveBeenCalled();
  });
});

describe('GET /api/admin/group-access-rules/programs', () => {
  const originalFetch = global.fetch;
  const PROGRAMS = [
    {
      programId: 42,
      programType: 'CHALLENGE',
      title: '10월 챌린지',
      startDate: '2026-10-20T10:00:00',
      endDate: '2026-11-20T22:00:00',
      planTypes: ['BASIC', 'PREMIUM'],
    },
  ];

  function programsReq(type = 'CHALLENGE', extraQuery = '') {
    return makeReq('GET', `${BASE_URL}/programs?type=${type}${extraQuery}`);
  }

  function mockPrograms() {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ data: { programs: PROGRAMS } }),
    });
  }

  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    global.fetch = jest.fn();
    process.env.LETSCAREER_API_URL = 'https://api.example.com';
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('type 을 그대로 넘겨 인증 헤더 없이 호출하고 programs 배열을 돌려준다', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ data: { programs: PROGRAMS } }),
    });

    const res = await programsGet(programsReq('LIVE'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(PROGRAMS);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/vod-access/programs?type=LIVE',
      { cache: 'no-store' },
    );
  });

  it('keyword 는 trim 해서 인코딩해 넘긴다', async () => {
    mockPrograms();

    const res = await programsGet(
      programsReq(
        'CHALLENGE',
        `&keyword=${encodeURIComponent('  마케팅 & 3기 ')}`,
      ),
    );

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      `https://api.example.com/api/v1/vod-access/programs?type=CHALLENGE&keyword=${encodeURIComponent('마케팅 & 3기')}`,
      { cache: 'no-store' },
    );
  });

  it('keyword 가 공백뿐이면 keyword 없이 부른다', async () => {
    mockPrograms();

    await programsGet(programsReq('CHALLENGE', '&keyword=%20%20'));

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/vod-access/programs?type=CHALLENGE',
      { cache: 'no-store' },
    );
  });

  it('keyword 가 50자면 넘기고, 51자면 400 이고 서버를 부르지 않는다', async () => {
    mockPrograms();
    const ok = await programsGet(
      programsReq('CHALLENGE', `&keyword=${'가'.repeat(50)}`),
    );
    expect(ok.status).toBe(200);

    (global.fetch as jest.Mock).mockClear();
    const res = await programsGet(
      programsReq('CHALLENGE', `&keyword=${'가'.repeat(51)}`),
    );
    expect(res.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('미인증이면 keyword 가 있어도 401 이고 서버를 부르지 않는다', async () => {
    const res = await programsGet(
      makeReq(
        'GET',
        `${BASE_URL}/programs?type=CHALLENGE&keyword=a`,
        undefined,
        false,
      ),
    );
    expect(res.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('type 이 CHALLENGE|LIVE 가 아니면 400 이고 서버를 부르지 않는다', async () => {
    const res = await programsGet(programsReq('REPORT'));
    expect(res.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('API URL env 가 없으면 502 이고 서버를 부르지 않는다', async () => {
    delete process.env.LETSCAREER_API_URL;
    const res = await programsGet(programsReq());
    expect(res.status).toBe(502);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('서버가 실패 응답(401 등)이면 502', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 401 });
    const res = await programsGet(programsReq());
    expect(res.status).toBe(502);
  });

  it('네트워크 오류면 502', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('down'));
    const res = await programsGet(programsReq());
    expect(res.status).toBe(502);
  });

  it('응답에 programs 배열이 없으면 502', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ data: {} }),
    });
    const res = await programsGet(programsReq());
    expect(res.status).toBe(502);
  });
});
