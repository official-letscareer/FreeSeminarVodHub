import { NextRequest, NextResponse } from 'next/server';
import { getVodList, addVod, deleteVod, toggleVodEmbed, updateVodMeta } from '@/lib/kv';
import { parseYoutubeId } from '@/lib/youtube';

function isAdminAuthorized(request: NextRequest): boolean {
  return request.cookies.get('admin_verified')?.value === '1';
}

export async function GET(request: NextRequest) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ message: '인증이 필요합니다.' }, { status: 401 });
  }
  const list = await getVodList();
  return NextResponse.json(list);
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

  const { title, youtubeUrl, description, publishedAt } = body as Record<string, unknown>;

  if (typeof title !== 'string' || title.trim().length === 0) {
    return NextResponse.json({ message: '제목을 입력해주세요.' }, { status: 400 });
  }
  if (typeof youtubeUrl !== 'string') {
    return NextResponse.json({ message: '유튜브 URL을 입력해주세요.' }, { status: 400 });
  }

  const youtubeId = parseYoutubeId(youtubeUrl.trim());
  if (!youtubeId) {
    return NextResponse.json({ message: '유효하지 않은 유튜브 URL입니다.' }, { status: 400 });
  }

  const desc = typeof description === 'string' ? description.trim() : '';
  const pubAt = typeof publishedAt === 'string' && publishedAt.trim() ? publishedAt.trim() : null;
  const newVod = await addVod({ title: title.trim(), youtubeId, description: desc, publishedAt: pubAt });
  return NextResponse.json(newVod, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ message: '인증이 필요합니다.' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const idParam = searchParams.get('id');
  const id = idParam ? parseInt(idParam, 10) : NaN;

  if (isNaN(id)) {
    return NextResponse.json({ message: 'VOD ID가 필요합니다.' }, { status: 400 });
  }

  try {
    await deleteVod(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('deleteVod error:', err);
    return NextResponse.json({ message: 'VOD 삭제에 실패했습니다.' }, { status: 500 });
  }
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

  const { id, embedEnabled, description, title, publishedAt } = body as Record<string, unknown>;

  if (typeof id !== 'number') {
    return NextResponse.json({ message: 'id(number)가 필요합니다.' }, { status: 400 });
  }

  if (typeof embedEnabled === 'boolean') {
    await toggleVodEmbed(id, embedEnabled);
  }

  const metaUpdate: { title?: string; description?: string; publishedAt?: string | null } = {};
  if (typeof title === 'string') metaUpdate.title = title.trim();
  if (typeof description === 'string') metaUpdate.description = description.trim();
  if ('publishedAt' in (body as object)) {
    metaUpdate.publishedAt = typeof publishedAt === 'string' && publishedAt.trim() ? publishedAt.trim() : null;
  }
  if (Object.keys(metaUpdate).length > 0) {
    await updateVodMeta(id, metaUpdate);
  }

  return NextResponse.json({ success: true });
}
