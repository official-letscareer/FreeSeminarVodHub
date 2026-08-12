jest.mock('@/lib/kv');
jest.mock('@/lib/sso');

import { GET as vodListGet } from '@/app/api/vod/route';
import { GET as vodDetailGet } from '@/app/api/vod/[id]/route';
import { NextRequest } from 'next/server';
import { getEnabledVodList, getVodList } from '@/lib/kv';
import { getSsoUserProfile, SSO_ACCESS_TOKEN_COOKIE } from '@/lib/sso';

const mockGetEnabledVodList = getEnabledVodList as jest.MockedFunction<typeof getEnabledVodList>;
const mockGetVodList = getVodList as jest.MockedFunction<typeof getVodList>;
const mockGetSsoUserProfile = getSsoUserProfile as jest.MockedFunction<typeof getSsoUserProfile>;

function makeAuthReq(url: string): NextRequest {
  const req = new NextRequest(url);
  req.cookies.set('auth_verified', '1');
  return req;
}

function makeSsoReq(url: string, token = 'access.jwt.value'): NextRequest {
  const req = new NextRequest(url);
  req.cookies.set(SSO_ACCESS_TOKEN_COOKIE, token);
  return req;
}

function makeUnauthReq(url: string): NextRequest {
  return new NextRequest(url);
}

const mockList = [
  { id: 1, title: 'A', youtubeId: 'aaa', description: '설명A', order: 1, embedEnabled: true, createdAt: '2024-01-01' },
  { id: 2, title: 'B', youtubeId: 'bbb', description: '', order: 2, embedEnabled: true, createdAt: '2024-01-02' },
];

describe('GET /api/vod', () => {
  beforeEach(() => jest.clearAllMocks());

  it('인증 없을 때 401 반환', async () => {
    const res = await vodListGet(makeUnauthReq('http://localhost/api/vod'));
    expect(res.status).toBe(401);
  });

  it('인증 시 VOD 목록 반환', async () => {
    mockGetEnabledVodList.mockResolvedValue(mockList);
    const res = await vodListGet(makeAuthReq('http://localhost/api/vod'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
  });

  it('빈 VOD 목록 반환', async () => {
    mockGetEnabledVodList.mockResolvedValue([]);
    const res = await vodListGet(makeAuthReq('http://localhost/api/vod'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  describe('SSO 토큰(LC-3208)', () => {
    it('유효한 SSO 토큰이면 목록을 반환한다', async () => {
      mockGetSsoUserProfile.mockResolvedValue({ name: '홍길동' });
      mockGetEnabledVodList.mockResolvedValue(mockList);

      const res = await vodListGet(makeSsoReq('http://localhost/api/vod'));

      expect(res.status).toBe(200);
      expect(mockGetSsoUserProfile).toHaveBeenCalledWith('access.jwt.value');
    });

    it('만료·위조된 SSO 토큰이면 401을 반환하고 쿠키를 지운다', async () => {
      mockGetSsoUserProfile.mockResolvedValue(null);

      const res = await vodListGet(makeSsoReq('http://localhost/api/vod'));

      expect(res.status).toBe(401);
      const setCookie = res.headers.get('set-cookie');
      expect(setCookie).toContain(SSO_ACCESS_TOKEN_COOKIE);
      expect(setCookie).toMatch(/Max-Age=0/i);
    });

    it('auth_verified 쿠키가 있으면 SSO 검증(네트워크 호출) 없이 바로 통과한다', async () => {
      mockGetEnabledVodList.mockResolvedValue(mockList);

      const res = await vodListGet(makeAuthReq('http://localhost/api/vod'));

      expect(res.status).toBe(200);
      expect(mockGetSsoUserProfile).not.toHaveBeenCalled();
    });
  });
});

describe('GET /api/vod/[id]', () => {
  beforeEach(() => jest.clearAllMocks());

  it('인증 없을 때 401 반환', async () => {
    const res = await vodDetailGet(makeUnauthReq('http://localhost/api/vod/1'), {
      params: Promise.resolve({ id: '1' }),
    });
    expect(res.status).toBe(401);
  });

  it('존재하는 VOD 반환', async () => {
    mockGetVodList.mockResolvedValue(mockList);
    const res = await vodDetailGet(makeAuthReq('http://localhost/api/vod/1'), {
      params: Promise.resolve({ id: '1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(1);
    expect(body.youtubeId).toBe('aaa');
  });

  it('존재하지 않는 VOD 404 반환', async () => {
    mockGetVodList.mockResolvedValue(mockList);
    const res = await vodDetailGet(makeAuthReq('http://localhost/api/vod/99'), {
      params: Promise.resolve({ id: '99' }),
    });
    expect(res.status).toBe(404);
  });

  it('잘못된 ID 400 반환', async () => {
    const res = await vodDetailGet(makeAuthReq('http://localhost/api/vod/abc'), {
      params: Promise.resolve({ id: 'abc' }),
    });
    expect(res.status).toBe(400);
  });
});
