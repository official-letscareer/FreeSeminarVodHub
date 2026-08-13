import { ImageResponse } from 'next/og';
import { LogoMark } from '@/lib/brandMark';

// 애플은 아이콘 배경에 자체 라운드·그림자를 입히므로 여기선 투명 없이
// 꽉 찬 정사각형 배경만 준다(투명 배경은 iOS에서 검은 배경으로 뒤집힌다).
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#4D55F5',
        }}
      >
        <LogoMark size={100} />
      </div>
    ),
    { ...size }
  );
}
