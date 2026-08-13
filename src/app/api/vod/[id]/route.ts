import { NextRequest, NextResponse } from 'next/server';
import { getVodList } from '@/lib/kv';
import { SSO_ACCESS_TOKEN_COOKIE } from '@/lib/sso';
import { checkVodAccess } from '@/lib/vodAccess';

function unauthorized(clearSsoCookie: boolean): NextResponse {
  const response = NextResponse.json(
    { message: '인증이 필요합니다.' },
    { status: 401 }
  );
  if (clearSsoCookie) {
    response.cookies.set(SSO_ACCESS_TOKEN_COOKIE, '', { maxAge: 0, path: '/' });
  }
  return response;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // 이전에는 이 라우트가 auth_verified 쿠키만 봐서, SSO로 로그인한 사용자는 목록은
  // 보여도(/api/vod) 재생(이 라우트)은 막히는 어긋남이 있었다 — 같은 판정 로직을
  // 공유해서 고친다(LC-3208).
  const access = await checkVodAccess(request);
  if (!access.authorized) {
    return unauthorized(access.reason === 'invalid-token');
  }

  const { id } = await params;
  const vodId = parseInt(id, 10);
  if (isNaN(vodId)) {
    return NextResponse.json({ message: '잘못된 VOD ID입니다.' }, { status: 400 });
  }

  const list = await getVodList();
  const vod = list.find((v) => v.id === vodId);
  if (!vod) {
    return NextResponse.json({ message: 'VOD를 찾을 수 없습니다.' }, { status: 404 });
  }

  return NextResponse.json(vod);
}
