import { supabase } from './supabase';

/**
 * VOD 재생 기록 (LC-3507). 렛츠커리어 VOD 이용권 환불 판정이 쓴다.
 *
 * 테이블은 RLS 를 켜고 정책을 두지 않아 공개 키로는 직접 읽지도 쓰지도 못한다. 토큰을 확인하는
 * 함수(docs/vod-play-records.sql)로만 접근한다. 토큰이 없으면 오류를 던진다.
 */
function getSupabase() {
  if (!supabase) throw new Error('Supabase가 설정되지 않았습니다.');
  return supabase;
}

function getToken(): string {
  const token = process.env.VOD_PLAY_RECORD_TOKEN?.trim();
  if (!token) throw new Error('VOD_PLAY_RECORD_TOKEN 이 설정되지 않았습니다.');
  return token;
}

/** 렛츠커리어 사용자 `userId` 가 VOD `vodId` 의 재생 정보를 받았다고 기록한다. */
export async function recordVodPlay(
  userId: number,
  vodId: number,
): Promise<void> {
  const { error } = await getSupabase().rpc('vod_play_record_add', {
    p_token: getToken(),
    p_user_id: userId,
    p_vod_id: vodId,
  });
  if (error) throw error;
}

/** `since` 이후 재생 시각(ISO 문자열)을 오래된 순으로 돌려준다. */
export async function findVodPlayedAtSince(
  userId: number,
  since: Date,
): Promise<string[]> {
  const { data, error } = await getSupabase().rpc('vod_play_records_since', {
    p_token: getToken(),
    p_user_id: userId,
    p_since: since.toISOString(),
  });
  if (error) throw error;
  return Array.isArray(data)
    ? data
        .map((row) => (row as { played_at?: unknown }).played_at)
        .filter((value): value is string => typeof value === 'string')
    : [];
}
