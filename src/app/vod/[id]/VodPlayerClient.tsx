'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import SiteHeader from '@/components/site-header';
import PageBackdrop from '@/components/page-backdrop';
import VideoPlayer from '@/components/video-player';
import CopyProtection from '@/components/copy-protection';
import BannerCarousel from '@/components/banner-carousel';
import { VodItem } from '@/lib/types';

export default function VodPlayerClient({ id }: { id: string }) {
  const router = useRouter();

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
      <div className="relative min-h-screen">
        <PageBackdrop />
        <SiteHeader
          left={
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              {/*
                되돌아갈 곳을 이름으로 밝힌다("뒤로"가 아니라 "VOD 목록"). 직접 링크로 들어온
                사람에게는 브라우저 히스토리가 없어 router.back() 이 엉뚱한 곳으로 가므로
                목록 경로로 명시해 보낸다.

                화살표는 문자 ←(U+2190) 대신 SVG 로 그린다. 문자 화살표는 폰트마다 굵기와
                세로 위치가 달라 옆 글자와 어긋나 보인다.
              */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push('/vod')}
                className="-ml-2 flex shrink-0 items-center gap-1.5 text-gray-600 hover:bg-white/70 hover:text-gray-900"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M10 3.5L5.5 8L10 12.5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                VOD 목록
              </Button>
            </div>
          }
        />

        {/* 목록·헤더와 같은 max-w-5xl 을 쓴다. 여기만 max-w-3xl 이라 목록에서 넘어오면
            좌우가 안쪽으로 확 좁아졌고, 그 폭에 맞춰 그려지는 배너도 유독 작아 보였다. */}
        <main className="max-w-5xl mx-auto px-4 py-6">
          {loading ? (
            <div className="aspect-video bg-gray-200 rounded-lg animate-pulse" />
          ) : error ? (
            <p className="text-center text-sm text-red-500 mt-12">{error}</p>
          ) : vod ? (
            <div className="space-y-4">
              {/*
                영상과 글만 좁힌다(max-w-3xl). 헤더·배너는 바깥 max-w-5xl 을 그대로 써서
                페이지 기준선은 유지하되, 영상이 화면을 꽉 채우면 부담스럽고 설명 글도
                한 줄이 너무 길어져 읽기 어려워진다.
              */}
              <div className="mx-auto w-full max-w-3xl space-y-4">
                {/*
                  제목은 영상 바로 위에 둔다. 헤더에 있으면 뒤로가기 버튼과 나란히 놓여
                  내비게이션의 일부처럼 읽히고, 화면이 좁으면 잘려서 끝까지 보이지도 않는다.
                  여기 두면 무엇을 보는 화면인지가 영상과 붙어 한눈에 들어온다.
                  (예전에는 헤더와 영상 아래 두 곳에 같은 제목이 있었다.)
                */}
                <div>
                  <h1 className="text-lg font-semibold text-gray-900 sm:text-xl">
                    {vod.title}
                  </h1>
                  {vod.publishedAt && (
                    <p className="mt-1 text-xs text-gray-400">
                      {vod.publishedAt}
                    </p>
                  )}
                </div>

                <VideoPlayer youtubeId={vod.youtubeId} />

                {vod.description && (
                  <p className="text-sm whitespace-pre-line text-gray-500">
                    {vod.description}
                  </p>
                )}
              </div>

              {/* 배너는 이 영상과 무관한 별개 콘텐츠다. 설명 글에 붙어 있으면 같은 묶음으로
                  읽히므로, 위 요소들 사이 간격(16px)보다 확실히 큰 여백을 둬서 끊어준다. */}
              <div className="pt-10">
                <BannerCarousel position="player" />
              </div>
            </div>
          ) : null}
        </main>
      </div>
    </CopyProtection>
  );
}
