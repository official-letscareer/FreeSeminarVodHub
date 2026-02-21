'use client';

export default function VideoPlayer({ youtubeId }: { youtubeId: string }) {
  return <div data-youtube-id={youtubeId}>Video Player</div>;
}
