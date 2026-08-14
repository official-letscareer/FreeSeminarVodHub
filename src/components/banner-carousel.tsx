'use client';

import { useEffect, useState, useCallback } from 'react';
import Image from 'next/image';
import { Banner } from '@/lib/types';

interface Props {
  position: 'list' | 'player';
}

/**
 * 배너 이미지.
 *
 * 원본이 Supabase 버킷의 2MB PNG 라 그대로 내보내면 방문할 때마다 그만큼을 받는다.
 * next/image 를 거치면 화면 폭에 맞게 줄이고 WebP/AVIF 로 바꾼 결과가 나간다 —
 * 버킷 파일은 손대지 않는다.
 *
 * 보이는 모양은 그대로다. `fill` + `object-cover` 로 기존 `w-full object-cover` 와 같게
 * 그리고, 비율(1120:180)은 바깥 상자가 잡는다. sizes 는 이 배너가 실제로 차지하는 폭
 * (본문 max-w-5xl 안쪽, 좌우 패딩 제외)을 알려줘 필요 이상으로 큰 파일을 받지 않게 한다.
 */
function BannerImage({ src, priority }: { src: string; priority: boolean }) {
  return (
    <div className="relative w-full" style={{ aspectRatio: '1120 / 180' }}>
      <Image
        src={src}
        alt="배너"
        fill
        sizes="(max-width: 1024px) 100vw, 992px"
        className="object-cover"
        draggable={false}
        priority={priority}
      />
    </div>
  );
}

export default function BannerCarousel({ position }: Props) {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    fetch(`/api/banners?position=${position}`)
      .then((r) => r.json())
      .then((data: Banner[]) => {
        if (!Array.isArray(data) || data.length === 0) return;
        setBanners(data);
        // isRandom이 하나라도 true면 시작 인덱스를 랜덤으로
        const shouldRandom = data.some((b) => b.isRandom);
        if (shouldRandom) {
          setCurrent(Math.floor(Math.random() * data.length));
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
          <BannerImage src={banner.imageUrl} priority={current === 0} />
        </a>
      ) : (
        <div className="cursor-default">
          <BannerImage src={banner.imageUrl} priority={current === 0} />
        </div>
      )}

      {/* 네비게이션 (항상 표시) */}
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

      {/* 인디케이터 (항상 표시) */}
      <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex gap-1">
        {banners.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrent(i)}
            className={`w-1.5 h-1.5 rounded-full transition-colors ${i === current ? 'bg-white' : 'bg-white/50'}`}
          />
        ))}
      </div>
    </div>
  );
}
