import { supabase } from './supabase';
import { VodItem, AllowedUser, Banner } from './types';

function getSupabase() {
  if (!supabase) throw new Error('Supabase가 설정되지 않았습니다.');
  return supabase;
}

// ─── Supabase row → VodItem 변환 ─────────────────────────────────────────────
function toVodItem(row: Record<string, unknown>): VodItem {
  return {
    id: row.id as number,
    title: row.title as string,
    youtubeId: row.youtube_id as string,
    description: (row.description as string) ?? '',
    publishedAt: (row.published_at as string) ?? null,
    order: row.order as number,
    embedEnabled: row.embed_enabled as boolean,
    createdAt: row.created_at as string,
  };
}

function toAllowedUser(row: Record<string, unknown>): AllowedUser {
  return {
    id: row.id as number,
    name: row.name as string,
    phoneNum: row.phone_num as string,
    createdAt: row.created_at as string,
  };
}

// ─── VOD CRUD ─────────────────────────────────────────────────────────────────
export async function getVodList(): Promise<VodItem[]> {
  const { data, error } = await getSupabase()
    .from('vods')
    .select('*')
    .order('order', { ascending: true });

  if (error) throw error;
  return (data ?? []).map(toVodItem);
}

export async function getEnabledVodList(): Promise<VodItem[]> {
  const { data, error } = await getSupabase()
    .from('vods')
    .select('*')
    .eq('embed_enabled', true)
    .order('order', { ascending: true });

  if (error) throw error;
  return (data ?? []).map(toVodItem);
}

export async function addVod(
  data: Pick<VodItem, 'title' | 'youtubeId' | 'description' | 'publishedAt'>
): Promise<VodItem> {
  const { data: maxRow } = await getSupabase()
    .from('vods')
    .select('order')
    .order('order', { ascending: false })
    .limit(1)
    .single();

  const nextOrder = maxRow ? (maxRow.order as number) + 1 : 1;

  const { data: inserted, error } = await getSupabase()
    .from('vods')
    .insert({
      title: data.title,
      youtube_id: data.youtubeId,
      description: data.description,
      published_at: data.publishedAt ?? null,
      order: nextOrder,
      embed_enabled: true,
    })
    .select()
    .single();

  if (error) throw error;
  return toVodItem(inserted);
}

export async function updateVodDescription(id: number, description: string): Promise<void> {
  const { error } = await getSupabase()
    .from('vods')
    .update({ description })
    .eq('id', id);
  if (error) throw error;
}

export async function updateVodMeta(
  id: number,
  meta: { title?: string; description?: string; publishedAt?: string | null }
): Promise<void> {
  const updates: Record<string, unknown> = {};
  if (meta.title !== undefined) updates.title = meta.title;
  if (meta.description !== undefined) updates.description = meta.description;
  if ('publishedAt' in meta) updates.published_at = meta.publishedAt ?? null;

  if (Object.keys(updates).length === 0) return;
  const { error } = await getSupabase().from('vods').update(updates).eq('id', id);
  if (error) throw error;
}

export async function deleteVod(id: number): Promise<void> {
  const { error } = await getSupabase().from('vods').delete().eq('id', id);
  if (error) throw error;

  // order 재정렬
  const list = await getVodList();
  for (let i = 0; i < list.length; i++) {
    await getSupabase()
      .from('vods')
      .update({ order: i + 1 })
      .eq('id', list[i].id);
  }
}

export async function updateVodOrder(orderedIds: number[]): Promise<VodItem[]> {
  for (let i = 0; i < orderedIds.length; i++) {
    await getSupabase()
      .from('vods')
      .update({ order: i + 1 })
      .eq('id', orderedIds[i]);
  }
  return getVodList();
}

export async function toggleVodEmbed(id: number, enabled: boolean): Promise<void> {
  const { error } = await getSupabase()
    .from('vods')
    .update({ embed_enabled: enabled })
    .eq('id', id);
  if (error) throw error;
}

// ─── 예외 유저 CRUD ──────────────────────────────────────────────────────────
export async function getAllowedUsers(): Promise<AllowedUser[]> {
  const { data, error } = await getSupabase()
    .from('allowed_users')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map(toAllowedUser);
}

export async function addAllowedUser(
  name: string,
  phoneNum: string
): Promise<AllowedUser> {
  const { data, error } = await getSupabase()
    .from('allowed_users')
    .insert({ name, phone_num: phoneNum })
    .select()
    .single();

  if (error) throw error;
  return toAllowedUser(data);
}

export async function deleteAllowedUser(id: number): Promise<void> {
  const { error } = await getSupabase().from('allowed_users').delete().eq('id', id);
  if (error) throw error;
}

export async function deleteAllowedUsers(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await getSupabase().from('allowed_users').delete().in('id', ids);
  if (error) throw error;
}

