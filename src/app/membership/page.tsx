import type { Metadata } from 'next';
import MembershipLoginClient from './MembershipLoginClient';

const title = '프리미엄 세미나 VOD';
const description = '프리미엄 멤버십 가입자 전용 세미나 VOD 다시보기';

// 이 페이지는 무료 세미나(/login)와 다른 대상에게 공유되므로 루트 레이아웃의
// 공용 문구("세미나 VOD") 대신 멤버십 전용 제목·설명을 쓴다. OG 이미지도
// 같은 폴더의 opengraph-image.tsx가 이 라우트 전용으로 자동 적용된다.
export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
  // 로그인 진입점이라 검색 결과에 뜰 이유가 없다(내용도 버튼 하나뿐이다).
  robots: { index: false, follow: false },
};

export default function MembershipLoginPage() {
  return <MembershipLoginClient />;
}
