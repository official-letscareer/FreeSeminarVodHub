import { getSsoUserProfile } from '@/lib/sso';

const originalFetch = global.fetch;

describe('getSsoUserProfile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    process.env.LETSCAREER_API_URL = 'https://api.example.com';
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('LETSCAREER_API_URL 미설정 시 null 반환 (요청 자체를 보내지 않는다)', async () => {
    delete process.env.LETSCAREER_API_URL;
    const result = await getSsoUserProfile('token');
    expect(result).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('정상 응답이면 name을 반환하고 Bearer 헤더로 호출한다', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ status: 200, message: 'OK', data: { name: '홍길동' } }),
    });

    const result = await getSsoUserProfile('access.jwt.value');

    expect(result).toEqual({ name: '홍길동' });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.com/api/v2/user/sso-profile',
      expect.objectContaining({
        headers: { Authorization: 'Bearer access.jwt.value' },
      }),
    );
  });

  it('401(만료·위조 토큰) 응답이면 null 반환', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 401 });
    const result = await getSsoUserProfile('expired.jwt.value');
    expect(result).toBeNull();
  });

  it('네트워크 에러여도 예외를 던지지 않고 null 반환', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('network down'));
    const result = await getSsoUserProfile('token');
    expect(result).toBeNull();
  });

  it('응답 형태가 예상과 다르면(name 없음) null 반환', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ status: 200, message: 'OK', data: {} }),
    });
    const result = await getSsoUserProfile('token');
    expect(result).toBeNull();
  });
});
