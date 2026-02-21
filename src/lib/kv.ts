import { kv } from '@vercel/kv';
import { VodItem } from './types';
import { KV_KEYS } from './constants';

export async function getVodList(): Promise<VodItem[]> {
  const list = await kv.get<VodItem[]>(KV_KEYS.VOD_LIST);
  if (!list) return [];
  return list.sort((a, b) => a.order - b.order);
}

export async function getNextId(): Promise<number> {
  const id = await kv.incr(KV_KEYS.VOD_COUNTER);
  return id;
}

export async function addVod(
  data: Pick<VodItem, 'title' | 'youtubeId'>
): Promise<VodItem> {
  const list = await getVodList();
  const id = await getNextId();
  const newVod: VodItem = {
    id,
    title: data.title,
    youtubeId: data.youtubeId,
    order: list.length + 1,
    createdAt: new Date().toISOString(),
  };
  await kv.set(KV_KEYS.VOD_LIST, [...list, newVod]);
  return newVod;
}

export async function deleteVod(id: number): Promise<void> {
  const list = await getVodList();
  const updated = list
    .filter((v) => v.id !== id)
    .map((v, i) => ({ ...v, order: i + 1 }));
  await kv.set(KV_KEYS.VOD_LIST, updated);
}

export async function updateVodOrder(
  orderedIds: number[]
): Promise<VodItem[]> {
  const list = await getVodList();
  const updated = orderedIds
    .map((id, i) => {
      const vod = list.find((v) => v.id === id);
      if (!vod) return null;
      return { ...vod, order: i + 1 };
    })
    .filter((v): v is VodItem => v !== null);
  await kv.set(KV_KEYS.VOD_LIST, updated);
  return updated;
}
