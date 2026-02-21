'use client';

import { useRouter } from 'next/navigation';
import { VodItem } from '@/lib/types';

export default function VodCard({ vod }: { vod: VodItem }) {
  const router = useRouter();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => router.push(`/vod/${vod.id}`)}
      onKeyDown={(e) => e.key === 'Enter' && router.push(`/vod/${vod.id}`)}
      className="group cursor-pointer rounded-lg overflow-hidden border bg-white shadow-sm hover:shadow-md transition-shadow"
    >
      <div className="relative aspect-video bg-gray-100 overflow-hidden">
        <img
          src={`https://img.youtube.com/vi/${vod.youtubeId}/mqdefault.jpg`}
          alt={vod.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
        />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
          <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center">
            <svg className="w-5 h-5 text-gray-800 ml-1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      </div>
      <div className="p-3">
        <p className="text-sm font-medium text-gray-900 line-clamp-2">{vod.title}</p>
      </div>
    </div>
  );
}
