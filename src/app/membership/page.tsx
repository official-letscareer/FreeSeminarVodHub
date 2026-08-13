'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { navigateTo } from '@/lib/navigate';

function initialErrorFromQuery(): string {
  // SSR 시점엔 window가 없다 — 초기 렌더는 항상 빈 문자열이고, 클라이언트에서
  // hydrate 되며 실제 쿼리를 반영한다(레이아웃 시프트는 문구 하나뿐이라 무시할 만하다).
  if (typeof window === 'undefined') return '';
  const params = new URLSearchParams(window.location.search);
  return params.get('error') === 'sso_failed'
    ? '로그인에 실패했습니다. 다시 시도해주세요.'
    : '';
}

/**
 * 프리미엄 멤버십 로그인 진입점. 이름+전화번호 폼(premium_users 명단 대조)을
 * 렛츠커리어 통합 로그인(SSO)으로 바꿨다 — 이 페이지 자체는 버튼 하나만 있는
 * 진입점이고, 실제 로그인 화면은 렛츠커리어 SSO 로그인 페이지(모달 크기,
 * 무배경)에서 뜬다.
 */
export default function MembershipLoginPage() {
  const [error, setError] = useState(initialErrorFromQuery);

  function handleSsoLogin() {
    const ssoUrl = process.env.NEXT_PUBLIC_LETSCAREER_SSO_URL;
    if (!ssoUrl) {
      setError('SSO 로그인이 아직 설정되지 않았습니다.');
      return;
    }
    const redirectUri = `${window.location.origin}/auth/callback`;
    navigateTo(
      `${ssoUrl}/sso/login?redirect_uri=${encodeURIComponent(redirectUri)}&service_name=${encodeURIComponent('VOD')}`,
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">
            프리미엄 세미나 VOD
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            프리미엄 멤버십 참여자 전용입니다
          </p>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button type="button" className="w-full" onClick={handleSsoLogin}>
          <img
            src="/logo/logo-simple.svg"
            alt=""
            className="h-4 w-4 brightness-0 invert"
          />
          멤버십 가입자 로그인
        </Button>
      </div>
    </div>
  );
}
