import { ImageResponse } from 'next/og';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    (
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
        <svg width="120" height="120" viewBox="0 0 34 34" fill="none">
          <path
            d="M32.3642 31.6086C30.0185 32.9245 25.7296 30.2339 21.5794 25.2552C22.8937 29.273 22.8471 32.4789 21.1748 33.417C19.2899 34.4743 15.8694 32.3531 12.5824 28.415C13.0959 30.9203 12.7188 32.9478 11.3796 33.6991C9.15731 34.9457 5.12691 32.2055 2.37749 27.5786C-0.371935 22.9518 -0.799227 18.1904 1.42311 16.9438C2.76226 16.1926 4.75796 16.8891 6.73428 18.5737C4.86745 13.8388 4.68696 9.89995 6.57191 8.8426C8.2442 7.90453 11.1252 9.46834 14.0493 12.5831C11.6867 6.60189 11.433 1.64797 13.7787 0.332164C16.9535 -1.44871 23.6876 4.10909 28.8199 12.7458C33.9521 21.3826 35.539 29.8278 32.3642 31.6086Z"
            fill="white"
          />
        </svg>
        <div
          style={{
            fontSize: 72,
            fontWeight: 700,
            color: 'white',
            letterSpacing: -1,
          }}
        >
          세미나 VOD
        </div>
        <div style={{ fontSize: 32, color: 'rgba(255,255,255,0.85)' }}>
          챌린지 참여자 전용 VOD 스트리밍
        </div>
      </div>
    ),
    { ...size }
  );
}
