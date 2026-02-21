import { NextRequest, NextResponse } from 'next/server';

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
  return response;
}

export async function DELETE(request: NextRequest) {
  const adminVerified = request.cookies.get('admin_verified');
  if (!adminVerified) {
    return NextResponse.json({ message: '인증되지 않았습니다.' }, { status: 401 });
  }
  const response = NextResponse.json({ success: true });
  response.cookies.delete('admin_verified');
  return response;
}
