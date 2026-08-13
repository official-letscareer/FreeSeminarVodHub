'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { verifyChallenge, setSession } from '@/lib/auth';
import { navigateTo } from '@/lib/navigate';

function formatPhoneNum(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

export default function LoginPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [phoneNum, setPhoneNum] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // useSearchParams()는 Suspense 경계가 필요한데 이 페이지는 이미 완전히
    // 클라이언트 렌더링이라 굳이 경계를 새로 만들지 않고 window.location에서 읽는다.
    const params = new URLSearchParams(window.location.search);
    if (params.get('error') === 'sso_failed') {
      setError('렛츠커리어 로그인에 실패했습니다. 다시 시도해주세요.');
    }
  }, []);

  function handlePhoneChange(e: React.ChangeEvent<HTMLInputElement>) {
    setPhoneNum(formatPhoneNum(e.target.value));
  }

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const isChallenge = await verifyChallenge(name.trim(), phoneNum.trim());
      if (isChallenge) {
        setSession({ name: name.trim(), phoneNum: phoneNum.trim() });
        router.push('/vod');
      } else {
        setError('현재 참여 중인 챌린지가 없습니다.');
      }
    } catch {
      setError('서버 연결에 실패했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">세미나 VOD</h1>
          <p className="mt-2 text-sm text-gray-600">이름과 전화번호로 참여를 확인합니다</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              이름
            </label>
            <Input
              id="name"
              type="text"
              placeholder="홍길동"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
              required
            />
          </div>

          <div>
            <label htmlFor="phoneNum" className="block text-sm font-medium text-gray-700 mb-1">
              전화번호
            </label>
            <Input
              id="phoneNum"
              type="tel"
              placeholder="010-1234-5678"
              value={phoneNum}
              onChange={handlePhoneChange}
              disabled={loading}
              required
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? '확인 중...' : '확인'}
          </Button>
        </form>

        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-gray-200" />
          <span className="text-xs text-gray-400">또는</span>
          <div className="h-px flex-1 bg-gray-200" />
        </div>

        {/*
          기존 이름+전화번호 폼은 그대로 둔다 — 렛커 계정이 없는 예외/프리미엄 유저는
          이 폼으로만 들어올 수 있다(LC-3208 확정 사항 2·4). SSO는 선택지 추가일 뿐이다.
        */}
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={handleSsoLogin}
        >
          <img src="/logo/logo-simple.svg" alt="" className="h-4 w-4" />
          렛츠커리어로 로그인하기
        </Button>
      </div>
    </div>
  );
}
