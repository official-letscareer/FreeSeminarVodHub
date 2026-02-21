import { verifyChallenge, getSession, setSession, clearSession, getAdminSession, setAdminSession, clearAdminSession } from '@/lib/auth';

const mockLocalStorage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] ?? null),
    setItem: jest.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: jest.fn((key: string) => { delete store[key]; }),
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(global, 'localStorage', { value: mockLocalStorage });
Object.defineProperty(global, 'window', { value: global });

global.fetch = jest.fn();

describe('auth utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalStorage.clear();
  });

  describe('verifyChallenge', () => {
    it('서버가 isChallenge: true 응답 시 true 반환', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ isChallenge: true }),
      });
      const result = await verifyChallenge('홍길동', '01012345678');
      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '홍길동', phoneNum: '01012345678' }),
      });
    });

    it('서버가 isChallenge: false 응답 시 false 반환', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ isChallenge: false }),
      });
      const result = await verifyChallenge('홍길동', '01099999999');
      expect(result).toBe(false);
    });

    it('서버 응답 실패(ok: false) 시 false 반환', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false });
      const result = await verifyChallenge('홍길동', '01012345678');
      expect(result).toBe(false);
    });

    it('네트워크 에러 시 예외 발생', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));
      await expect(verifyChallenge('홍길동', '01012345678')).rejects.toThrow('Network error');
    });
  });

  describe('session', () => {
    it('setSession → getSession 정상 동작', () => {
      setSession({ name: '홍길동', phoneNum: '01012345678' });
      const session = getSession();
      expect(session).not.toBeNull();
      expect(session?.name).toBe('홍길동');
      expect(session?.phoneNum).toBe('01012345678');
      expect(session?.isVerified).toBe(true);
      expect(session?.verifiedAt).toBeDefined();
    });

    it('clearSession 후 getSession null 반환', () => {
      setSession({ name: '홍길동', phoneNum: '01012345678' });
      clearSession();
      expect(getSession()).toBeNull();
    });

    it('sessionStorage 비어있을 때 getSession null 반환', () => {
      expect(getSession()).toBeNull();
    });

    it('sessionStorage에 잘못된 JSON이 있을 때 null 반환', () => {
      mockLocalStorage.getItem.mockReturnValueOnce('invalid-json');
      expect(getSession()).toBeNull();
    });
  });

  describe('admin session', () => {
    it('setAdminSession → getAdminSession true 반환', () => {
      setAdminSession();
      expect(getAdminSession()).toBe(true);
    });

    it('clearAdminSession 후 getAdminSession false 반환', () => {
      setAdminSession();
      clearAdminSession();
      expect(getAdminSession()).toBe(false);
    });

    it('admin 세션 미설정 시 false 반환', () => {
      expect(getAdminSession()).toBe(false);
    });
  });
});
