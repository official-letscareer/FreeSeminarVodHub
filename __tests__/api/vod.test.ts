import { GET as vodListGet } from '@/app/api/vod/route';
import { GET as vodDetailGet } from '@/app/api/vod/[id]/route';
import { NextRequest } from 'next/server';

jest.mock('@vercel/kv', () => ({
  kv: { get: jest.fn(), set: jest.fn(), incr: jest.fn() },
}));

import { kv } from '@vercel/kv';
const mockKv = kv as jest.Mocked<typeof kv>;

function makeAuthReq(url: string): NextRequest {
  const req = new NextRequest(url);
  req.cookies.set('auth_verified', '1');
  return req;
}

function makeUnauthReq(url: string): NextRequest {
  return new NextRequest(url);
}

const mockList = [
  { id: 1, title: 'A', youtubeId: 'aaa', order: 1, createdAt: '' },
  { id: 2, title: 'B', youtubeId: 'bbb', order: 2, createdAt: '' },
];

describe('GET /api/vod', () => {
  beforeEach(() => jest.clearAllMocks());

  it('인증 없을 때 401 반환', async () => {
    const res = await vodListGet(makeUnauthReq('http://localhost/api/vod'));
    expect(res.status).toBe(401);
  });

  it('VOD 목록 반환', async () => {
    (mockKv.get as jest.Mock).mockResolvedValue(mockList);
    const res = await vodListGet(makeAuthReq('http://localhost/api/vod'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
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
    (mockKv.get as jest.Mock).mockResolvedValue(mockList);
    const res = await vodDetailGet(makeAuthReq('http://localhost/api/vod/1'), {
      params: Promise.resolve({ id: '1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(1);
    expect(body.youtubeId).toBe('aaa');
  });

  it('존재하지 않는 VOD 404 반환', async () => {
    (mockKv.get as jest.Mock).mockResolvedValue(mockList);
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
