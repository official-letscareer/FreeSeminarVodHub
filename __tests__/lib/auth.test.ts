import { verifyChallenge, getSession, setSession, clearSession, getAdminSession, setAdminSession, clearAdminSession } from '@/lib/auth';

const mockSessionStorage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] ?? null),
    setItem: jest.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: jest.fn((key: string) => { delete store[key]; }),
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(global, 'sessionStorage', { value: mockSessionStorage });
Object.defineProperty(global, 'window', { value: global });

global.fetch = jest.fn();

describe('auth utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSessionStorage.clear();
  });

  describe('verifyChallenge', () => {
    it('서버가 isChallenge: true 응답 시 true 반환', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ isChallenge: true }),
      });
      const result = await verifyChallenge('홍길동', '01012345678');
      expect(result).toBe(true);
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
  });

  describe('session', () => {
    it('setSession → getSession 정상 동작', () => {
      setSession({ name: '홍길동', phoneNum: '01012345678' });
      const session = getSession();
      expect(session).not.toBeNull();
      expect(session?.name).toBe('홍길동');
      expect(session?.phoneNum).toBe('01012345678');
      expect(session?.isVerified).toBe(true);
    });

    it('clearSession 후 getSession null 반환', () => {
      setSession({ name: '홍길동', phoneNum: '01012345678' });
      clearSession();
      expect(getSession()).toBeNull();
    });

    it('sessionStorage 없을 때 getSession null 반환', () => {
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
  });
});
