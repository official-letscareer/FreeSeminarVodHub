jest.mock('@vercel/kv', () => ({
  kv: {
    get: jest.fn(),
    set: jest.fn(),
    incr: jest.fn(),
  },
}));

import { kv } from '@vercel/kv';
import { getVodList, getNextId, addVod, deleteVod, updateVodOrder } from '@/lib/kv';

const mockKv = kv as jest.Mocked<typeof kv>;

describe('kv utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getVodList', () => {
    it('빈 목록 반환 (KV가 null인 경우)', async () => {
      (mockKv.get as jest.Mock).mockResolvedValue(null);
      const result = await getVodList();
      expect(result).toEqual([]);
    });

    it('order 기준으로 정렬하여 반환', async () => {
      const unsorted = [
        { id: 2, title: 'B', youtubeId: 'b', order: 2, createdAt: '' },
        { id: 1, title: 'A', youtubeId: 'a', order: 1, createdAt: '' },
      ];
      (mockKv.get as jest.Mock).mockResolvedValue(unsorted);
      const result = await getVodList();
      expect(result[0].id).toBe(1);
      expect(result[1].id).toBe(2);
    });
  });

  describe('getNextId', () => {
    it('KV counter를 증가시키고 반환', async () => {
      (mockKv.incr as jest.Mock).mockResolvedValue(3);
      const id = await getNextId();
      expect(id).toBe(3);
      expect(mockKv.incr).toHaveBeenCalledWith('vod:counter');
    });
  });

  describe('addVod', () => {
    it('새 VOD를 목록에 추가', async () => {
      (mockKv.get as jest.Mock).mockResolvedValue([]);
      (mockKv.incr as jest.Mock).mockResolvedValue(1);
      (mockKv.set as jest.Mock).mockResolvedValue('OK');

      const result = await addVod({ title: '테스트', youtubeId: 'abc123' });

      expect(result.id).toBe(1);
      expect(result.title).toBe('테스트');
      expect(result.youtubeId).toBe('abc123');
      expect(result.order).toBe(1);
      expect(mockKv.set).toHaveBeenCalledWith('vod:list', [result]);
    });
  });

  describe('deleteVod', () => {
    it('해당 ID의 VOD 삭제 후 order 재정렬', async () => {
      const list = [
        { id: 1, title: 'A', youtubeId: 'a', order: 1, createdAt: '' },
        { id: 2, title: 'B', youtubeId: 'b', order: 2, createdAt: '' },
        { id: 3, title: 'C', youtubeId: 'c', order: 3, createdAt: '' },
      ];
      (mockKv.get as jest.Mock).mockResolvedValue(list);
      (mockKv.set as jest.Mock).mockResolvedValue('OK');

      await deleteVod(2);

      const saved = (mockKv.set as jest.Mock).mock.calls[0][1];
      expect(saved).toHaveLength(2);
      expect(saved[0].id).toBe(1);
      expect(saved[0].order).toBe(1);
      expect(saved[1].id).toBe(3);
      expect(saved[1].order).toBe(2);
    });
  });

  describe('updateVodOrder', () => {
    it('ID 순서에 따라 order 업데이트', async () => {
      const list = [
        { id: 1, title: 'A', youtubeId: 'a', order: 1, createdAt: '' },
        { id: 2, title: 'B', youtubeId: 'b', order: 2, createdAt: '' },
      ];
      (mockKv.get as jest.Mock).mockResolvedValue(list);
      (mockKv.set as jest.Mock).mockResolvedValue('OK');

      const result = await updateVodOrder([2, 1]);

      expect(result[0].id).toBe(2);
      expect(result[0].order).toBe(1);
      expect(result[1].id).toBe(1);
      expect(result[1].order).toBe(2);
    });
  });
});
