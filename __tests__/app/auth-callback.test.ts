import { GET } from '@/app/auth/callback/route';
import { GET as popupGET } from '@/app/auth/callback/popup/route';
import { NextRequest } from 'next/server';
import { SSO_ACCESS_TOKEN_COOKIE, SSO_REFRESH_TOKEN_COOKIE } from '@/lib/sso';
import { USAGE_LOG_ID_COOKIE } from '@/lib/usageLogIdentity';

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
    // 예전 계정의 refreshToken 이 남지 않게 빈 값으로 지운다.
    expect(res.cookies.get(SSO_REFRESH_TOKEN_COOKIE)?.value).toBe('');
  });

  it('token이 없으면 /login?error=sso_failed로 리다이렉트한다', async () => {
    const res = await GET(makeRequest(''));

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe(
      'http://localhost/login?error=sso_failed',
    );
    expect(res.cookies.get(SSO_ACCESS_TOKEN_COOKIE)).toBeUndefined();
  });

  describe('소셜 로그인(카카오/네이버) — result= JSON 포맷', () => {
    it('result 안의 accessToken/refreshToken을 꺼내 쿠키를 설정한다', async () => {
      const result = JSON.stringify({
        accessToken: 'social.access.jwt',
        refreshToken: 'social.refresh.jwt',
        isNew: false,
      });
      const res = await GET(
        makeRequest(`?result=${encodeURIComponent(result)}`),
      );

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('http://localhost/vod');
      expect(res.cookies.get(SSO_ACCESS_TOKEN_COOKIE)?.value).toBe(
        'social.access.jwt',
      );
      expect(res.cookies.get(SSO_REFRESH_TOKEN_COOKIE)?.value).toBe(
        'social.refresh.jwt',
      );
    });

    it('result가 JSON으로 파싱되지 않으면 에러 리다이렉트로 처리한다', async () => {
      const res = await GET(makeRequest('?result=not-json'));

      expect(res.headers.get('location')).toBe(
        'http://localhost/login?error=sso_failed',
      );
    });

    it('result에 accessToken이 없으면 에러 리다이렉트로 처리한다', async () => {
      const result = JSON.stringify({ isNew: true });
      const res = await GET(
        makeRequest(`?result=${encodeURIComponent(result)}`),
      );

      expect(res.headers.get('location')).toBe(
        'http://localhost/login?error=sso_failed',
      );
    });

    it('token과 result가 둘 다 있으면 token을 우선한다', async () => {
      const result = JSON.stringify({ accessToken: 'social.access.jwt' });
      const res = await GET(
        makeRequest(
          `?token=email.access.jwt&result=${encodeURIComponent(result)}`,
        ),
      );

      expect(res.cookies.get(SSO_ACCESS_TOKEN_COOKIE)?.value).toBe(
        'email.access.jwt',
      );
    });
  });

  // 이름+전화번호 로그인 쿠키(auth_verified)가 남아 있으면 접근 판정이 SSO 토큰보다 그것을 먼저
  // 통과시켜, 다른 계정으로 로그인해도 예전 사람으로 보이고 이용 로그도 예전 이름으로 남았다.
  describe.each([
    ['/auth/callback', GET],
    ['/auth/callback/popup', popupGET],
  ])('%s — 예전 로그인 쿠키 정리 (LC-3515)', (_path, handler) => {
    it('로그인에 성공하면 이름+전화번호 로그인 쿠키를 지운다', async () => {
      const res = await handler(makeRequest('?token=access.jwt.value'));

      for (const name of ['auth_verified', USAGE_LOG_ID_COOKIE]) {
        expect(res.cookies.get(name)?.value).toBe('');
        expect(res.cookies.get(name)?.expires).toEqual(new Date(0));
      }
    });

    it('새 토큰에 refreshToken 이 없으면 예전 계정의 refreshToken 쿠키를 지운다', async () => {
      const res = await handler(makeRequest('?token=access.jwt.value'));

      expect(res.cookies.get(SSO_ACCESS_TOKEN_COOKIE)?.value).toBe(
        'access.jwt.value',
      );
      expect(res.cookies.get(SSO_REFRESH_TOKEN_COOKIE)?.value).toBe('');
    });

    it('로그인에 실패하면 기존 쿠키를 건드리지 않는다', async () => {
      const res = await handler(makeRequest(''));

      expect(res.cookies.get('auth_verified')).toBeUndefined();
      expect(res.cookies.get(SSO_REFRESH_TOKEN_COOKIE)).toBeUndefined();
    });
  });
});
