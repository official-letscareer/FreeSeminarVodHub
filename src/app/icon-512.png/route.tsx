import { ImageResponse } from 'next/og';
import { LogoMark } from '@/lib/brandMark';

// manifest.ts가 참조하는 고정 경로 아이콘. icon-192.png/route.tsx와 동일한
// 이유로 라우트 핸들러를 쓴다 — 상세 설명은 그쪽 주석 참고.
export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'white',
        }}
      >
        <LogoMark size={282} />
      </div>
    ),
    { width: 512, height: 512 }
  );
}
