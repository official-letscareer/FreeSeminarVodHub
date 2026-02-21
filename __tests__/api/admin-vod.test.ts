jest.mock('@/lib/kv');

import { POST as adminAuthPost, DELETE as adminAuthDelete } from '@/app/api/admin/auth/route';
import { GET as vodGet, POST as vodPost, DELETE as vodDelete, PATCH as vodPatch } from '@/app/api/admin/vod/route';
import { PATCH as vodOrderPatch } from '@/app/api/admin/vod/order/route';
import { NextRequest } from 'next/server';
import { getVodList, addVod, deleteVod, toggleVodEmbed, updateVodOrder } from '@/lib/kv';

const mockGetVodList = getVodList as jest.MockedFunction<typeof getVodList>;
const mockAddVod = addVod as jest.MockedFunction<typeof addVod>;
const mockDeleteVod = deleteVod as jest.MockedFunction<typeof deleteVod>;
const mockToggleVodEmbed = toggleVodEmbed as jest.MockedFunction<typeof toggleVodEmbed>;
const mockUpdateVodOrder = updateVodOrder as jest.MockedFunction<typeof updateVodOrder>;

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

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/admin/auth', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

const mockVodList = [
  { id: 1, title: 'A', youtubeId: 'aaa', order: 1, embedEnabled: true, createdAt: '2024-01-01' },
  { id: 2, title: 'B', youtubeId: 'bbb', order: 2, embedEnabled: false, createdAt: '2024-01-02' },
];

