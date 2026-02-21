import { NextRequest, NextResponse } from 'next/server';
import { getEnabledVodList } from '@/lib/kv';

function isUserAuthorized(request: NextRequest): boolean {
  return request.cookies.get('auth_verified')?.value === '1';
}

export async function GET(request: NextRequest) {
  if (!isUserAuthorized(request)) {
    return NextResponse.json({ message: '인증이 필요합니다.' }, { status: 401 });
  }
  const list = await getEnabledVodList();
  return NextResponse.json(list);
}
