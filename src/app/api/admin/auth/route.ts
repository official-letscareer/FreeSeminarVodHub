import { NextRequest, NextResponse } from 'next/server';
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE_SEC,
  createAdminSession,
} from '@/lib/adminSession';

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: '잘못된 요청입니다.' }, { status: 400 });
  }

  const { password } = body as Record<string, unknown>;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    return NextResponse.json({ message: '서버 설정 오류입니다.' }, { status: 500 });
  }

  if (typeof password !== 'string' || password !== adminPassword) {
    return NextResponse.json({ message: '비밀번호가 올바르지 않습니다.' }, { status: 401 });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set('admin_verified', '1', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  });
  // 서명된 세션. 이용자 정보를 내보내는 /api/admin/usage-logs 가 admin_verified 에 더해 요구한다.
  const session = createAdminSession();
  if (session) {
    response.cookies.set(ADMIN_SESSION_COOKIE, session, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: ADMIN_SESSION_MAX_AGE_SEC,
    });
  }
  return response;
}

export async function DELETE(request: NextRequest) {
  const adminVerified = request.cookies.get('admin_verified');
  if (!adminVerified) {
    return NextResponse.json({ message: '인증되지 않았습니다.' }, { status: 401 });
  }
  const response = NextResponse.json({ success: true });
  response.cookies.delete('admin_verified');
  response.cookies.delete(ADMIN_SESSION_COOKIE);
  return response;
}
