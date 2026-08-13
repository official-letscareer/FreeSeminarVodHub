jest.mock('@/lib/kv');

import { GET, PATCH } from '@/app/api/admin/access-settings/route';
import { NextRequest } from 'next/server';
import { getAccessSettings, updateAccessSettings } from '@/lib/kv';

const mockGetAccessSettings = getAccessSettings as jest.MockedFunction<
  typeof getAccessSettings
>;
const mockUpdateAccessSettings = updateAccessSettings as jest.MockedFunction<
  typeof updateAccessSettings
>;

function makeAdminReq(
  method: string,
  url: string,
  body?: unknown,
): NextRequest {
  const req = new NextRequest(url, {
    method,
    ...(body
      ? {
          body: JSON.stringify(body),
          headers: { 'Content-Type': 'application/json' },
        }
      : {}),
  });
  req.cookies.set('admin_verified', '1');
  return req;
}

function makeUnauthReq(
  method: string,
  url: string,
  body?: unknown,
): NextRequest {
  return new NextRequest(url, {
    method,
    ...(body
      ? {
          body: JSON.stringify(body),
          headers: { 'Content-Type': 'application/json' },
        }
      : {}),
  });
}

const mockSettings = {
  requireChallengeParticipation: false,
  requireChallengeOption: true,
  allowedOptionCodes: ['WFB1', 'LFB2'],
};

// ─── GET /api/admin/access-settings ───────────────────────────────────
describe('GET /api/admin/access-settings', () => {
  beforeEach(() => jest.clearAllMocks());

  it('미인증 → 401', async () => {
    const res = await GET(
      makeUnauthReq('GET', 'http://localhost/api/admin/access-settings'),
    );
    expect(res.status).toBe(401);
  });

  it('인증 → 설정 반환', async () => {
    mockGetAccessSettings.mockResolvedValue(mockSettings);
    const res = await GET(
      makeAdminReq('GET', 'http://localhost/api/admin/access-settings'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(mockSettings);
  });
});

// ─── PATCH /api/admin/access-settings ─────────────────────────────────
describe('PATCH /api/admin/access-settings', () => {
  beforeEach(() => jest.clearAllMocks());

  it('미인증 → 401', async () => {
    const res = await PATCH(
      makeUnauthReq('PATCH', 'http://localhost/api/admin/access-settings', {
        requireChallengeParticipation: true,
      }),
    );
    expect(res.status).toBe(401);
  });

  it('참여 필터 on/off 변경', async () => {
    mockUpdateAccessSettings.mockResolvedValue({
      ...mockSettings,
      requireChallengeParticipation: true,
    });
    const res = await PATCH(
      makeAdminReq('PATCH', 'http://localhost/api/admin/access-settings', {
        requireChallengeParticipation: true,
      }),
    );
    expect(res.status).toBe(200);
    expect(mockUpdateAccessSettings).toHaveBeenCalledWith({
      requireChallengeParticipation: true,
      requireChallengeOption: undefined,
      allowedOptionCodes: undefined,
    });
  });

  it('허용 옵션 코드 목록 변경', async () => {
    mockUpdateAccessSettings.mockResolvedValue({
      ...mockSettings,
      allowedOptionCodes: ['PLUS1'],
    });
    const res = await PATCH(
      makeAdminReq('PATCH', 'http://localhost/api/admin/access-settings', {
        allowedOptionCodes: ['PLUS1'],
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.allowedOptionCodes).toEqual(['PLUS1']);
  });

  it('requireChallengeParticipation이 boolean이 아니면 400', async () => {
    const res = await PATCH(
      makeAdminReq('PATCH', 'http://localhost/api/admin/access-settings', {
        requireChallengeParticipation: 'yes',
      }),
    );
    expect(res.status).toBe(400);
  });

  it('allowedOptionCodes가 문자열 배열이 아니면 400', async () => {
    const res = await PATCH(
      makeAdminReq('PATCH', 'http://localhost/api/admin/access-settings', {
        allowedOptionCodes: [1, 2],
      }),
    );
    expect(res.status).toBe(400);
  });

  it('잘못된 JSON → 400', async () => {
    const req = new NextRequest('http://localhost/api/admin/access-settings', {
      method: 'PATCH',
      body: 'invalid',
      headers: { 'Content-Type': 'application/json' },
    });
    req.cookies.set('admin_verified', '1');
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });
});
