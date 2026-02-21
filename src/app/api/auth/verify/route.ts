import { NextRequest, NextResponse } from 'next/server';

function isValidName(name: unknown): name is string {
  return typeof name === 'string' && name.trim().length > 0;
}

function isValidPhone(phone: unknown): phone is string {
  return typeof phone === 'string' && /^010\d{8}$/.test(phone);
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

  const mockMode = process.env.MOCK_MODE === 'true';
  const apiUrl = process.env.LETSCAREER_API_URL;

  if (mockMode) {
    return NextResponse.json({ isChallenge: true });
  }

  if (!apiUrl) {
    return NextResponse.json({ message: '서버 설정 오류입니다.' }, { status: 500 });
  }

  try {
    const res = await fetch(`${apiUrl}/api/v1/user/verify-challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), phoneNum }),
    });

    const data = await res.json();
    const isChallenge = data?.data?.isChallenge === true;
    return NextResponse.json({ isChallenge });
  } catch {
    return NextResponse.json({ message: '서버 연결에 실패했습니다.' }, { status: 502 });
  }
}
