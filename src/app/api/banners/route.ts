import { NextRequest, NextResponse } from 'next/server';
import { getBanners } from '@/lib/kv';
import { Banner } from '@/lib/types';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const position = searchParams.get('position') as Banner['position'] | null;

  const banners = await getBanners(position ?? undefined);
  return NextResponse.json(banners);
}
