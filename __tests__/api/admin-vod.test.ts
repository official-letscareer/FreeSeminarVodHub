import { POST as adminAuthPost, DELETE as adminAuthDelete } from '@/app/api/admin/auth/route';
import { GET as vodGet, POST as vodPost, DELETE as vodDelete } from '@/app/api/admin/vod/route';
import { PATCH as vodOrderPatch } from '@/app/api/admin/vod/order/route';
import { NextRequest } from 'next/server';

jest.mock('@vercel/kv', () => ({
  kv: {
    get: jest.fn(),
    set: jest.fn(),
    incr: jest.fn(),
  },
}));

import { kv } from '@vercel/kv';
const mockKv = kv as jest.Mocked<typeof kv>;

function makeAdminReq(method: string, url: string, body?: unknown): NextRequest {
  const req = new NextRequest(url, {
    method,
    ...(body ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}),
  });
  req.cookies.set('admin_verified', '1');
  return req;
}

function makeUnauthReq(method: string, url: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    ...(body ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}),
  });
}

function makeRequest(body: unknown, cookies: Record<string, string> = {}): NextRequest {
  const req = new NextRequest('http://localhost/api/admin/auth', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
  Object.entries(cookies).forEach(([key, value]) => {
    req.cookies.set(key, value);
  });
  return req;
}

describe('POST /api/admin/auth', () => {
  beforeAll(() => {
    process.env.ADMIN_PASSWORD = 'test-secret';
  });
  afterAll(() => {
    delete process.env.ADMIN_PASSWORD;
  });

  it('올바른 비밀번호로 인증 성공 + 쿠키 설정', async () => {
    const res = await adminAuthPost(makeRequest({ password: 'test-secret' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    const cookie = res.headers.get('set-cookie');
    expect(cookie).toContain('admin_verified=1');
  });

  it('틀린 비밀번호로 401 반환', async () => {
    const res = await adminAuthPost(makeRequest({ password: 'wrong' }));
    expect(res.status).toBe(401);
  });

  it('비밀번호 누락 시 401 반환', async () => {
    const res = await adminAuthPost(makeRequest({}));
    expect(res.status).toBe(401);
  });

  it('잘못된 JSON 입력 시 400 반환', async () => {
    const req = new NextRequest('http://localhost/api/admin/auth', {
      method: 'POST',
      body: 'invalid',
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await adminAuthPost(req);
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/admin/auth', () => {
  it('admin_verified 쿠키 있을 때 로그아웃 성공', async () => {
    const req = new NextRequest('http://localhost/api/admin/auth', { method: 'DELETE' });
    req.cookies.set('admin_verified', '1');
    const res = await adminAuthDelete(req);
    expect(res.status).toBe(200);
  });

  it('admin_verified 쿠키 없을 때 401 반환', async () => {
    const req = new NextRequest('http://localhost/api/admin/auth', { method: 'DELETE' });
    const res = await adminAuthDelete(req);
    expect(res.status).toBe(401);
  });
});

describe('GET /api/admin/vod', () => {
  beforeEach(() => jest.clearAllMocks());

  it('인증 없을 때 401 반환', async () => {
    const res = await vodGet(makeUnauthReq('GET', 'http://localhost/api/admin/vod'));
    expect(res.status).toBe(401);
  });

  it('VOD 목록 반환', async () => {
    const list = [{ id: 1, title: 'A', youtubeId: 'abc', order: 1, createdAt: '' }];
    (mockKv.get as jest.Mock).mockResolvedValue(list);
    const res = await vodGet(makeAdminReq('GET', 'http://localhost/api/admin/vod'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
  });
});

describe('POST /api/admin/vod', () => {
  beforeEach(() => jest.clearAllMocks());

  it('인증 없을 때 401 반환', async () => {
    const res = await vodPost(makeUnauthReq('POST', 'http://localhost/api/admin/vod', { title: 'T', youtubeUrl: 'abc123xyz12' }));
    expect(res.status).toBe(401);
  });

  it('유효한 유튜브 URL로 VOD 추가', async () => {
    (mockKv.get as jest.Mock).mockResolvedValue([]);
    (mockKv.incr as jest.Mock).mockResolvedValue(1);
    (mockKv.set as jest.Mock).mockResolvedValue('OK');
    const res = await vodPost(makeAdminReq('POST', 'http://localhost/api/admin/vod', {
      title: '테스트',
      youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.youtubeId).toBe('dQw4w9WgXcQ');
  });

  it('유효하지 않은 URL로 400 반환', async () => {
    const res = await vodPost(makeAdminReq('POST', 'http://localhost/api/admin/vod', {
      title: '테스트',
      youtubeUrl: 'not-a-youtube-url',
    }));
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/admin/vod', () => {
  beforeEach(() => jest.clearAllMocks());

  it('id 없을 때 400 반환', async () => {
    const res = await vodDelete(makeAdminReq('DELETE', 'http://localhost/api/admin/vod'));
    expect(res.status).toBe(400);
  });

  it('정상 삭제', async () => {
    (mockKv.get as jest.Mock).mockResolvedValue([
      { id: 1, title: 'A', youtubeId: 'a', order: 1, createdAt: '' },
    ]);
    (mockKv.set as jest.Mock).mockResolvedValue('OK');
    const res = await vodDelete(makeAdminReq('DELETE', 'http://localhost/api/admin/vod?id=1'));
    expect(res.status).toBe(200);
  });
});

describe('PATCH /api/admin/vod/order', () => {
  beforeEach(() => jest.clearAllMocks());

  it('orderedIds 배열 없을 때 400 반환', async () => {
    const res = await vodOrderPatch(makeAdminReq('PATCH', 'http://localhost/api/admin/vod/order', {}));
    expect(res.status).toBe(400);
  });

  it('순서 변경 성공', async () => {
    const list = [
      { id: 1, title: 'A', youtubeId: 'a', order: 1, createdAt: '' },
      { id: 2, title: 'B', youtubeId: 'b', order: 2, createdAt: '' },
    ];
    (mockKv.get as jest.Mock).mockResolvedValue(list);
    (mockKv.set as jest.Mock).mockResolvedValue('OK');
    const res = await vodOrderPatch(makeAdminReq('PATCH', 'http://localhost/api/admin/vod/order', { orderedIds: [2, 1] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body[0].id).toBe(2);
  });
});
