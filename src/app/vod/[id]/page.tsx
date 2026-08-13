import type { Metadata } from 'next';
import { getVodList } from '@/lib/kv';
import VodPlayerClient from './VodPlayerClient';

const FALLBACK_TITLE = '세미나 VOD';
const FALLBACK_DESCRIPTION = '챌린지 참여자 전용 VOD 스트리밍 서비스';
const DESCRIPTION_MAX_LENGTH = 100;

// 카카오톡/슬랙 등에 개별 VOD 링크를 공유했을 때 그 영상의 제목·설명·썸네일이
// 뜨도록 한다. 실제 재생 화면은 로그인 게이트 뒤에 있지만(VodPlayerClient가
// /api/vod/[id]로 인증 확인), 미리보기 메타데이터는 크롤러가 로그인 없이도
// 볼 수 있어야 해서 getVodList()로 Supabase를 직접 조회한다 — 인증 게이트를
// 우회하는 게 아니라 애초에 이 값들은 공개해도 되는 정보(제목·설명)라
// 게이트 대상이 아니다.
function truncateDescription(description: string): string {
  // 실제 화면(VodPlayerClient)은 whitespace-pre-line으로 줄바꿈을 살리지만,
  // 메타 태그는 한 줄 문자열이라 줄바꿈을 공백으로 접는다.
  const flattened = description.replace(/\s+/g, ' ').trim();
  if (flattened.length <= DESCRIPTION_MAX_LENGTH) return flattened;
  return `${flattened.slice(0, DESCRIPTION_MAX_LENGTH).trimEnd()}…`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const vodId = parseInt(id, 10);

  if (isNaN(vodId)) {
    return { title: FALLBACK_TITLE, description: FALLBACK_DESCRIPTION };
  }

  try {
    const list = await getVodList();
    const vod = list.find((v) => v.id === vodId);
    if (!vod) {
      return { title: FALLBACK_TITLE, description: FALLBACK_DESCRIPTION };
    }

    const title = vod.title;
    const description = vod.description
      ? truncateDescription(vod.description)
      : FALLBACK_DESCRIPTION;
    // hqdefault는 유효한 유튜브 영상이면 사실상 항상 존재해서 미리보기 이미지가
    // 깨질 일이 적다(maxresdefault는 고화질 업로드가 아니면 404가 난다).
    const thumbnailUrl = `https://img.youtube.com/vi/${vod.youtubeId}/hqdefault.jpg`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: 'website',
        images: [{ url: thumbnailUrl, width: 480, height: 360, alt: title }],
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: [thumbnailUrl],
      },
    };
  } catch {
    // Supabase 조회 실패 시에도 공유 자체는 막지 않는다 — 기본 메타데이터로 대체.
    return { title: FALLBACK_TITLE, description: FALLBACK_DESCRIPTION };
  }
}

export default async function VodPlayerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <VodPlayerClient id={id} />;
}
