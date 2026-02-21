'use client';

import { useEffect, useState, useCallback } from 'react';
import { Banner } from '@/lib/types';

interface Props {
  position: 'list' | 'player';
}

export default function BannerCarousel({ position }: Props) {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    fetch(`/api/banners?position=${position}`)
      .then((r) => r.json())
      .then((data: Banner[]) => {
        if (!Array.isArray(data) || data.length === 0) return;
        // isRandom이 하나라도 true면 셔플
        const shouldShuffle = data.some((b) => b.isRandom);
        if (shouldShuffle) {
          const shuffled = [...data].sort(() => Math.random() - 0.5);
          setBanners(shuffled);
        } else {
          setBanners(data);
        }
      })
      .catch(() => {});
  }, [position]);

  const next = useCallback(() => {
    setCurrent((c) => (c + 1) % banners.length);
  }, [banners.length]);

  const prev = useCallback(() => {
    setCurrent((c) => (c - 1 + banners.length) % banners.length);
  }, [banners.length]);

  // 배너 없으면 렌더링 안 함
  if (banners.length === 0) return null;

  const banner = banners[current];

  return (
    <div className="relative w-full overflow-hidden rounded-lg bg-gray-100">
      {/* 배너 이미지 */}
      {banner.linkUrl ? (
        <a
          href={banner.linkUrl.startsWith('http') ? banner.linkUrl : `https://${banner.linkUrl}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block cursor-pointer"
        >
          <img
            src={banner.imageUrl}
            alt="배너"
            className="w-full object-cover"
            style={{ aspectRatio: '1120 / 180' }}
            draggable={false}
          />
        </a>
      ) : (
        <div className="cursor-default">
          <img
            src={banner.imageUrl}
            alt="배너"
            className="w-full object-cover"
            style={{ aspectRatio: '1120 / 180' }}
            draggable={false}
          />
        </div>
      )}

      {/* 복수 배너 시 네비게이션 */}
      {banners.length > 1 && (
        <>
          <button
            onClick={prev}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors"
            aria-label="이전 배너"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <button
            onClick={next}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors"
            aria-label="다음 배너"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
          {/* 인디케이터 */}
          <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex gap-1">
            {banners.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${i === current ? 'bg-white' : 'bg-white/50'}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
