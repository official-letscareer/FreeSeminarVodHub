import { middleware } from '@/middleware';
import { NextRequest } from 'next/server';
import { SSO_ACCESS_TOKEN_COOKIE } from '@/lib/sso';

function makeRequest(
  path: string,
  cookies: Record<string, string> = {},
): NextRequest {
  const req = new NextRequest(`http://localhost${path}`);
  for (const [name, value] of Object.entries(cookies)) {
    req.cookies.set(name, value);
  }
  return req;
}

describe('middleware — /vod 게이트', () => {
  it('auth_verified 쿠키만 있어도 통과한다 (기존 이름+전화번호 인증)', () => {
    const res = middleware(makeRequest('/vod', { auth_verified: '1' }));
    expect(res.status).toBe(200);
  });

  it('SSO 쿠키만 있어도 통과한다', () => {
    const res = middleware(
      makeRequest('/vod', { [SSO_ACCESS_TOKEN_COOKIE]: 'access.jwt.value' }),
    );
    expect(res.status).toBe(200);
  });

  it('둘 다 없으면 /login으로 리다이렉트한다', () => {
    const res = middleware(makeRequest('/vod'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost/login');
  });

  it('두 쿠키가 모두 있어도 통과한다', () => {
    const res = middleware(
      makeRequest('/vod', {
        auth_verified: '1',
        [SSO_ACCESS_TOKEN_COOKIE]: 'access.jwt.value',
      }),
    );
    expect(res.status).toBe(200);
  });
});

describe('middleware — /vod/[id]는 여기서 막지 않는다 (LC-3208 OG 미리보기)', () => {
  it('쿠키가 하나도 없어도 리다이렉트하지 않는다 — 링크 미리보기 크롤러도 통과해야 generateMetadata가 뜬다', () => {
    const res = middleware(makeRequest('/vod/1'));
    expect(res.status).toBe(200);
  });

  it('인증 쿠키가 있을 때도 그대로 통과한다', () => {
    const res = middleware(makeRequest('/vod/1', { auth_verified: '1' }));
    expect(res.status).toBe(200);
  });
});

describe('middleware — /admin/vod 게이트 (회귀 확인, 이번 변경과 무관)', () => {
  it('admin_verified 없으면 /admin으로 리다이렉트한다', () => {
    const res = middleware(makeRequest('/admin/vod'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost/admin');
  });
});
