import { NextRequest, NextResponse } from 'next/server';
import { getUsageRecent, getUsageSummary, getUsageUsers } from '@/lib/kv';
import {
  ADMIN_SESSION_COOKIE,
  isAdminSessionConfigured,
  verifyAdminSession,
} from '@/lib/adminSession';
import {
  ADMIN_SESSION_NOT_CONFIGURED_MESSAGE,
  UsageLogForbiddenError,
  UsageLogNotConfiguredError,
  UsageLogQueryError,
  clampUsageDays,
  clampUsageLimit,
} from '@/lib/usageLogAdmin';

// 다른 /api/admin/* 와 달리 서명 없는 admin_verified=1 만으로는 통과하지 못한다.
// 로그인 때 발급된 서명 세션(admin_session)이 함께 있어야 한다.
function hasAdminVerifiedCookie(request: NextRequest): boolean {
  return request.cookies.get('admin_verified')?.value === '1';
}

function hasValidAdminSession(request: NextRequest): boolean {
  return verifyAdminSession(request.cookies.get(ADMIN_SESSION_COOKIE)?.value);
}

// 이용자 이름이 들어 있는 응답이라 어떤 응답도 캐시하지 않는다.
function respond(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

/**
 * 이용 로그 조회(LC-3438). `view` 는 summary, recent, users 중 하나다.
 * 토큰이나 DB 오류 원문은 응답에 싣지 않는다. 오류는 고정 문구로만 돌려준다.
 */
export async function GET(request: NextRequest) {
  if (!hasAdminVerifiedCookie(request)) {
    return respond({ message: '인증이 필요합니다.' }, 401);
  }
  // 비밀키 설정 상태는 로그인한 관리자에게만 알려 준다. 세션을 만들 수 없으니 401 과 구분한다.
  if (!isAdminSessionConfigured()) {
    return respond({ message: ADMIN_SESSION_NOT_CONFIGURED_MESSAGE }, 503);
  }
  if (!hasValidAdminSession(request)) {
    return respond({ message: '인증이 필요합니다.' }, 401);
  }

  const { searchParams } = request.nextUrl;
  const view = searchParams.get('view');
  if (view !== 'summary' && view !== 'recent' && view !== 'users') {
    return respond({ message: 'view 값이 올바르지 않습니다.' }, 400);
  }

  const days = clampUsageDays(searchParams.get('days'));
  const limit = clampUsageLimit(searchParams.get('limit'));

  try {
    if (view === 'summary') {
      return respond(await getUsageSummary(days));
    }
    if (view === 'recent') {
      return respond({ events: await getUsageRecent(limit) });
    }
    return respond({ users: await getUsageUsers(days, limit) });
  } catch (error) {
    if (error instanceof UsageLogNotConfiguredError) {
      return respond(
        { message: '이용 로그 조회 토큰이 설정되지 않았습니다.' },
        503,
      );
    }
    if (error instanceof UsageLogForbiddenError) {
      return respond(
        { message: '이용 로그 조회 권한 설정이 올바르지 않습니다.' },
        502,
      );
    }
    // 서버 로그에는 종류와 SQLSTATE 만 남긴다.
    console.error(
      '[Usage Log Admin]',
      error instanceof UsageLogQueryError
        ? `rpc error ${error.code ?? 'unknown'}`
        : error instanceof Error
          ? error.name
          : 'unknown',
    );
    return respond({ message: '이용 로그를 조회하지 못했습니다.' }, 502);
  }
}
