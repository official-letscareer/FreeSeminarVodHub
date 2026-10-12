jest.mock('@/lib/kv');
jest.mock('@/lib/sso', () => ({
  ...jest.requireActual('@/lib/sso'),
  getSsoUserProfile: jest.fn(),
}));

import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/vod/log/route';
import { insertUsageLogs } from '@/lib/kv';
import { SSO_ACCESS_TOKEN_COOKIE, getSsoUserProfile } from '@/lib/sso';

const mockInsert = insertUsageLogs as jest.MockedFunction<
  typeof insertUsageLogs
>;
const mockProfile = getSsoUserProfile as jest.MockedFunction<
  typeof getSsoUserProfile
>;

const BODY = {
  sessionId: 'sess-1',
  userName: '클라이언트가 말한 이름',
  userKey: 'client-key',
  events: [
    {
      type: 'video_play',
      vodId: 7,
      youtubeId: 'abc123XYZ',
      pagePath: '/vod/7',
      positionSec: 12.34,
      detail: {},
      occurredAt: new Date().toISOString(),
    },
    { type: 'page_leave', pagePath: '/vod/7', detail: { dwell_sec: 30 } },
  ],
};

function makeReq(
  body: unknown,
  options: { sso?: string | null; verified?: boolean; ua?: string } = {},
) {
  const { sso = null, verified = false, ua = 'jest-agent' } = options;
  const req = new NextRequest('http://localhost/api/vod/log', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', 'user-agent': ua },
  });
  if (sso) req.cookies.set(SSO_ACCESS_TOKEN_COOKIE, sso);
  if (verified) req.cookies.set('auth_verified', '1');
  return req;
}

const SSO_PROFILE = {
  name: '김렛커',
  isActiveChallengeParticipant: false,
  optionCodes: [],
  canWatchVod: false,
};

describe('POST /api/vod/log', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInsert.mockResolvedValue(undefined);
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  it('인증 쿠키가 둘 다 없으면 401 이고 저장하지 않는다', async () => {
    const res = await POST(makeReq(BODY));

    expect(res.status).toBe(401);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('SSO 토큰이 있어도 프로필이 null 이면 401 이고, verified 쿠키로 되돌아가지 않는다', async () => {
    mockProfile.mockResolvedValue(null);

    const res = await POST(makeReq(BODY, { sso: 'jwt', verified: true }));

    expect(res.status).toBe(401);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('SSO 는 프로필 이름과 sso: 해시를 쓰고 클라이언트가 보낸 이름·키는 무시한다', async () => {
    mockProfile.mockResolvedValue(SSO_PROFILE);

    const res = await POST(makeReq(BODY, { sso: 'jwt', ua: 'x'.repeat(300) }));

    expect(res.status).toBe(204);
    expect(mockProfile).toHaveBeenCalledWith('jwt');
    const rows = mockInsert.mock.calls[0][0];
    expect(rows).toHaveLength(2);
    const expectedKey = createHash('sha256').update('sso:김렛커').digest('hex');
    for (const row of rows) {
      expect(row).toMatchObject({
        authMethod: 'sso',
        userName: '김렛커',
        userKey: expectedKey,
        sessionId: 'sess-1',
      });
      expect(row.userAgent).toHaveLength(200);
    }
    expect(rows[0]).toMatchObject({
      eventType: 'video_play',
      vodId: 7,
      youtubeId: 'abc123XYZ',
      pagePath: '/vod/7',
      positionSec: 12.3,
    });
  });

  it('SSO 쿠키 없이 auth_verified=1 이면 클라이언트의 이름·키를 쓴다', async () => {
    const res = await POST(makeReq(BODY, { verified: true }));

    expect(res.status).toBe(204);
    expect(mockProfile).not.toHaveBeenCalled();
    const rows = mockInsert.mock.calls[0][0];
    expect(rows[0]).toMatchObject({
      authMethod: 'verified',
      userName: '클라이언트가 말한 이름',
      userKey: 'client-key',
      userAgent: 'jest-agent',
    });
  });

  it('auth_verified 값이 1 이 아니면 인증으로 보지 않는다', async () => {
    const req = makeReq(BODY);
    req.cookies.set('auth_verified', '0');

    expect((await POST(req)).status).toBe(401);
  });

  it('JSON 이 아니면 400', async () => {
    const res = await POST(makeReq('{not json', { verified: true }));

    expect(res.status).toBe(400);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('검증에 실패하면 400', async () => {
    const res = await POST(
      makeReq(
        { sessionId: 's', events: [{ type: 'nope' }] },
        { verified: true },
      ),
    );

    expect(res.status).toBe(400);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('저장소 오류이면 서버 로그만 남기고 202 {ok:false} 를 돌려준다', async () => {
    mockInsert.mockRejectedValue({ code: 'PGRST205', message: 'no table' });

    const res = await POST(makeReq(BODY, { verified: true }));

    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ ok: false });
    expect(console.error).toHaveBeenCalled();
  });

  it('예상하지 못한 예외도 500 이 아니라 202 이다', async () => {
    mockProfile.mockRejectedValue(new Error('boom'));

    const res = await POST(makeReq(BODY, { sso: 'jwt' }));

    expect(res.status).toBe(202);
  });
});
