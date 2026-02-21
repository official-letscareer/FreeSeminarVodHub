'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import VideoPlayer from '@/components/video-player';
import CopyProtection from '@/components/copy-protection';
import BannerCarousel from '@/components/banner-carousel';
import { VodItem } from '@/lib/types';

export default function VodPlayerPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [vod, setVod] = useState<VodItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    fetch(`/api/vod/${id}`)
      .then((res) => {
        if (res.status === 401) {
          router.push('/login');
          return null;
        }
        if (res.status === 404) {
          setError('존재하지 않는 VOD입니다.');
          return null;
        }
        if (!res.ok) throw new Error('불러오기 실패');
        return res.json();
      })
      .then((data) => {
        if (data) setVod(data);
      })
      .catch(() => setError('VOD를 불러오지 못했습니다.'))
      .finally(() => setLoading(false));
  }, [id, router]);

  return (
    <CopyProtection>
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/vod')}
          className="flex items-center gap-1"
        >
          ← VOD 목록
        </Button>
        {vod && (
          <h1 className="text-base font-semibold text-gray-900 truncate">{vod.title}</h1>
        )}
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {loading ? (
          <div className="aspect-video bg-gray-200 rounded-lg animate-pulse" />
        ) : error ? (
          <p className="text-center text-sm text-red-500 mt-12">{error}</p>
        ) : vod ? (
          <div className="space-y-3">
            <VideoPlayer youtubeId={vod.youtubeId} />
            <div>
              <p className="text-sm font-medium text-gray-800">{vod.title}</p>
              {vod.publishedAt && (
                <p className="text-xs text-gray-400 mt-0.5">{vod.publishedAt}</p>
              )}
              {vod.description && (
                <p className="text-sm text-gray-500 mt-2 whitespace-pre-line">{vod.description}</p>
              )}
            </div>
            <div className="pt-2">
              <BannerCarousel position="player" />
            </div>
          </div>
        ) : null}
      </main>
    </div>
    </CopyProtection>
  );
}
