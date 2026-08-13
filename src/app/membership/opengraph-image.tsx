import { ImageResponse } from 'next/og';
import { OgCard, OG_IMAGE_SIZE } from '@/lib/ogCard';

// 같은 폴더의 page.tsx(= /membership)에만 적용되는 OG 이미지. 루트의
// opengraph-image.tsx를 이 라우트에서만 덮어쓴다.
export const size = OG_IMAGE_SIZE;
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    <OgCard
      title="프리미엄 세미나 VOD"
      subtitle="프리미엄 멤버십 가입자 전용"
    />,
    { ...size },
  );
}
