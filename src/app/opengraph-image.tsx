import { ImageResponse } from 'next/og';
import { OgCard, OG_IMAGE_SIZE } from '@/lib/ogCard';

export const size = OG_IMAGE_SIZE;
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    <OgCard title="세미나 VOD" subtitle="챌린지 참여자 전용 VOD 스트리밍" />,
    { ...size },
  );
}
