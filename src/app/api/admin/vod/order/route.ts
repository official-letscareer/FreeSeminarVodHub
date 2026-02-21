import { NextRequest, NextResponse } from 'next/server';
import { updateVodOrder } from '@/lib/kv';

function isAdminAuthorized(request: NextRequest): boolean {
  return request.cookies.get('admin_verified')?.value === '1';
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

  const { orderedIds } = body as Record<string, unknown>;

  if (!Array.isArray(orderedIds) || !orderedIds.every((id) => typeof id === 'number')) {
    return NextResponse.json({ message: 'orderedIds는 숫자 배열이어야 합니다.' }, { status: 400 });
  }

  const updated = await updateVodOrder(orderedIds);
  return NextResponse.json(updated);
}
