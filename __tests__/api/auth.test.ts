import { POST } from '@/app/api/auth/verify/route';
import { NextRequest } from 'next/server';

global.fetch = jest.fn();

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/auth/verify', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/auth/verify', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('이름 빈값이면 400 반환', async () => {
    const res = await POST(makeRequest({ name: '', phoneNum: '01012345678' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('이름을 입력해주세요.');
  });

  it('전화번호 형식 오류 시 400 반환', async () => {
    const res = await POST(makeRequest({ name: '홍길동', phoneNum: '123' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain('전화번호');
  });

  it('잘못된 JSON 입력 시 400 반환', async () => {
    const req = new NextRequest('http://localhost/api/auth/verify', {
      method: 'POST',
      body: 'invalid json',
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  describe('MOCK_MODE=true', () => {
    beforeAll(() => {
      process.env.MOCK_MODE = 'true';
    });
    afterAll(() => {
      delete process.env.MOCK_MODE;
    });

    it('유효한 입력 시 isChallenge: true 반환', async () => {
      const res = await POST(makeRequest({ name: '홍길동', phoneNum: '01012345678' }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.isChallenge).toBe(true);
    });
  });

  describe('실제 API 호출', () => {
    beforeAll(() => {
      delete process.env.MOCK_MODE;
      process.env.LETSCAREER_API_URL = 'https://api.letscareer.co.kr';
    });

    it('외부 API가 isChallenge: true 반환 시 그대로 전달', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        json: async () => ({ status: 200, data: { isChallenge: true } }),
      });
      const res = await POST(makeRequest({ name: '홍길동', phoneNum: '01012345678' }));
      const body = await res.json();
      expect(body.isChallenge).toBe(true);
    });

    it('외부 API가 isChallenge: false 반환 시 그대로 전달', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        json: async () => ({ status: 200, data: { isChallenge: false } }),
      });
      const res = await POST(makeRequest({ name: '홍길동', phoneNum: '01012345678' }));
      const body = await res.json();
      expect(body.isChallenge).toBe(false);
    });

    it('외부 API 연결 실패 시 502 반환', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));
      const res = await POST(makeRequest({ name: '홍길동', phoneNum: '01012345678' }));
      expect(res.status).toBe(502);
    });
  });
});
