'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { VodItem } from '@/lib/types';

export default function VodListItem({ vod }: { vod: VodItem }) {
  const router = useRouter();
  const [imgSrc, setImgSrc] = useState(
    `https://img.youtube.com/vi/${vod.youtubeId}/mqdefault.jpg`
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
      className="group cursor-pointer flex items-center gap-3 rounded-lg border bg-white shadow-sm hover:shadow-md transition-shadow p-3"
    >
      <div className="relative flex-shrink-0 w-32 aspect-video rounded overflow-hidden bg-gray-100">
        {imgFailed ? (
          <div className="w-full h-full flex items-center justify-center bg-gray-200">
            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
            </svg>
          </div>
        ) : (
          <img
            src={imgSrc}
            alt={vod.title}
            onError={handleImgError}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
          />
        )}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
          <div className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center">
            <svg className="w-3 h-3 text-gray-800 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 line-clamp-2">{vod.title}</p>
        {vod.publishedAt && (
          <p className="text-xs text-gray-400 mt-0.5">{vod.publishedAt}</p>
        )}
        {vod.description && (
          <p className="text-xs text-gray-500 mt-1 line-clamp-2">{vod.description}</p>
        )}
      </div>
    </div>
  );
}
