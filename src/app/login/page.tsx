'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { verifyChallenge, setSession } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [phoneNum, setPhoneNum] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
          <h1 className="text-2xl font-bold text-gray-900">챌린지 VOD</h1>
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
              placeholder="01012345678"
              value={phoneNum}
              onChange={(e) => setPhoneNum(e.target.value)}
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
      </div>
    </div>
  );
}
