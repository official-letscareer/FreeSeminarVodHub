import type { MetadataRoute } from 'next';

/**
 * PWA 매니페스트. start_url을 /vod로 두는 이유: 루트(/)는 무조건 /login으로
 * 리다이렉트라 이미 로그인된 사용자도 매번 로그인 폼부터 보게 된다. /vod는
 * middleware가 인증 쿠키 유무만 보고 없으면 /login으로 보내므로, 로그인
 * 상태 유지 중인 사용자는 바로 목록으로, 처음 여는 사용자는 자연스럽게
 * 로그인 화면으로 간다.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '세미나 VOD',
    short_name: '세미나 VOD',
    description: '챌린지 참여자 전용 VOD 스트리밍 서비스',
    start_url: '/vod',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#4D55F5',
    lang: 'ko',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
