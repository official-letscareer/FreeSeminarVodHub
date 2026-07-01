import { NextRequest, NextResponse } from 'next/server';
import { getPremiumUsers, addPremiumUser, deletePremiumUser, deletePremiumUsers, updatePremiumUser } from '@/lib/kv';

function isAdminAuthorized(request: NextRequest): boolean {
  return request.cookies.get('admin_verified')?.value === '1';
}

export async function GET(request: NextRequest) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ message: '인증이 필요합니다.' }, { status: 401 });
  }
  const users = await getPremiumUsers();
  return NextResponse.json(users);
}

export async function POST(request: NextRequest) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ message: '인증이 필요합니다.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: '잘못된 요청입니다.' }, { status: 400 });
  }

  const { name, phoneNum } = body as Record<string, unknown>;

  if (typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ message: '이름을 입력해주세요.' }, { status: 400 });
  }
  if (typeof phoneNum !== 'string' || !/^010\d{8}$/.test(phoneNum)) {
    return NextResponse.json(
      { message: '전화번호 형식이 올바르지 않습니다. (01012345678)' },
      { status: 400 }
    );
  }

  const user = await addPremiumUser(name.trim(), phoneNum);
  return NextResponse.json(user, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ message: '인증이 필요합니다.' }, { status: 401 });
  }

  // 복수 삭제: body에 ids 배열
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  if (body && typeof body === 'object' && 'ids' in body) {
    const { ids } = body as { ids: unknown };
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'number')) {
      return NextResponse.json({ message: 'ids는 숫자 배열이어야 합니다.' }, { status: 400 });
    }
    await deletePremiumUsers(ids as number[]);
    return NextResponse.json({ success: true });
  }

  // 단건 삭제: query param id
  const { searchParams } = new URL(request.url);
  const idParam = searchParams.get('id');
  const id = idParam ? parseInt(idParam, 10) : NaN;

  if (isNaN(id)) {
    return NextResponse.json({ message: '유저 ID가 필요합니다.' }, { status: 400 });
  }

  await deletePremiumUser(id);
  return NextResponse.json({ success: true });
}

export async function PATCH(request: NextRequest) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ message: '인증이 필요합니다.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: '잘못된 요청입니다.' }, { status: 400 });
  }

  const { id, name, phoneNum } = body as Record<string, unknown>;

  if (typeof id !== 'number') {
    return NextResponse.json({ message: 'id(number)가 필요합니다.' }, { status: 400 });
  }

  if (typeof name === 'string' && name.trim().length === 0) {
    return NextResponse.json({ message: '이름을 입력해주세요.' }, { status: 400 });
  }
  if (typeof phoneNum === 'string' && !/^010\d{8}$/.test(phoneNum)) {
    return NextResponse.json(
      { message: '전화번호 형식이 올바르지 않습니다. (01012345678)' },
      { status: 400 }
    );
  }

  const updates: { name?: string; phoneNum?: string } = {};
  if (typeof name === 'string') updates.name = name.trim();
  if (typeof phoneNum === 'string') updates.phoneNum = phoneNum;

  await updatePremiumUser(id, updates);
  return NextResponse.json({ success: true });
}
