'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import VodCard from '@/components/vod-card';
import { VodItem } from '@/lib/types';

export default function VodListPage() {
  const router = useRouter();
  const [vods, setVods] = useState<VodItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/vod')
      .then((res) => {
        if (res.status === 401) {
          router.push('/login');
          return null;
        }
        if (!res.ok) throw new Error('불러오기 실패');
        return res.json();
      })
      .then((data) => {
        if (data) setVods(data);
      })
      .catch(() => setError('VOD 목록을 불러오지 못했습니다.'))
      .finally(() => setLoading(false));
  }, [router]);

  function handleLogout() {
    document.cookie = 'auth_verified=; Max-Age=0; path=/';
    router.push('/login');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-900">챌린지 VOD</h1>
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          로그아웃
        </Button>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {error && (
          <p className="text-center text-sm text-red-500 mb-4">{error}</p>
        )}

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-lg overflow-hidden border bg-white shadow-sm">
                <Skeleton className="aspect-video w-full" />
                <div className="p-3">
                  <Skeleton className="h-4 w-3/4" />
                </div>
              </div>
            ))}
          </div>
        ) : vods.length === 0 ? (
          <p className="text-center text-sm text-gray-500 mt-12">
            등록된 VOD가 없습니다.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {vods.map((vod) => (
              <VodCard key={vod.id} vod={vod} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
