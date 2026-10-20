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
  updateVodDescription,
  getAllowedUsers,
  addAllowedUser,
  deleteAllowedUser,
  isAllowedUser,
  checkRateLimit,
  getAccessSettings,
  updateAccessSettings,
  insertUsageLogs,
  getGroupAccessRules,
  addGroupAccessRule,
  updateGroupAccessRule,
  deleteGroupAccessRule,
} from '@/lib/kv';

const mockFrom = supabase!.from as jest.Mock;

function createChain(result: {
  data?: unknown;
  error?: unknown;
  count?: number | null;
}) {
  const resolveValue = {
    data: result.data ?? null,
    error: result.error ?? null,
    count: result.count ?? null,
  };
  const chain: Record<string, unknown> = {};
  const methods = [
    'select',
    'insert',
    'update',
    'delete',
    'order',
    'eq',
    'gte',
    'lt',
    'limit',
  ];
  for (const method of methods) {
    chain[method] = jest.fn(() => chain);
  }
  chain.single = jest.fn(() => Promise.resolve(resolveValue));
  chain.maybeSingle = jest.fn(() => Promise.resolve(resolveValue));
  chain.then = (resolve: (v: unknown) => void) =>
    Promise.resolve(resolveValue).then(resolve);
  return chain;
}

describe('kv (Supabase)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getVodList', () => {
    it('VOD 목록 반환', async () => {
      const rows = [
        {
          id: 1,
          title: 'A',
          youtube_id: 'aaa',
          description: '설명A',
          order: 1,
          embed_enabled: true,
          created_at: '2024-01-01',
        },
        {
          id: 2,
          title: 'B',
          youtube_id: 'bbb',
          description: '',
          order: 2,
          embed_enabled: false,
          created_at: '2024-01-02',
        },
      ];
      mockFrom.mockReturnValue(createChain({ data: rows }));

      const result = await getVodList();
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(1);
      expect(result[0].youtubeId).toBe('aaa');
      expect(result[0].description).toBe('설명A');
      expect(result[1].embedEnabled).toBe(false);
      expect(result[1].description).toBe('');
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
        {
          id: 1,
          title: 'A',
          youtube_id: 'aaa',
          description: '',
          order: 1,
          embed_enabled: true,
          created_at: '2024-01-01',
        },
      ];
      const chain = createChain({ data: rows });
      mockFrom.mockReturnValue(chain);

      const result = await getEnabledVodList();
      expect(result).toHaveLength(1);
      expect(chain.eq as jest.Mock).toHaveBeenCalledWith('embed_enabled', true);
    });
  });

  describe('addVod', () => {
    it('새 VOD 추가 (기존 VOD 있을 때)', async () => {
      const maxOrderChain = createChain({ data: { order: 3 } });
      const insertChain = createChain({
        data: {
          id: 4,
          title: 'New',
          youtube_id: 'xyz',
          description: '새 설명',
          order: 4,
          embed_enabled: true,
          created_at: '2024-01-01',
        },
      });
      mockFrom
        .mockReturnValueOnce(maxOrderChain)
        .mockReturnValueOnce(insertChain);

      const result = await addVod({
        title: 'New',
        youtubeId: 'xyz',
        description: '새 설명',
        publishedAt: null,
      });
      expect(result.id).toBe(4);
      expect(result.title).toBe('New');
      expect(result.description).toBe('새 설명');
      expect(result.order).toBe(4);
    });

    it('첫 VOD 추가 (기존 없을 때)', async () => {
      const maxOrderChain = createChain({ data: null });
      const insertChain = createChain({
        data: {
          id: 1,
          title: 'First',
          youtube_id: 'abc',
          description: '',
          order: 1,
          embed_enabled: true,
          created_at: '2024-01-01',
        },
      });
      mockFrom
        .mockReturnValueOnce(maxOrderChain)
        .mockReturnValueOnce(insertChain);

      const result = await addVod({
        title: 'First',
        youtubeId: 'abc',
        description: '',
        publishedAt: null,
      });
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
          {
            id: 1,
            title: 'A',
            youtube_id: 'a',
            description: '',
            order: 1,
            embed_enabled: true,
            created_at: '',
          },
          {
            id: 3,
            title: 'C',
            youtube_id: 'c',
            description: '',
            order: 3,
            embed_enabled: true,
            created_at: '',
          },
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

  describe('updateVodDescription', () => {
    it('설명 업데이트', async () => {
      const chain = createChain({ data: null });
      mockFrom.mockReturnValue(chain);

      await updateVodDescription(1, '새로운 설명');
      expect(chain.update as jest.Mock).toHaveBeenCalledWith({
        description: '새로운 설명',
      });
      expect(chain.eq as jest.Mock).toHaveBeenCalledWith('id', 1);
    });

    it('Supabase 에러 시 throw', async () => {
      mockFrom.mockReturnValue(
        createChain({ error: { message: 'update error' } }),
      );
      await expect(updateVodDescription(1, 'test')).rejects.toEqual({
        message: 'update error',
      });
    });
  });

  describe('toggleVodEmbed', () => {
    it('embed 상태 토글', async () => {
      const chain = createChain({ data: null });
      mockFrom.mockReturnValue(chain);

      await toggleVodEmbed(1, false);
      expect(chain.update as jest.Mock).toHaveBeenCalledWith({
        embed_enabled: false,
      });
      expect(chain.eq as jest.Mock).toHaveBeenCalledWith('id', 1);
    });
  });

  describe('updateVodOrder', () => {
    it('순서 변경 후 목록 반환', async () => {
      // 2 updates + 1 getVodList
      const update1 = createChain({ data: null });
      const update2 = createChain({ data: null });
      const listChain = createChain({
        data: [
          {
            id: 2,
            title: 'B',
            youtube_id: 'b',
            description: '',
            order: 1,
            embed_enabled: true,
            created_at: '',
          },
          {
            id: 1,
            title: 'A',
            youtube_id: 'a',
            description: '',
            order: 2,
            embed_enabled: true,
            created_at: '',
          },
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
        {
          id: 1,
          name: '홍길동',
          phone_num: '01012345678',
          created_at: '2024-01-01',
        },
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
        data: {
          id: 1,
          name: '홍길동',
          phone_num: '01012345678',
          created_at: '2024-01-01',
        },
      });
      mockFrom.mockReturnValue(chain);

      const result = await addAllowedUser('홍길동', '01012345678');
      expect(result.name).toBe('홍길동');
      expect(chain.insert as jest.Mock).toHaveBeenCalledWith({
        name: '홍길동',
        phone_num: '01012345678',
      });
    });
  });

  describe('deleteAllowedUser', () => {
    it('예외 유저 삭제', async () => {
      const chain = createChain({ data: null });
      mockFrom.mockReturnValue(chain);

      await deleteAllowedUser(1);
      expect(chain.eq as jest.Mock).toHaveBeenCalledWith('id', 1);
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
  describe('접근 설정 requireVodPass(LC-3438)', () => {
    const baseRow = {
      id: 1,
      require_challenge_participation: false,
      require_challenge_option: true,
      allowed_option_codes: ['WFB1'],
    };

    it('getAccessSettings: require_vod_pass 컬럼 값을 읽는다', async () => {
      mockFrom.mockReturnValue(
        createChain({ data: { ...baseRow, require_vod_pass: true } }),
      );

      const result = await getAccessSettings();

      expect(result.requireVodPass).toBe(true);
      expect(result.requireChallengeOption).toBe(true);
      expect(mockFrom).toHaveBeenCalledWith('access_settings');
    });

    it('getAccessSettings: 컬럼이 없는 행(ALTER 적용 전)은 false 로 읽는다', async () => {
      mockFrom.mockReturnValue(createChain({ data: baseRow }));

      const result = await getAccessSettings();

      expect(result.requireVodPass).toBe(false);
    });

    it('getAccessSettings: 행이 아직 없으면 기본값은 false 다', async () => {
      mockFrom.mockReturnValue(createChain({ data: null }));

      const result = await getAccessSettings();

      expect(result.requireVodPass).toBe(false);
    });

    it('updateAccessSettings: 기존 행에는 require_vod_pass 만 갱신한다', async () => {
      const selectChain = createChain({ data: { id: 1 } });
      const updateChain = createChain({
        data: { ...baseRow, require_vod_pass: true },
      });
      mockFrom
        .mockReturnValueOnce(selectChain)
        .mockReturnValueOnce(updateChain);

      const result = await updateAccessSettings({ requireVodPass: true });

      expect(updateChain.update).toHaveBeenCalledWith({
        require_vod_pass: true,
      });
      expect(result.requireVodPass).toBe(true);
    });

    it('updateAccessSettings: requireVodPass 를 보내지 않으면 컬럼을 건드리지 않는다', async () => {
      const selectChain = createChain({ data: { id: 1 } });
      const updateChain = createChain({ data: baseRow });
      mockFrom
        .mockReturnValueOnce(selectChain)
        .mockReturnValueOnce(updateChain);

      await updateAccessSettings({ requireChallengeOption: true });

      expect(updateChain.update).toHaveBeenCalledWith({
        require_challenge_option: true,
      });
    });

    it('updateAccessSettings: 행이 없으면 기본 행에 false 를 넣고 보낸 값으로 덮는다', async () => {
      const selectChain = createChain({ data: null });
      const insertChain = createChain({
        data: { ...baseRow, require_vod_pass: true },
      });
      mockFrom
        .mockReturnValueOnce(selectChain)
        .mockReturnValueOnce(insertChain);

      await updateAccessSettings({ requireVodPass: true });
      expect(insertChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({ require_vod_pass: true }),
      );

      const selectChain2 = createChain({ data: null });
      const insertChain2 = createChain({ data: baseRow });
      mockFrom
        .mockReturnValueOnce(selectChain2)
        .mockReturnValueOnce(insertChain2);

      await updateAccessSettings({ requireChallengeOption: true });
      expect(insertChain2.insert).toHaveBeenCalledWith(
        expect.objectContaining({ require_vod_pass: false }),
      );
    });
  });

  describe('insertUsageLogs (LC-3438)', () => {
    const row = {
      occurredAt: '2026-10-12T03:00:00.000Z',
      sessionId: 'sess-1',
      authMethod: 'verified' as const,
      userName: '홍길동',
      userKey: 'hash',
      eventType: 'video_seek' as const,
      vodId: 7,
      youtubeId: 'abc123XYZ',
      pagePath: '/vod/7',
      positionSec: 12.3,
      durationSec: 600,
      watchedSec: 10,
      detail: { from_sec: 10, to_sec: 25, method: 'skip' },
      userAgent: 'jest',
    };

    it('vod_usage_logs 에 snake_case 컬럼으로 여러 행을 한 번에 넣고 select 하지 않는다', async () => {
      const chain = createChain({});
      mockFrom.mockReturnValue(chain);

      await insertUsageLogs([row, { ...row, eventType: 'page_view', vodId: null }]);

      expect(mockFrom).toHaveBeenCalledWith('vod_usage_logs');
      expect(chain.insert).toHaveBeenCalledTimes(1);
      expect(chain.insert).toHaveBeenCalledWith([
        {
          occurred_at: '2026-10-12T03:00:00.000Z',
          session_id: 'sess-1',
          auth_method: 'verified',
          user_name: '홍길동',
          user_key: 'hash',
          event_type: 'video_seek',
          vod_id: 7,
          youtube_id: 'abc123XYZ',
          page_path: '/vod/7',
          position_sec: 12.3,
          duration_sec: 600,
          watched_sec: 10,
          detail: { from_sec: 10, to_sec: 25, method: 'skip' },
          user_agent: 'jest',
        },
        expect.objectContaining({ event_type: 'page_view', vod_id: null }),
      ]);
      expect(chain.select).not.toHaveBeenCalled();
    });

    it('오류가 나면 throw 한다', async () => {
      const error = { code: 'PGRST205', message: 'table not found' };
      mockFrom.mockReturnValue(createChain({ error }));

      await expect(insertUsageLogs([row])).rejects.toBe(error);
    });
  });
  describe('그룹 접근 규칙 CRUD', () => {
    const row = {
      id: 1,
      program_type: 'CHALLENGE',
      program_id: 42,
      program_title: '10월 챌린지',
      program_start_date: '2026-10-20T01:00:00+00:00',
      program_end_date: '2026-11-20T01:00:00+00:00',
      plan_types: ['BASIC', 'PREMIUM'],
      grace_days: 7,
      memo: '이전 구매자',
      created_at: '2026-10-20T00:00:00+00:00',
    };

    it('getGroupAccessRules — snake_case 행을 규칙으로 바꿔 최신순으로 돌려준다', async () => {
      const chain = createChain({ data: [row] });
      mockFrom.mockReturnValue(chain);

      const result = await getGroupAccessRules();

      expect(mockFrom).toHaveBeenCalledWith('group_access_rules');
      expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(result).toEqual([
        {
          id: 1,
          programType: 'CHALLENGE',
          programId: 42,
          programTitle: '10월 챌린지',
          programStartDate: '2026-10-20T01:00:00+00:00',
          programEndDate: '2026-11-20T01:00:00+00:00',
          planTypes: ['BASIC', 'PREMIUM'],
          graceDays: 7,
          memo: '이전 구매자',
          createdAt: '2026-10-20T00:00:00+00:00',
        },
      ]);
    });

    it('getGroupAccessRules — plan_types·memo 가 null 이면 빈 배열·null', async () => {
      mockFrom.mockReturnValue(
        createChain({ data: [{ ...row, plan_types: null, memo: null }] }),
      );

      const [rule] = await getGroupAccessRules();

      expect(rule.planTypes).toEqual([]);
      expect(rule.memo).toBeNull();
    });

    it('getGroupAccessRules — 오류가 나면 throw 한다', async () => {
      const error = { message: 'DB error' };
      mockFrom.mockReturnValue(createChain({ error }));

      await expect(getGroupAccessRules()).rejects.toBe(error);
    });

    it('addGroupAccessRule — snake_case 컬럼으로 넣고 저장된 행을 돌려준다', async () => {
      const chain = createChain({ data: row });
      mockFrom.mockReturnValue(chain);

      const result = await addGroupAccessRule({
        programType: 'CHALLENGE',
        programId: 42,
        programTitle: '10월 챌린지',
        programStartDate: '2026-10-20T10:00:00',
        programEndDate: '2026-11-20T10:00:00',
        planTypes: ['BASIC', 'PREMIUM'],
        graceDays: 7,
        memo: '이전 구매자',
      });

      expect(chain.insert).toHaveBeenCalledWith({
        program_type: 'CHALLENGE',
        program_id: 42,
        program_title: '10월 챌린지',
        program_start_date: '2026-10-20T10:00:00',
        program_end_date: '2026-11-20T10:00:00',
        plan_types: ['BASIC', 'PREMIUM'],
        grace_days: 7,
        memo: '이전 구매자',
      });
      expect(result.id).toBe(1);
      expect(result.graceDays).toBe(7);
    });

    it('updateGroupAccessRule — 플랜·N·메모만 바꾼다', async () => {
      const chain = createChain({});
      mockFrom.mockReturnValue(chain);

      await updateGroupAccessRule(1, { planTypes: [], graceDays: 0, memo: null });

      expect(chain.update).toHaveBeenCalledWith({
        plan_types: [],
        grace_days: 0,
        memo: null,
      });
      expect(chain.eq).toHaveBeenCalledWith('id', 1);
    });

    it('updateGroupAccessRule — 바꿀 값이 없으면 호출하지 않는다', async () => {
      await updateGroupAccessRule(1, {});
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('deleteGroupAccessRule — id 로 지운다', async () => {
      const chain = createChain({});
      mockFrom.mockReturnValue(chain);

      await deleteGroupAccessRule(3);

      expect(mockFrom).toHaveBeenCalledWith('group_access_rules');
      expect(chain.delete).toHaveBeenCalled();
      expect(chain.eq).toHaveBeenCalledWith('id', 3);
    });
  });
});
