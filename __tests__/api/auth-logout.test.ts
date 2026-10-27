import { POST } from '@/app/api/auth/logout/route';
import { SSO_ACCESS_TOKEN_COOKIE, SSO_REFRESH_TOKEN_COOKIE } from '@/lib/sso';
import { USAGE_LOG_ID_COOKIE } from '@/lib/usageLogIdentity';

describe('POST /api/auth/logout', () => {
  it('두 로그인 방식의 쿠키를 모두 지운다 — httpOnly 라 브라우저 스크립트로는 지울 수 없다', async () => {
    const res = await POST();

    expect(res.status).toBe(200);
    for (const name of [
      'auth_verified',
      USAGE_LOG_ID_COOKIE,
      SSO_ACCESS_TOKEN_COOKIE,
      SSO_REFRESH_TOKEN_COOKIE,
    ]) {
      const cookie = res.cookies.get(name);
      expect(cookie?.value).toBe('');
      expect(cookie?.expires).toEqual(new Date(0));
      expect(cookie?.path).toBe('/');
    }
  });
});
