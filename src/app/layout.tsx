import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL;
const title = '세미나 VOD';
const description = '챌린지 참여자 전용 VOD 스트리밍 서비스';

export const metadata: Metadata = {
  ...(SITE_URL ? { metadataBase: new URL(SITE_URL) } : {}),
  title,
  description,
  manifest: '/manifest.webmanifest',
  openGraph: {
    title,
    description,
    siteName: title,
    locale: 'ko_KR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
  // 홈 화면에 추가했을 때 브라우저 주소창 없이 앱처럼 뜨게 한다(iOS Safari 전용 태그,
  // Android는 manifest.ts의 display: 'standalone'이 같은 역할을 한다).
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title,
  },
};

// themeColor는 Next 14+부터 metadata가 아니라 viewport export에 둬야 한다
// (metadata에 두면 빌드 경고가 뜬다). 모바일 브라우저 주소창·PWA 타이틀바
// 색을 브랜드 컬러로 맞춘다.
export const viewport: Viewport = {
  themeColor: '#4D55F5',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
