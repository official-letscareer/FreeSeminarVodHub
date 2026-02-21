import { VodItem } from './types';
import { KV_KEYS } from './constants';

// ─── 인메모리 목 스토어 (MOCK_MODE=true 전용) ───────────────────────────────
const mockStore = new Map<string, unknown>();

const mockKv = {
  async get<T>(key: string): Promise<T | null> {
    return (mockStore.get(key) as T) ?? null;
  },
  async set(key: string, value: unknown): Promise<void> {
    mockStore.set(key, JSON.parse(JSON.stringify(value)));
  },
  async incr(key: string): Promise<number> {
    const current = (mockStore.get(key) as number) ?? 0;
    const next = current + 1;
    mockStore.set(key, next);
    return next;
  },
};

// ─── KV 인스턴스 선택 ─────────────────────────────────────────────────────────
function getKv() {
  if (process.env.MOCK_MODE === 'true') {
    return mockKv;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { kv } = require('@vercel/kv');
  return kv;
}

// ─── 공개 API ─────────────────────────────────────────────────────────────────
export async function getVodList(): Promise<VodItem[]> {
  const store = getKv();
  const list = (await store.get(KV_KEYS.VOD_LIST)) as VodItem[] | null;
  if (!list) return [];
  return list.sort((a: VodItem, b: VodItem) => a.order - b.order);
}

export async function getNextId(): Promise<number> {
  const store = getKv();
  return store.incr(KV_KEYS.VOD_COUNTER);
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
  const store = getKv();
  await store.set(KV_KEYS.VOD_LIST, [...list, newVod]);
  return newVod;
}

export async function deleteVod(id: number): Promise<void> {
  const list = await getVodList();
  const updated = list
    .filter((v: VodItem) => v.id !== id)
    .map((v: VodItem, i: number) => ({ ...v, order: i + 1 }));
  const store = getKv();
  await store.set(KV_KEYS.VOD_LIST, updated);
}

export async function updateVodOrder(orderedIds: number[]): Promise<VodItem[]> {
  const list = await getVodList();
  const updated = orderedIds
    .map((id, i) => {
      const vod = list.find((v: VodItem) => v.id === id);
      if (!vod) return null;
      return { ...vod, order: i + 1 };
    })
    .filter((v): v is VodItem => v !== null);
  const store = getKv();
  await store.set(KV_KEYS.VOD_LIST, updated);
  return updated;
}
