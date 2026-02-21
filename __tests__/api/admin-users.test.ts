jest.mock('@/lib/kv');

import { GET, POST, DELETE } from '@/app/api/admin/users/route';
import { NextRequest } from 'next/server';
import { getAllowedUsers, addAllowedUser, deleteAllowedUser } from '@/lib/kv';

const mockGetAllowedUsers = getAllowedUsers as jest.MockedFunction<typeof getAllowedUsers>;
const mockAddAllowedUser = addAllowedUser as jest.MockedFunction<typeof addAllowedUser>;
const mockDeleteAllowedUser = deleteAllowedUser as jest.MockedFunction<typeof deleteAllowedUser>;

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

const mockUsers = [
  { id: 1, name: '홍길동', phoneNum: '01012345678', createdAt: '2024-01-01' },
  { id: 2, name: '김철수', phoneNum: '01087654321', createdAt: '2024-01-02' },
];

// ─── GET /api/admin/users ───────────────────────────────────────────
describe('GET /api/admin/users', () => {
  beforeEach(() => jest.clearAllMocks());

  it('미인증 → 401', async () => {
    const res = await GET(makeUnauthReq('GET', 'http://localhost/api/admin/users'));
    expect(res.status).toBe(401);
  });

  it('인증 → 유저 목록 반환', async () => {
    mockGetAllowedUsers.mockResolvedValue(mockUsers);
    const res = await GET(makeAdminReq('GET', 'http://localhost/api/admin/users'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].name).toBe('홍길동');
  });

  it('빈 유저 목록', async () => {
    mockGetAllowedUsers.mockResolvedValue([]);
    const res = await GET(makeAdminReq('GET', 'http://localhost/api/admin/users'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });
});

// ─── POST /api/admin/users ──────────────────────────────────────────
describe('POST /api/admin/users', () => {
  beforeEach(() => jest.clearAllMocks());

  it('미인증 → 401', async () => {
    const res = await POST(makeUnauthReq('POST', 'http://localhost/api/admin/users', {
      name: '홍길동', phoneNum: '01012345678',
    }));
    expect(res.status).toBe(401);
  });

  it('유효한 데이터로 유저 추가 → 201', async () => {
    mockAddAllowedUser.mockResolvedValue({
      id: 3, name: '박영희', phoneNum: '01055555555', createdAt: '2024-01-03',
    });
    const res = await POST(makeAdminReq('POST', 'http://localhost/api/admin/users', {
      name: '박영희', phoneNum: '01055555555',
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe('박영희');
    expect(mockAddAllowedUser).toHaveBeenCalledWith('박영희', '01055555555');
  });

  it('이름 빈값 → 400', async () => {
    const res = await POST(makeAdminReq('POST', 'http://localhost/api/admin/users', {
      name: '', phoneNum: '01012345678',
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain('이름');
  });

  it('전화번호 형식 오류 → 400', async () => {
    const res = await POST(makeAdminReq('POST', 'http://localhost/api/admin/users', {
      name: '홍길동', phoneNum: '12345',
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain('전화번호');
  });

  it('잘못된 JSON → 400', async () => {
    const req = new NextRequest('http://localhost/api/admin/users', {
      method: 'POST',
      body: 'invalid',
      headers: { 'Content-Type': 'application/json' },
    });
    req.cookies.set('admin_verified', '1');
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('이름 앞뒤 공백 자동 제거', async () => {
    mockAddAllowedUser.mockResolvedValue({
      id: 4, name: '홍길동', phoneNum: '01012345678', createdAt: '2024-01-04',
    });
    const res = await POST(makeAdminReq('POST', 'http://localhost/api/admin/users', {
      name: '  홍길동  ', phoneNum: '01012345678',
    }));
    expect(res.status).toBe(201);
    expect(mockAddAllowedUser).toHaveBeenCalledWith('홍길동', '01012345678');
  });
});

// ─── DELETE /api/admin/users ────────────────────────────────────────
describe('DELETE /api/admin/users', () => {
  beforeEach(() => jest.clearAllMocks());

  it('미인증 → 401', async () => {
    const res = await DELETE(makeUnauthReq('DELETE', 'http://localhost/api/admin/users?id=1'));
    expect(res.status).toBe(401);
  });

  it('정상 삭제 → 200', async () => {
    mockDeleteAllowedUser.mockResolvedValue();
    const res = await DELETE(makeAdminReq('DELETE', 'http://localhost/api/admin/users?id=1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(mockDeleteAllowedUser).toHaveBeenCalledWith(1);
  });

  it('id 누락 → 400', async () => {
    const res = await DELETE(makeAdminReq('DELETE', 'http://localhost/api/admin/users'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain('ID');
  });

  it('잘못된 id → 400', async () => {
    const res = await DELETE(makeAdminReq('DELETE', 'http://localhost/api/admin/users?id=abc'));
    expect(res.status).toBe(400);
  });
});
