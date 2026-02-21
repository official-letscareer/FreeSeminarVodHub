import { NextRequest, NextResponse } from 'next/server';
import { getBanners, addBanner, deleteBanner, updateBannerOrder } from '@/lib/kv';
import { supabase } from '@/lib/supabase';
import { Banner } from '@/lib/types';

function isAdminAuthorized(request: NextRequest): boolean {
  return request.cookies.get('admin_verified')?.value === '1';
}

export async function GET(request: NextRequest) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ message: '인증이 필요합니다.' }, { status: 401 });
  }
  const banners = await getBanners();
  return NextResponse.json(banners);
}

export async function POST(request: NextRequest) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ message: '인증이 필요합니다.' }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ message: '잘못된 요청입니다.' }, { status: 400 });
  }

  const file = formData.get('image');
  const linkUrl = (formData.get('linkUrl') as string) ?? '';
  const position = (formData.get('position') as Banner['position']) ?? 'both';
  const isRandom = formData.get('isRandom') === 'true';

  if (!file || typeof file === 'string') {
    return NextResponse.json({ message: '이미지를 첨부해주세요.' }, { status: 400 });
  }

  if (!['list', 'player', 'both'].includes(position)) {
    return NextResponse.json({ message: '위치 값이 올바르지 않습니다.' }, { status: 400 });
  }

  // Supabase Storage에 업로드
  if (!supabase) {
    return NextResponse.json({ message: 'Supabase가 설정되지 않았습니다.' }, { status: 500 });
  }

  const fileObj = file as File;
  const ext = fileObj.name.split('.').pop() ?? 'jpg';
  const fileName = `${Date.now()}.${ext}`;
  const arrayBuffer = await fileObj.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from('banners')
    .upload(fileName, arrayBuffer, { contentType: fileObj.type, upsert: false });

  if (uploadError) {
    console.error('[Banner Upload Error]', uploadError);
    return NextResponse.json({ message: `이미지 업로드 실패: ${uploadError.message}` }, { status: 500 });
  }

  const { data: urlData } = supabase.storage.from('banners').getPublicUrl(fileName);
  const imageUrl = urlData.publicUrl;

  const banner = await addBanner({ imageUrl, linkUrl, position, isRandom });
  return NextResponse.json(banner, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ message: '인증이 필요합니다.' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const idParam = searchParams.get('id');
  const id = idParam ? parseInt(idParam, 10) : NaN;

  if (isNaN(id)) {
    return NextResponse.json({ message: '배너 ID가 필요합니다.' }, { status: 400 });
  }

  await deleteBanner(id);
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

  const { orderedIds } = body as Record<string, unknown>;
  if (!Array.isArray(orderedIds)) {
    return NextResponse.json({ message: 'orderedIds(array)가 필요합니다.' }, { status: 400 });
  }

  await updateBannerOrder(orderedIds as number[]);
  return NextResponse.json({ success: true });
}
