'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import VodCard from '@/components/vod-card';
import VodListItem from '@/components/vod-list-item';
import BannerCarousel from '@/components/banner-carousel';
import { VodItem } from '@/lib/types';

type ViewMode = 'grid' | 'list';

const STORAGE_KEY = 'vod_view_mode';

export default function VodListPage() {
  const router = useRouter();
  const [vods, setVods] = useState<VodItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'list' || saved === 'grid') setViewMode(saved);
  }, []);

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

  function handleViewMode(mode: ViewMode) {
    setViewMode(mode);
    localStorage.setItem(STORAGE_KEY, mode);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-900">챌린지 VOD</h1>
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          로그아웃
        </Button>
      </header>

      <BannerCarousel position="list" />
      <main className="max-w-5xl mx-auto px-4 py-6">
        {error && (
          <p className="text-center text-sm text-red-500 mb-4">{error}</p>
        )}

        {!loading && vods.length > 0 && (
          <div className="flex justify-end mb-4 gap-1">
            <button
              onClick={() => handleViewMode('grid')}
              title="썸네일뷰"
              className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-gray-200 text-gray-900' : 'text-gray-400 hover:text-gray-700'}`}
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 3h7v7H3V3zm0 11h7v7H3v-7zm11-11h7v7h-7V3zm0 11h7v7h-7v-7z" />
              </svg>
            </button>
            <button
              onClick={() => handleViewMode('list')}
              title="리스트뷰"
              className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-gray-200 text-gray-900' : 'text-gray-400 hover:text-gray-700'}`}
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 5h18v2H3V5zm0 6h18v2H3v-2zm0 6h18v2H3v-2z" />
              </svg>
            </button>
          </div>
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
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {vods.map((vod) => (
              <VodCard key={vod.id} vod={vod} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {vods.map((vod) => (
              <VodListItem key={vod.id} vod={vod} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
