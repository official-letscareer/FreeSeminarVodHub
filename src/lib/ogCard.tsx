import { LogoMark } from './brandMark';

export const OG_IMAGE_SIZE = { width: 1200, height: 630 };

/**
 * 링크 공유 미리보기 카드. 루트(/)와 /membership이 제목·부제만 바꿔 공유한다 —
 * 브랜드 배경 위 흰색 로고라는 배색은 두 곳이 같아야 하므로 여기 한 곳에 둔다.
 */
export function OgCard({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 32,
        background: '#4D55F5',
      }}
    >
      <LogoMark size={120} color="white" />
      <div
        style={{
          fontSize: 72,
          fontWeight: 700,
          color: 'white',
          letterSpacing: -1,
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: 32, color: 'rgba(255,255,255,0.85)' }}>
        {subtitle}
      </div>
    </div>
  );
}
