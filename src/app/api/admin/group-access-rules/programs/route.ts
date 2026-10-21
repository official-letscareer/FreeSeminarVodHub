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

const MAX_KEYWORD_LENGTH = 50;

function badGateway() {
  return NextResponse.json(
    { message: '프로그램 목록을 불러오지 못했습니다.' },
    { status: 502 },
  );
}

/**
 * 그룹 접근 규칙 등록 폼의 프로그램 검색 목록. 렛커 서버의 `GET /api/v1/vod-access/programs` 를
 * 대신 부른다. 서버 API 는 인증 없는 공개 API 이고 공개 프로그램만 준다.
 * keyword 가 없으면 진행 예정·진행 중, 있으면 종료 후 365일 이내까지 제목·ID 로 검색한다.
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

  const keyword = request.nextUrl.searchParams.get('keyword')?.trim() ?? '';
  if (keyword.length > MAX_KEYWORD_LENGTH) {
    return NextResponse.json(
      { message: `검색어는 ${MAX_KEYWORD_LENGTH}자 이하여야 합니다.` },
      { status: 400 },
    );
  }

  const apiUrl = process.env.LETSCAREER_API_URL;
  if (!apiUrl) {
    console.error('vod-access programs: LETSCAREER_API_URL 미설정');
    return badGateway();
  }

  try {
    const query = keyword
      ? `type=${type}&keyword=${encodeURIComponent(keyword)}`
      : `type=${type}`;
    const res = await fetch(`${apiUrl}/api/v1/vod-access/programs?${query}`, {
      cache: 'no-store',
    });
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
