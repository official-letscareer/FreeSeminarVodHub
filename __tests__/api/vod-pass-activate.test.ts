jest.mock('@/lib/vodPass');

import { POST } from '@/app/api/vod/pass/activate/route';
import { NextRequest } from 'next/server';
import { SSO_ACCESS_TOKEN_COOKIE } from '@/lib/sso';
import { activateVodPass } from '@/lib/vodPass';

const mockActivateVodPass = activateVodPass as jest.MockedFunction<
  typeof activateVodPass
>;

function makeReq(body?: unknown, options: { token?: string | null } = {}) {
  const { token = 'access.jwt.value' } = options;
  const req = new NextRequest('http://localhost/api/vod/pass/activate', {
    method: 'POST',
    ...(body !== undefined
      ? {
          body: typeof body === 'string' ? body : JSON.stringify(body),
          headers: { 'Content-Type': 'application/json' },
        }
      : {}),
  });
  if (token) req.cookies.set(SSO_ACCESS_TOKEN_COOKIE, token);
  return req;
}

describe('POST /api/vod/pass/activate', () => {
  beforeEach(() => jest.clearAllMocks());

  it('SSO 토큰 쿠키가 없으면 401 이고 활성화를 호출하지 않는다', async () => {
    const res = await POST(makeReq({ applicationId: 7 }, { token: null }));

    expect(res.status).toBe(401);
    expect(mockActivateVodPass).not.toHaveBeenCalled();
  });

  it('성공하면 200 과 startsAt, endsAt 을 반환한다', async () => {
    mockActivateVodPass.mockResolvedValue({
      ok: true,
      startsAt: '2026-10-12T10:00:00',
      endsAt: '2026-11-11T10:00:00',
    });

    const res = await POST(makeReq({ applicationId: 7 }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      startsAt: '2026-10-12T10:00:00',
      endsAt: '2026-11-11T10:00:00',
    });
    expect(mockActivateVodPass).toHaveBeenCalledWith('access.jwt.value', 7);
  });

  it('렛커 서버가 404 를 주면 404 를 그대로 전달한다', async () => {
    mockActivateVodPass.mockResolvedValue({
      ok: false,
      status: 404,
      message: '이용권을 찾을 수 없습니다.',
    });

    const res = await POST(makeReq({ applicationId: 999 }));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      message: '이용권을 찾을 수 없습니다.',
    });
  });

  it('렛커 서버가 409 를 주면 409 와 BE 메시지를 message 로 전달한다', async () => {
    mockActivateVodPass.mockResolvedValue({
      ok: false,
      status: 409,
      message: '이미 이용 중인 이용권과 기간이 겹칩니다.',
    });

    const res = await POST(makeReq({ applicationId: 7 }));

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      message: '이미 이용 중인 이용권과 기간이 겹칩니다.',
    });
  });

  it.each([
    ['잘못된 JSON', 'invalid'],
    ['빈 객체', {}],
    ['문자열 applicationId', { applicationId: '7' }],
    ['소수 applicationId', { applicationId: 1.5 }],
    ['null 본문', null],
  ])(
    '본문 형식 오류(%s)는 400 이고 활성화를 호출하지 않는다',
    async (_, body) => {
      const res = await POST(makeReq(body));

      expect(res.status).toBe(400);
      expect(mockActivateVodPass).not.toHaveBeenCalled();
    },
  );
});
