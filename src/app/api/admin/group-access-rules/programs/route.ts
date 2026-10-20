import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from '@/lib/adminSession';

// 접근 권한을 만드는 API 라 서명 없는 admin_verified=1 만으로는 통과하지 못한다(누구나 쿠키를 직접
// 넣을 수 있다). usage-logs 처럼 로그인 때 발급된 서명 세션(admin_session)이 함께 있어야 한다.
function isAdminAuthorized(request: NextRequest): boolean {
  return (
    request.cookies.get('admin_verified')?.value === '1' &&
    verifyAdminSession(request.cookies.get(ADMIN_SESSION_COOKIE)?.value)
  );
}

function badGateway() {
  return NextResponse.json(
    { message: '프로그램 목록을 불러오지 못했습니다.' },
    { status: 502 },
  );
}

/**
 * 그룹 접근 규칙 등록 폼의 프로그램 드롭다운 목록. 렛커 서버의 `GET /api/v1/vod-access/programs` 를
 * 대신 부른다. 허브에는 렛커 어드민 토큰이 없어서 서버와 나눠 가진 비밀 헤더로 인증한다.
 * 비밀값은 서버 env 에만 두고 브라우저로 내보내지 않는다 — 그래서 화면이 서버를 직접 부르지 않는다.
 */
export async function GET(request: NextRequest) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json(
      { message: '인증이 필요합니다.' },
      { status: 401 },
    );
  }

  const type = request.nextUrl.searchParams.get('type');
  if (type !== 'CHALLENGE' && type !== 'LIVE') {
    return NextResponse.json(
      { message: 'type 은 CHALLENGE 또는 LIVE 여야 합니다.' },
      { status: 400 },
    );
  }

  const apiUrl = process.env.LETSCAREER_API_URL;
  const secret = process.env.VOD_ACCESS_SHARED_SECRET;
  if (!apiUrl || !secret) {
    console.error(
      'vod-access programs: LETSCAREER_API_URL 또는 VOD_ACCESS_SHARED_SECRET 미설정',
    );
    return badGateway();
  }

  try {
    const res = await fetch(
      `${apiUrl}/api/v1/vod-access/programs?type=${type}`,
      {
        headers: { 'X-Vod-Access-Secret': secret },
        cache: 'no-store',
      },
    );
    if (!res.ok) {
      console.error(`vod-access programs failed: status=${res.status}`);
      return badGateway();
    }

    const body = await res.json();
    const programs = body?.data?.programs;
    if (!Array.isArray(programs)) return badGateway();

    return NextResponse.json(programs);
  } catch (err) {
    console.error('vod-access programs error:', err);
    return badGateway();
  }
}
