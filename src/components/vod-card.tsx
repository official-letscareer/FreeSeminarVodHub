'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { VodItem } from '@/lib/types';

export default function VodCard({ vod }: { vod: VodItem }) {
  const router = useRouter();
  const [imgSrc, setImgSrc] = useState(
    `https://img.youtube.com/vi/${vod.youtubeId}/mqdefault.jpg`,
  );
  const [imgFailed, setImgFailed] = useState(false);

  function handleImgError() {
    if (imgSrc.includes('mqdefault')) {
      setImgSrc(`https://img.youtube.com/vi/${vod.youtubeId}/hqdefault.jpg`);
    } else {
      setImgFailed(true);
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => router.push(`/vod/${vod.id}`)}
      onKeyDown={(e) => e.key === 'Enter' && router.push(`/vod/${vod.id}`)}
      className="group cursor-pointer rounded-lg overflow-hidden border bg-white shadow-sm transition-shadow hover:border-primary/30 hover:shadow-md"
    >
      <div className="relative aspect-video bg-gray-100 overflow-hidden">
        {imgFailed ? (
          <div className="w-full h-full flex items-center justify-center bg-gray-200">
            <svg
              className="w-10 h-10 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"
              />
            </svg>
          </div>
        ) : (
          /*
            유튜브 썸네일 원본은 두 시간(max-age=7200)만 캐시된다. next/image 를 거치면
            next.config 의 minimumCacheTTL(하루)이 적용되고 WebP/AVIF 로도 바뀐다.
            sizes 는 카드가 실제로 차지하는 폭(1열/2열/3열)을 알려줘 필요 이상 큰 파일을
            받지 않게 한다.
          */
          <Image
            src={imgSrc}
            alt={vod.title}
            onError={handleImgError}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 320px"
            className="object-cover group-hover:scale-105 transition-transform duration-200"
          />
        )}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
          <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center">
            <svg
              className="w-5 h-5 text-primary ml-1"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      </div>
      <div className="p-3">
        <p className="text-sm font-medium text-gray-900 line-clamp-2">
          {vod.title}
        </p>
        {vod.publishedAt && (
          <p className="text-xs text-gray-400 mt-0.5">{vod.publishedAt}</p>
        )}
        {vod.description && (
          <p className="text-xs text-gray-500 mt-1 line-clamp-2 whitespace-pre-line">
            {vod.description}
          </p>
        )}
      </div>
    </div>
  );
}
