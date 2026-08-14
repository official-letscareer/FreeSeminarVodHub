'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import SiteHeader from '@/components/site-header';
import VodCard from '@/components/vod-card';
import VodListItem from '@/components/vod-list-item';
import BannerCarousel from '@/components/banner-carousel';
import PageBackdrop from '@/components/page-backdrop';
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
    // localStorage는 서버 렌더 시점엔 없어서 lazy initializer로 옮길 수 없다 —
    // 마운트 후 한 번만 읽어 하이드레이션 이후 값을 반영하는 의도적인 패턴이다.
    const saved = localStorage.getItem(STORAGE_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
    /* 배경은 아래 그러데이션 레이어가 담당한다. 여기에 bg-surface 를 겹치면 값이 거의 같아
       그러데이션이 상쇄돼 보이지 않는다. */
    <div className="relative min-h-screen">
      <PageBackdrop />

      <SiteHeader
        left={
          /*
            로그인 화면의 제목과 같은 디스플레이 서체를 쓴다 — 로그인 전후로 제품 이름이
            같은 얼굴로 보여야 한 서비스로 읽힌다. 등록된 웨이트가 600 하나뿐이라
            font-semibold 를 명시한다(다른 굵기를 주면 합성 볼드로 획이 뭉개진다).
          */
          <h1 className="font-title truncate text-xl font-semibold tracking-tight text-gray-900">
            세미나 VOD 다시보기
          </h1>
        }
        right={
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            로그아웃
          </Button>
        }
      />

      {/* 헤더·본문과 같은 max-w-5xl 폭으로 맞춘다 — 예전엔 배너만 화면 끝까지
          꽉 채워서 아래 영상 목록과 좌우 폭이 어긋나 보였다.

          모바일(640px 미만)에서는 숨긴다. 좁은 화면에서는 배너가 첫 화면을 다 차지해
          정작 보러 온 영상 목록이 스크롤 아래로 밀려난다. 기준은 이 페이지가 이미
          쓰고 있는 sm(=목록이 2열로 바뀌는 지점)에 맞춘다. */}
      <div className="hidden max-w-5xl mx-auto px-4 pt-4 sm:block">
        <BannerCarousel position="list" />
      </div>
      <main className="max-w-5xl mx-auto px-4 py-6">
        {error && (
          <p className="text-center text-sm text-red-500 mb-4">{error}</p>
        )}

        {!loading && vods.length > 0 && (
          <div className="flex justify-end mb-4 gap-1">
            <button
              onClick={() => handleViewMode('grid')}
              title="썸네일뷰"
              className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-primary/10 text-primary' : 'text-gray-400 hover:text-gray-700'}`}
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 3h7v7H3V3zm0 11h7v7H3v-7zm11-11h7v7h-7V3zm0 11h7v7h-7v-7z" />
              </svg>
            </button>
            <button
              onClick={() => handleViewMode('list')}
              title="리스트뷰"
              className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-primary/10 text-primary' : 'text-gray-400 hover:text-gray-700'}`}
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
              <div
                key={i}
                className="rounded-lg overflow-hidden border bg-white shadow-sm"
              >
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
