import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { findVodPlayedAtSince } from '@/lib/playRecords';

/**
 * 렛츠커리어 서버 전용 재생 기록 조회 (LC-3507). VOD 이용권 환불 판정이 부른다.
 * `Authorization: Bearer <VOD_PLAY_RECORD_API_TOKEN>` 이 맞아야 한다.
 *
 * GET /api/internal/play-records?userId=42&since=2026-10-26T12:00:00+09:00
 * → { playedAt: ["2026-10-27T01:00:00+00:00", ...] }
 */
function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.VOD_PLAY_RECORD_API_TOKEN?.trim();
  if (!expected) return false;
  const header = request.headers.get('authorization') ?? '';
  const given = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { message: '인증이 필요합니다.' },
      { status: 401 },
    );
  }

  const params = request.nextUrl.searchParams;
  const userId = Number(params.get('userId'));
  const since = new Date(params.get('since') ?? '');
  if (!Number.isSafeInteger(userId) || userId <= 0 || isNaN(since.getTime())) {
    return NextResponse.json(
      { message: 'userId 와 since 가 필요합니다.' },
      { status: 400 },
    );
  }

  try {
    const playedAt = await findVodPlayedAtSince(userId, since);
    return NextResponse.json({ playedAt });
  } catch (err) {
    console.error('findVodPlayedAtSince error:', err);
    return NextResponse.json(
      { message: '재생 기록을 조회하지 못했습니다.' },
      { status: 503 },
    );
  }
}
