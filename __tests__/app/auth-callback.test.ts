import { GET } from '@/app/auth/callback/route';
import { NextRequest } from 'next/server';
import { SSO_ACCESS_TOKEN_COOKIE, SSO_REFRESH_TOKEN_COOKIE } from '@/lib/sso';

function makeRequest(query: string): NextRequest {
  return new NextRequest(`http://localhost/auth/callback${query}`);
}

describe('GET /auth/callback', () => {
  it('token이 있으면 쿠키를 설정하고 /vod로 리다이렉트한다', async () => {
    const res = await GET(
      makeRequest('?token=access.jwt.value&refreshToken=refresh.jwt.value'),
    );

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost/vod');

    const accessCookie = res.cookies.get(SSO_ACCESS_TOKEN_COOKIE);
    expect(accessCookie?.value).toBe('access.jwt.value');
    expect(accessCookie?.httpOnly).toBe(true);

    const refreshCookie = res.cookies.get(SSO_REFRESH_TOKEN_COOKIE);
    expect(refreshCookie?.value).toBe('refresh.jwt.value');
    expect(refreshCookie?.httpOnly).toBe(true);
  });

  it('refreshToken 없이 token만 있어도 성공 처리한다', async () => {
    const res = await GET(makeRequest('?token=access.jwt.value'));

    expect(res.status).toBe(307);
    expect(res.cookies.get(SSO_ACCESS_TOKEN_COOKIE)?.value).toBe(
      'access.jwt.value',
    );
    expect(res.cookies.get(SSO_REFRESH_TOKEN_COOKIE)).toBeUndefined();
  });

  it('token이 없으면 /login?error=sso_failed로 리다이렉트한다', async () => {
    const res = await GET(makeRequest(''));

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe(
      'http://localhost/login?error=sso_failed',
    );
    expect(res.cookies.get(SSO_ACCESS_TOKEN_COOKIE)).toBeUndefined();
  });
});
