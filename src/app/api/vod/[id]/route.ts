import { NextRequest, NextResponse } from 'next/server';
import { getVodList } from '@/lib/kv';

function isUserAuthorized(request: NextRequest): boolean {
  return request.cookies.get('auth_verified')?.value === '1';
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isUserAuthorized(request)) {
    return NextResponse.json({ message: '인증이 필요합니다.' }, { status: 401 });
  }

  const { id } = await params;
  const vodId = parseInt(id, 10);
  if (isNaN(vodId)) {
    return NextResponse.json({ message: '잘못된 VOD ID입니다.' }, { status: 400 });
  }

  const list = await getVodList();
  const vod = list.find((v) => v.id === vodId);
  if (!vod) {
    return NextResponse.json({ message: 'VOD를 찾을 수 없습니다.' }, { status: 404 });
  }

  return NextResponse.json(vod);
}
