import { ImageResponse } from 'next/og';
import { LogoMark } from '@/lib/brandMark';

// manifest.ts가 참조하는 고정 경로 아이콘. Next의 icon.tsx 컨벤션은 URL에
// 내부 id가 붙어 매니페스트에서 안정적으로 참조하기 어려워, 라우트 핸들러로
// 직접 고정 경로에 이미지를 낸다. 로고를 캔버스의 약 55%로만 채워 마스크
// 처리(Android maskable) 시 원형으로 잘려도 안전하다. 실제 로고가 흰/투명
// 배경 위 보라색 마크로 쓰이는 것과 맞춰 흰 배경 + 브랜드 컬러 마크로 그린다.
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
        <LogoMark size={106} />
      </div>
    ),
    { width: 192, height: 192 }
  );
}
