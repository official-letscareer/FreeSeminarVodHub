import { NextRequest, NextResponse } from 'next/server';
import { isAllowedUser, checkRateLimit } from '@/lib/kv';
import { RATE_LIMIT } from '@/lib/constants';

function isValidName(name: unknown): name is string {
  return typeof name === 'string' && name.trim().length > 0;
}

function isValidPhone(phone: unknown): phone is string {
  return typeof phone === 'string' && /^010\d{8}$/.test(phone);
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: '잘못된 요청입니다.' }, { status: 400 });
  }

  const { name, phoneNum } = body as Record<string, unknown>;

  if (!isValidName(name)) {
    return NextResponse.json({ message: '이름을 입력해주세요.' }, { status: 400 });
  }
  if (!isValidPhone(phoneNum)) {
    return NextResponse.json(
      { message: '전화번호 형식이 올바르지 않습니다. (010으로 시작하는 11자리)' },
      { status: 400 }
    );
  }

  // Rate Limiting (IP + 전화번호 기준)
  const ip = getClientIp(request);
  const rateLimitKey = `verify:${ip}:${phoneNum}`;
  try {
    const { allowed, remaining } = await checkRateLimit(
      rateLimitKey,
      RATE_LIMIT.MAX_REQUESTS,
      RATE_LIMIT.WINDOW_SECONDS
    );
    if (!allowed) {
      return NextResponse.json(
        { message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
        {
          status: 429,
          headers: { 'Retry-After': String(RATE_LIMIT.WINDOW_SECONDS), 'X-RateLimit-Remaining': String(remaining) },
        }
      );
    }
  } catch {
    // Rate Limiting 실패 시 요청은 통과시킴
  }

  const trimmedName = name.trim();
  let isChallenge = false;

  // 1) 예외 유저 테이블 확인
  try {
    const allowed = await isAllowedUser(trimmedName, phoneNum);
    if (allowed) {
      isChallenge = true;
    }
  } catch {
    // Supabase 연결 실패 시 외부 API로 폴백
  }

  if (!isChallenge) {
    // 2) 렛츠커리어 서버 v2 API 호출
    const apiUrl = process.env.LETSCAREER_API_URL;
    if (!apiUrl) {
      return NextResponse.json({ message: '서버 설정 오류입니다.' }, { status: 500 });
    }
    try {
      const res = await fetch(`${apiUrl}/api/v2/user/verify-challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedName, phoneNum }),
      });

      if (res.status === 404) {
        // 가입되지 않은 사용자
        isChallenge = false;
      } else if (res.ok) {
        const data = await res.json();
        console.log('verify-challenge response:', JSON.stringify(data));
        if (typeof data === 'boolean') {
          isChallenge = data;
        } else if (typeof data?.data === 'boolean') {
          isChallenge = data.data;
        } else if (typeof data?.data?.isChallenge === 'boolean') {
          isChallenge = data.data.isChallenge;
        } else if (typeof data?.isChallenge === 'boolean') {
          isChallenge = data.isChallenge;
        }
      } else {
        const errorBody = await res.text().catch(() => '');
        console.error(`verify-challenge failed: status=${res.status}, body=${errorBody}`);
        return NextResponse.json({ message: '서버 연결에 실패했습니다.' }, { status: 502 });
      }
    } catch {
      return NextResponse.json({ message: '서버 연결에 실패했습니다.' }, { status: 502 });
    }
  }

  const response = NextResponse.json({ isChallenge });
  if (isChallenge) {
    response.cookies.set('auth_verified', '1', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    });
  }
  return response;
}
