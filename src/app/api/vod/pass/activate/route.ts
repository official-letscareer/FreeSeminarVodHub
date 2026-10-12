import { NextRequest, NextResponse } from 'next/server';
import { SSO_ACCESS_TOKEN_COOKIE } from '@/lib/sso';
import { activateVodPass } from '@/lib/vodPass';

/**
 * VOD 이용권 활성화(LC-3438). 본문 `{ applicationId: number }`.
 *
 * 이용권이 본인 것인지, 활성화할 수 있는 상태인지는 렛커 서버가 판단한다(타인의 이용권은
 * 404). 여기서는 형식만 확인하고 렛커 서버의 상태 코드와 메시지를 그대로 전달한다.
 */
export async function POST(request: NextRequest) {
  const ssoToken = request.cookies.get(SSO_ACCESS_TOKEN_COOKIE)?.value;
  if (!ssoToken) {
    return NextResponse.json(
      { message: '인증이 필요합니다.' },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: '잘못된 요청입니다.' },
      { status: 400 },
    );
  }

  const applicationId = (body as { applicationId?: unknown } | null)
    ?.applicationId;
  if (
    typeof applicationId !== 'number' ||
    !Number.isSafeInteger(applicationId)
  ) {
    return NextResponse.json(
      { message: 'applicationId는 숫자여야 합니다.' },
      { status: 400 },
    );
  }

  const result = await activateVodPass(ssoToken, applicationId);
  if (!result.ok) {
    return NextResponse.json(
      { message: result.message },
      { status: result.status },
    );
  }

  return NextResponse.json({
    startsAt: result.startsAt,
    endsAt: result.endsAt,
  });
}