// ─── 관리자 인증 ─────────────────────────────────────────────────────
describe('POST /api/admin/auth', () => {
  beforeAll(() => {
    process.env.ADMIN_PASSWORD = 'test-secret';
  });
  afterAll(() => {
    delete process.env.ADMIN_PASSWORD;
  });

  it('올바른 비밀번호 → 200 + 쿠키 설정', async () => {
    const res = await adminAuthPost(makeRequest({ password: 'test-secret' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    const cookie = res.headers.get('set-cookie');
    expect(cookie).toContain('admin_verified=1');
  });

  it('틀린 비밀번호 → 401', async () => {
    const res = await adminAuthPost(makeRequest({ password: 'wrong' }));
    expect(res.status).toBe(401);
  });

  it('비밀번호 누락 → 401', async () => {
    const res = await adminAuthPost(makeRequest({}));
    expect(res.status).toBe(401);
  });

  it('잘못된 JSON → 400', async () => {
    const req = new NextRequest('http://localhost/api/admin/auth', {
      method: 'POST',
      body: 'invalid',
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await adminAuthPost(req);
    expect(res.status).toBe(400);
  });

  it('ADMIN_PASSWORD 미설정 → 500', async () => {
    const saved = process.env.ADMIN_PASSWORD;
    delete process.env.ADMIN_PASSWORD;
    const res = await adminAuthPost(makeRequest({ password: 'anything' }));
    expect(res.status).toBe(500);
    process.env.ADMIN_PASSWORD = saved;
  });
});

describe('DELETE /api/admin/auth', () => {
  it('인증된 상태에서 로그아웃 → 200', async () => {
    const req = new NextRequest('http://localhost/api/admin/auth', { method: 'DELETE' });
    req.cookies.set('admin_verified', '1');
    const res = await adminAuthDelete(req);
    expect(res.status).toBe(200);
  });

  it('미인증 상태에서 로그아웃 → 401', async () => {
    const req = new NextRequest('http://localhost/api/admin/auth', { method: 'DELETE' });
    const res = await adminAuthDelete(req);
    expect(res.status).toBe(401);
  });
});

// ─── VOD 관리 ────────────────────────────────────────────────────────
describe('GET /api/admin/vod', () => {
  beforeEach(() => jest.clearAllMocks());

  it('미인증 → 401', async () => {
    const res = await vodGet(makeUnauthReq('GET', 'http://localhost/api/admin/vod'));
    expect(res.status).toBe(401);
  });

  it('인증 → VOD 목록 반환', async () => {
    mockGetVodList.mockResolvedValue(mockVodList);
    const res = await vodGet(makeAdminReq('GET', 'http://localhost/api/admin/vod'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
  });
});

describe('POST /api/admin/vod', () => {
  beforeEach(() => jest.clearAllMocks());

  it('미인증 → 401', async () => {
    const res = await vodPost(makeUnauthReq('POST', 'http://localhost/api/admin/vod', {
      title: 'Test', youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    }));
    expect(res.status).toBe(401);
  });

  it('유효한 유튜브 URL로 VOD 추가 → 201', async () => {
    mockAddVod.mockResolvedValue({
      id: 3, title: '테스트', youtubeId: 'dQw4w9WgXcQ', order: 3, embedEnabled: true, createdAt: '2024-01-01',
    });
    const res = await vodPost(makeAdminReq('POST', 'http://localhost/api/admin/vod', {
      title: '테스트',
      youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.youtubeId).toBe('dQw4w9WgXcQ');
  });

  it('유효하지 않은 URL → 400', async () => {
    const res = await vodPost(makeAdminReq('POST', 'http://localhost/api/admin/vod', {
      title: '테스트', youtubeUrl: 'not-a-youtube-url',
    }));
    expect(res.status).toBe(400);
  });

  it('제목 누락 → 400', async () => {
    const res = await vodPost(makeAdminReq('POST', 'http://localhost/api/admin/vod', {
      title: '', youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    }));
    expect(res.status).toBe(400);
  });

  it('youtu.be 단축 URL 지원', async () => {
    mockAddVod.mockResolvedValue({
      id: 4, title: 'Short', youtubeId: 'dQw4w9WgXcQ', order: 4, embedEnabled: true, createdAt: '2024-01-01',
    });
    const res = await vodPost(makeAdminReq('POST', 'http://localhost/api/admin/vod', {
      title: 'Short', youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
    }));
    expect(res.status).toBe(201);
  });
});

describe('DELETE /api/admin/vod', () => {
  beforeEach(() => jest.clearAllMocks());

  it('id 누락 → 400', async () => {
    const res = await vodDelete(makeAdminReq('DELETE', 'http://localhost/api/admin/vod'));
    expect(res.status).toBe(400);
  });

  it('정상 삭제 → 200', async () => {
    mockDeleteVod.mockResolvedValue();
    const res = await vodDelete(makeAdminReq('DELETE', 'http://localhost/api/admin/vod?id=1'));
    expect(res.status).toBe(200);
    expect(mockDeleteVod).toHaveBeenCalledWith(1);
  });

  it('미인증 → 401', async () => {
    const res = await vodDelete(makeUnauthReq('DELETE', 'http://localhost/api/admin/vod?id=1'));
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/admin/vod (embed toggle)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('embed 토글 성공', async () => {
    mockToggleVodEmbed.mockResolvedValue();
    const res = await vodPatch(makeAdminReq('PATCH', 'http://localhost/api/admin/vod', {
      id: 1, embedEnabled: false,
    }));
    expect(res.status).toBe(200);
    expect(mockToggleVodEmbed).toHaveBeenCalledWith(1, false);
  });

  it('잘못된 파라미터 → 400', async () => {
    const res = await vodPatch(makeAdminReq('PATCH', 'http://localhost/api/admin/vod', {
      id: 'abc', embedEnabled: false,
    }));
    expect(res.status).toBe(400);
  });

  it('미인증 → 401', async () => {
    const res = await vodPatch(makeUnauthReq('PATCH', 'http://localhost/api/admin/vod', {
      id: 1, embedEnabled: false,
    }));
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/admin/vod/order', () => {
  beforeEach(() => jest.clearAllMocks());

  it('orderedIds 누락 → 400', async () => {
    const res = await vodOrderPatch(makeAdminReq('PATCH', 'http://localhost/api/admin/vod/order', {}));
    expect(res.status).toBe(400);
  });

  it('순서 변경 성공', async () => {
    mockUpdateVodOrder.mockResolvedValue([
      { id: 2, title: 'B', youtubeId: 'bbb', order: 1, embedEnabled: false, createdAt: '2024-01-02' },
      { id: 1, title: 'A', youtubeId: 'aaa', order: 2, embedEnabled: true, createdAt: '2024-01-01' },
    ]);
    const res = await vodOrderPatch(makeAdminReq('PATCH', 'http://localhost/api/admin/vod/order', {
      orderedIds: [2, 1],
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body[0].id).toBe(2);
  });

  it('미인증 → 401', async () => {
    const res = await vodOrderPatch(makeUnauthReq('PATCH', 'http://localhost/api/admin/vod/order', {
      orderedIds: [2, 1],
    }));
    expect(res.status).toBe(401);
  });
});
