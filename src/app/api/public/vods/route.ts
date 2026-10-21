import { NextRequest, NextResponse } from 'next/server';
import { getEnabledVodList } from '@/lib/kv';

/**
 * 렛커 웹(올인원패스 페이지)에 노출할 공개 VOD 목록. 인증 없이 열려 있으므로 카드에
 * 필요한 것만 내보낸다 — 유튜브 영상 ID·URL 은 빼고, 클릭 시 허브의 /vod/{id} 로 보내
 * 재생 권한은 기존처럼 허브가 판정한다.
 *
 * 썸네일 URL 에는 유튜브 ID 가 들어 있다. /vod/[id] 의 og:image 가 이미 같은 URL 을
 * 공개하고 있어 노출 범위가 늘지는 않는다.
 */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const list = await getEnabledVodList();

  const body = list.map((vod) => ({
    id: vod.id,
    title: vod.title,
    description: vod.description,
    thumbnailUrl: `https://img.youtube.com/vi/${vod.youtubeId}/hqdefault.jpg`,
    url: `${origin}/vod/${vod.id}`,
  }));

  return NextResponse.json(body, {
    headers: {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    },
  });
}