export async function updateAllowedUser(
  id: number,
  data: { name?: string; phoneNum?: string }
): Promise<void> {
  const updates: Record<string, unknown> = {};
  if (data.name !== undefined) updates.name = data.name;
  if (data.phoneNum !== undefined) updates.phone_num = data.phoneNum;
  if (Object.keys(updates).length === 0) return;
  const { error } = await getSupabase().from('allowed_users').update(updates).eq('id', id);
  if (error) throw error;
}

export async function isAllowedUser(
  name: string,
  phoneNum: string
): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from('allowed_users')
    .select('id')
    .eq('name', name)
    .eq('phone_num', phoneNum)
    .limit(1);

  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

// ─── Banner CRUD ─────────────────────────────────────────────────────────────
function toBanner(row: Record<string, unknown>): Banner {
  return {
    id: row.id as number,
    imageUrl: row.image_url as string,
    linkUrl: (row.link_url as string) ?? '',
    position: (row.position as Banner['position']) ?? 'both',
    order: row.order as number,
    isRandom: (row.is_random as boolean) ?? false,
    createdAt: row.created_at as string,
  };
}

export async function getBanners(position?: Banner['position']): Promise<Banner[]> {
  let query = getSupabase()
    .from('banners')
    .select('*')
    .order('order', { ascending: true });

  if (position && position !== 'both') {
    query = query.in('position', [position, 'both']);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(toBanner);
}

export async function addBanner(data: {
  imageUrl: string;
  linkUrl: string;
  position: Banner['position'];
  isRandom: boolean;
}): Promise<Banner> {
  const { data: maxRow } = await getSupabase()
    .from('banners')
    .select('order')
    .order('order', { ascending: false })
    .limit(1)
    .single();

  const nextOrder = maxRow ? (maxRow.order as number) + 1 : 1;

  const { data: inserted, error } = await getSupabase()
    .from('banners')
    .insert({
      image_url: data.imageUrl,
      link_url: data.linkUrl,
      position: data.position,
      order: nextOrder,
      is_random: data.isRandom,
    })
    .select()
    .single();

  if (error) throw error;
  return toBanner(inserted);
}

export async function deleteBanner(id: number): Promise<void> {
  const { data } = await getSupabase()
    .from('banners')
    .select('image_url')
    .eq('id', id)
    .single();

  const { error } = await getSupabase().from('banners').delete().eq('id', id);
  if (error) throw error;

  // Supabase Storage에서 이미지 삭제 (실패해도 무시)
  if (data?.image_url) {
    const url = data.image_url as string;
    const pathMatch = url.match(/\/banners\/(.+)$/);
    if (pathMatch) {
      getSupabase().storage.from('banners').remove([pathMatch[1]]).then(() => {});
    }
  }
}

export async function updateBannerMeta(
  id: number,
  meta: { linkUrl?: string }
): Promise<void> {
  const updates: Record<string, unknown> = {};
  if (meta.linkUrl !== undefined) updates.link_url = meta.linkUrl;

  if (Object.keys(updates).length === 0) return;
  const { error } = await getSupabase().from('banners').update(updates).eq('id', id);
  if (error) throw error;
}

export async function updateBannerOrder(orderedIds: number[]): Promise<void> {
  for (let i = 0; i < orderedIds.length; i++) {
    await getSupabase()
      .from('banners')
      .update({ order: i + 1 })
      .eq('id', orderedIds[i]);
  }
}

export async function updateBannerMeta(
  id: number,
  meta: { linkUrl?: string; position?: Banner['position']; isRandom?: boolean }
): Promise<void> {
  const updates: Record<string, unknown> = {};
  if (meta.linkUrl !== undefined) updates.link_url = meta.linkUrl;
  if (meta.position !== undefined) updates.position = meta.position;
  if (meta.isRandom !== undefined) updates.is_random = meta.isRandom;

  if (Object.keys(updates).length === 0) return;
  const { error } = await getSupabase().from('banners').update(updates).eq('id', id);
  if (error) throw error;
}

// ─── Rate Limiting ───────────────────────────────────────────────────────────
export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number }> {
  const windowStart = new Date(Date.now() - windowSeconds * 1000).toISOString();

  // 윈도우 내 요청 수 조회
  const { count, error } = await getSupabase()
    .from('rate_limits')
    .select('*', { count: 'exact', head: true })
    .eq('key', key)
    .gte('created_at', windowStart);

  if (error) throw error;

  const currentCount = count ?? 0;
  const allowed = currentCount < maxRequests;

  if (allowed) {
    // 요청 기록 삽입
    await getSupabase().from('rate_limits').insert({ key });
  }

  // 만료된 레코드 정리 (비동기, 실패해도 무시)
  getSupabase()
    .from('rate_limits')
    .delete()
    .lt('created_at', windowStart)
    .then(() => {});

  return { allowed, remaining: Math.max(0, maxRequests - currentCount - (allowed ? 1 : 0)) };
}
