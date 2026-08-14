import type { NextConfig } from 'next';

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const nextConfig: NextConfig = {
  /*
    이미지 최적화.

    배너 원본은 Supabase 버킷에 2MB PNG 로 올라가 있고 응답이 `cache-control: no-cache` 라
    방문할 때마다 다시 받았다. 버킷 파일을 바꾸지 않고도, Next 가 원본을 한 번 가져와
    화면 크기에 맞게 줄이고 WebP/AVIF 로 바꿔 그 결과를 캐시한다 — 어드민이 앞으로 올리는
    이미지에도 자동으로 적용된다.

    minimumCacheTTL 을 명시하는 이유는 원본의 no-cache 때문이다. 이 값이 없으면 Next 가
    원본 헤더를 따라 최적화 결과도 짧게만 캐시한다. 배너는 자주 바뀌지 않으므로 하루로 둔다.
  */
  images: {
    remotePatterns: [
      ...(supabaseHost
        ? [
            {
              protocol: 'https' as const,
              hostname: supabaseHost,
              pathname: '/storage/v1/object/public/**',
            },
          ]
        : []),
    ],
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24,
  },
};

export default nextConfig;
