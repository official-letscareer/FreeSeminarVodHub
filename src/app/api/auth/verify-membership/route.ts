import { NextRequest, NextResponse } from 'next/server';
import { isPremiumUser, checkRateLimit } from '@/lib/kv';
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

  const { name, phoneNum: rawPhone } = body as Record<string, unknown>;

  if (!isValidName(name)) {
    return NextResponse.json({ message: '이름을 입력해주세요.' }, { status: 400 });
  }

  // 하이픈, 공백 자동 제거
  const phoneNum = typeof rawPhone === 'string' ? rawPhone.replace(/[-\s]/g, '') : rawPhone;

  if (!isValidPhone(phoneNum)) {
    return NextResponse.json(
      { message: '전화번호 형식이 올바르지 않습니다. (010으로 시작하는 11자리)' },
      { status: 400 }
    );
  }

  // Rate Limiting (IP + 전화번호 기준)
  const ip = getClientIp(request);
  const rateLimitKey = `verify-membership:${ip}:${phoneNum}`;
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

  // 프리미엄 멤버십 명단 확인 (백엔드 verify-challenge 폴백 없음)
  try {
    isChallenge = await isPremiumUser(trimmedName, phoneNum);
  } catch (err) {
    console.error('isPremiumUser error:', err);
    return NextResponse.json({ message: '서버 연결에 실패했습니다.' }, { status: 502 });
  }

  const response = NextResponse.json({ isChallenge });
  if (isChallenge) {
    response.cookies.set('auth_verified', '1', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365, // 1년 (챌린지 기간 동안 유지)
    });
  }
  return response;
}
