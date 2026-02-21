jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { supabase } from '@/lib/supabase';
import {
  getVodList,
  getEnabledVodList,
  addVod,
  deleteVod,
  updateVodOrder,
  toggleVodEmbed,
  getAllowedUsers,
  addAllowedUser,
  deleteAllowedUser,
  isAllowedUser,
  checkRateLimit,
} from '@/lib/kv';

const mockFrom = supabase!.from as jest.Mock;

function createChain(result: { data?: unknown; error?: unknown; count?: number | null }) {
  const resolveValue = {
    data: result.data ?? null,
    error: result.error ?? null,
    count: result.count ?? null,
  };
  const chain: Record<string, unknown> = {};
  const methods = ['select', 'insert', 'update', 'delete', 'order', 'eq', 'gte', 'lt', 'limit'];
  for (const method of methods) {
    chain[method] = jest.fn(() => chain);
  }
  chain.single = jest.fn(() => Promise.resolve(resolveValue));
  chain.then = (resolve: (v: unknown) => void) => Promise.resolve(resolveValue).then(resolve);
  return chain;
}

describe('kv (Supabase)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getVodList', () => {
    it('VOD 목록 반환', async () => {
      const rows = [
        { id: 1, title: 'A', youtube_id: 'aaa', order: 1, embed_enabled: true, created_at: '2024-01-01' },
        { id: 2, title: 'B', youtube_id: 'bbb', order: 2, embed_enabled: false, created_at: '2024-01-02' },
      ];
      mockFrom.mockReturnValue(createChain({ data: rows }));

      const result = await getVodList();
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(1);
      expect(result[0].youtubeId).toBe('aaa');
      expect(result[1].embedEnabled).toBe(false);
      expect(mockFrom).toHaveBeenCalledWith('vods');
    });

    it('빈 목록 반환', async () => {
      mockFrom.mockReturnValue(createChain({ data: [] }));
      const result = await getVodList();
      expect(result).toEqual([]);
    });

    it('Supabase 에러 시 throw', async () => {
      mockFrom.mockReturnValue(createChain({ error: { message: 'DB error' } }));
      await expect(getVodList()).rejects.toEqual({ message: 'DB error' });
    });
  });

  describe('getEnabledVodList', () => {
    it('embed_enabled: true인 VOD만 반환', async () => {
      const rows = [
        { id: 1, title: 'A', youtube_id: 'aaa', order: 1, embed_enabled: true, created_at: '2024-01-01' },
      ];
      const chain = createChain({ data: rows });
      mockFrom.mockReturnValue(chain);

      const result = await getEnabledVodList();
      expect(result).toHaveLength(1);
      expect((chain.eq as jest.Mock)).toHaveBeenCalledWith('embed_enabled', true);
    });
  });

  describe('addVod', () => {
    it('새 VOD 추가 (기존 VOD 있을 때)', async () => {
      const maxOrderChain = createChain({ data: { order: 3 } });
      const insertChain = createChain({
        data: { id: 4, title: 'New', youtube_id: 'xyz', order: 4, embed_enabled: true, created_at: '2024-01-01' },
      });
      mockFrom.mockReturnValueOnce(maxOrderChain).mockReturnValueOnce(insertChain);

      const result = await addVod({ title: 'New', youtubeId: 'xyz' });
      expect(result.id).toBe(4);
      expect(result.title).toBe('New');
      expect(result.order).toBe(4);
    });

    it('첫 VOD 추가 (기존 없을 때)', async () => {
      const maxOrderChain = createChain({ data: null });
      const insertChain = createChain({
        data: { id: 1, title: 'First', youtube_id: 'abc', order: 1, embed_enabled: true, created_at: '2024-01-01' },
      });
      mockFrom.mockReturnValueOnce(maxOrderChain).mockReturnValueOnce(insertChain);

      const result = await addVod({ title: 'First', youtubeId: 'abc' });
      expect(result.order).toBe(1);
    });
  });

  describe('deleteVod', () => {
    it('VOD 삭제 후 order 재정렬', async () => {
      // 1) delete query
      const deleteChain = createChain({ data: null });
      // 2) getVodList (after delete)
      const listChain = createChain({
        data: [
          { id: 1, title: 'A', youtube_id: 'a', order: 1, embed_enabled: true, created_at: '' },
          { id: 3, title: 'C', youtube_id: 'c', order: 3, embed_enabled: true, created_at: '' },
        ],
      });
      // 3+) reorder updates
      const updateChain1 = createChain({ data: null });
      const updateChain2 = createChain({ data: null });

      mockFrom
        .mockReturnValueOnce(deleteChain)
        .mockReturnValueOnce(listChain)
        .mockReturnValueOnce(updateChain1)
        .mockReturnValueOnce(updateChain2);

      await deleteVod(2);
      expect(mockFrom).toHaveBeenCalledWith('vods');
    });
  });

  describe('toggleVodEmbed', () => {
    it('embed 상태 토글', async () => {
      const chain = createChain({ data: null });
      mockFrom.mockReturnValue(chain);

      await toggleVodEmbed(1, false);
      expect((chain.update as jest.Mock)).toHaveBeenCalledWith({ embed_enabled: false });
      expect((chain.eq as jest.Mock)).toHaveBeenCalledWith('id', 1);
    });
  });

  describe('updateVodOrder', () => {
    it('순서 변경 후 목록 반환', async () => {
      // 2 updates + 1 getVodList
      const update1 = createChain({ data: null });
      const update2 = createChain({ data: null });
      const listChain = createChain({
        data: [
          { id: 2, title: 'B', youtube_id: 'b', order: 1, embed_enabled: true, created_at: '' },
          { id: 1, title: 'A', youtube_id: 'a', order: 2, embed_enabled: true, created_at: '' },
        ],
      });

      mockFrom
        .mockReturnValueOnce(update1)
        .mockReturnValueOnce(update2)
        .mockReturnValueOnce(listChain);

      const result = await updateVodOrder([2, 1]);
      expect(result[0].id).toBe(2);
      expect(result[0].order).toBe(1);
    });
  });

  describe('getAllowedUsers', () => {
    it('예외 유저 목록 반환', async () => {
      const rows = [
        { id: 1, name: '홍길동', phone_num: '01012345678', created_at: '2024-01-01' },
      ];
      mockFrom.mockReturnValue(createChain({ data: rows }));

      const result = await getAllowedUsers();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('홍길동');
      expect(result[0].phoneNum).toBe('01012345678');
      expect(mockFrom).toHaveBeenCalledWith('allowed_users');
    });
  });

  describe('addAllowedUser', () => {
    it('예외 유저 추가', async () => {
      const chain = createChain({
        data: { id: 1, name: '홍길동', phone_num: '01012345678', created_at: '2024-01-01' },
      });
      mockFrom.mockReturnValue(chain);

      const result = await addAllowedUser('홍길동', '01012345678');
      expect(result.name).toBe('홍길동');
      expect((chain.insert as jest.Mock)).toHaveBeenCalledWith({ name: '홍길동', phone_num: '01012345678' });
    });
  });

  describe('deleteAllowedUser', () => {
    it('예외 유저 삭제', async () => {
      const chain = createChain({ data: null });
      mockFrom.mockReturnValue(chain);

      await deleteAllowedUser(1);
      expect((chain.eq as jest.Mock)).toHaveBeenCalledWith('id', 1);
    });
  });

  describe('isAllowedUser', () => {
    it('등록된 유저 → true', async () => {
      mockFrom.mockReturnValue(createChain({ data: [{ id: 1 }] }));
      const result = await isAllowedUser('홍길동', '01012345678');
      expect(result).toBe(true);
    });

    it('미등록 유저 → false', async () => {
      mockFrom.mockReturnValue(createChain({ data: [] }));
      const result = await isAllowedUser('없는사람', '01099999999');
      expect(result).toBe(false);
    });
  });

  describe('checkRateLimit', () => {
    it('제한 이내 → allowed: true', async () => {
      // 1) count query
      const countChain = createChain({ count: 2, data: null });
      // 2) insert
      const insertChain = createChain({ data: null });
      // 3) delete expired
      const deleteChain = createChain({ data: null });

      mockFrom
        .mockReturnValueOnce(countChain)
        .mockReturnValueOnce(insertChain)
        .mockReturnValueOnce(deleteChain);

      const result = await checkRateLimit('test:key', 5, 60);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2);
    });

    it('제한 초과 → allowed: false', async () => {
      const countChain = createChain({ count: 5, data: null });

      mockFrom.mockReturnValueOnce(countChain);

      const result = await checkRateLimit('test:key', 5, 60);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });
  });
});
