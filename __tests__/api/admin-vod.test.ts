import { POST as adminAuthPost, DELETE as adminAuthDelete } from '@/app/api/admin/auth/route';
import { NextRequest } from 'next/server';

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
