'use client';

import { useState } from 'react';

export default function VideoPlayer({ youtubeId }: { youtubeId: string }) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden">
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-black">
          <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      )}
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${youtubeId}?rel=0&modestbranding=1`}
        title="YouTube video player"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        onLoad={() => setLoaded(true)}
        className="absolute inset-0 w-full h-full"
      />
    </div>
  );
}
