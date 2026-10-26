jest.mock('@/lib/kv');
jest.mock('@/lib/sso');
jest.mock('@/lib/playRecords');

import { NextRequest } from 'next/server';
import { GET as vodDetailGet } from '@/app/api/vod/[id]/route';
import { GET as playRecordsGet } from '@/app/api/internal/play-records/route';
import { getAccessSettings, getVodList } from '@/lib/kv';
import { getSsoUserProfile, SSO_ACCESS_TOKEN_COOKIE } from '@/lib/sso';
import { findVodPlayedAtSince, recordVodPlay } from '@/lib/playRecords';

const mockGetAccessSettings = getAccessSettings as jest.MockedFunction<
  typeof getAccessSettings
>;
const mockGetVodList = getVodList as jest.MockedFunction<typeof getVodList>;
const mockGetSsoUserProfile = getSsoUserProfile as jest.MockedFunction<
  typeof getSsoUserProfile
>;
const mockRecordVodPlay = recordVodPlay as jest.MockedFunction<
  typeof recordVodPlay
>;
const mockFindVodPlayedAtSince = findVodPlayedAtSince as jest.MockedFunction<
  typeof findVodPlayedAtSince
>;

const VOD = {
  id: 1,
  title: 'A',
  youtubeId: 'aaa',
  description: '',
  order: 1,
  embedEnabled: true,
  createdAt: '2024-01-01',
  publishedAt: null,
};

function ssoProfile(userId: number | null) {
  return {
    name: '홍길동',
    isActiveChallengeParticipant: true,
    optionCodes: [],
    canWatchVod: true,
    programApplications: [],
    userId,
  };
}

function detailReq(withSso: boolean): NextRequest {
  const req = new NextRequest('http://localhost/api/vod/1');
  if (withSso) req.cookies.set(SSO_ACCESS_TOKEN_COOKIE, 'access.jwt.value');
  else req.cookies.set('auth_verified', '1');
  return req;
}

const params = { params: Promise.resolve({ id: '1' }) };

describe('GET /api/vod/[id] — 재생 기록(LC-3507)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAccessSettings.mockResolvedValue({
      requireChallengeParticipation: false,
      requireChallengeOption: false,
      allowedOptionCodes: [],
      requireVodPass: true,
    });
    mockGetVodList.mockResolvedValue([VOD]);
  });

  it('SSO 사용자에게 영상을 내려주면 사용자 번호로 재생을 기록한다', async () => {
    mockGetSsoUserProfile.mockResolvedValue(ssoProfile(42));

    const res = await vodDetailGet(detailReq(true), params);

    expect(res.status).toBe(200);
    expect(mockRecordVodPlay).toHaveBeenCalledWith(42, 1);
  });

  it('사용자 번호가 없는 구버전 응답이면 기록하지 않는다', async () => {
    mockGetSsoUserProfile.mockResolvedValue(ssoProfile(null));

    const res = await vodDetailGet(detailReq(true), params);

    expect(res.status).toBe(200);
    expect(mockRecordVodPlay).not.toHaveBeenCalled();
  });

  it('이름+전화번호 로그인은 계정과 연결할 수 없어 기록하지 않는다', async () => {
    const res = await vodDetailGet(detailReq(false), params);

    expect(res.status).toBe(200);
    expect(mockRecordVodPlay).not.toHaveBeenCalled();
  });

  it('기록에 실패해도 영상은 내려준다', async () => {
    mockGetSsoUserProfile.mockResolvedValue(ssoProfile(42));
    mockRecordVodPlay.mockRejectedValue(new Error('db down'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await vodDetailGet(detailReq(true), params);

    expect(res.status).toBe(200);
  });
});

describe('GET /api/internal/play-records', () => {
  const TOKEN = 'server-to-hub-token';

  function req(query: string, token: string | null = TOKEN): NextRequest {
    const r = new NextRequest(
      `http://localhost/api/internal/play-records${query}`,
    );
    if (token) r.headers.set('authorization', `Bearer ${token}`);
    return r;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.VOD_PLAY_RECORD_API_TOKEN = TOKEN;
  });

  afterAll(() => {
    delete process.env.VOD_PLAY_RECORD_API_TOKEN;
  });

  it('토큰이 없거나 다르면 401', async () => {
    expect(
      (await playRecordsGet(req('?userId=42&since=2026-10-26T00:00:00Z', null)))
        .status,
    ).toBe(401);
    expect(
      (
        await playRecordsGet(
          req('?userId=42&since=2026-10-26T00:00:00Z', 'wrong'),
        )
      ).status,
    ).toBe(401);
    expect(mockFindVodPlayedAtSince).not.toHaveBeenCalled();
  });

  it('서버에 토큰이 설정되지 않았으면 누구에게도 열지 않는다', async () => {
    delete process.env.VOD_PLAY_RECORD_API_TOKEN;

    expect(
      (await playRecordsGet(req('?userId=42&since=2026-10-26T00:00:00Z')))
        .status,
    ).toBe(401);
  });

  it('userId 나 since 가 잘못되면 400', async () => {
    expect(
      (await playRecordsGet(req('?userId=abc&since=2026-10-26T00:00:00Z')))
        .status,
    ).toBe(400);
    expect((await playRecordsGet(req('?userId=42&since=nope'))).status).toBe(
      400,
    );
    expect(
      (await playRecordsGet(req('?userId=0&since=2026-10-26T00:00:00Z')))
        .status,
    ).toBe(400);
  });

  it('재생 시각 목록을 돌려준다', async () => {
    mockFindVodPlayedAtSince.mockResolvedValue(['2026-10-27T01:00:00+00:00']);

    const res = await playRecordsGet(
      req('?userId=42&since=2026-10-26T12:00:00%2B09:00'),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      playedAt: ['2026-10-27T01:00:00+00:00'],
    });
    expect(mockFindVodPlayedAtSince).toHaveBeenCalledWith(
      42,
      new Date('2026-10-26T03:00:00Z'),
    );
  });

  it('조회에 실패하면 503 — 렛츠커리어 서버는 이를 환불 불가로 처리한다', async () => {
    mockFindVodPlayedAtSince.mockRejectedValue(new Error('db down'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(
      (await playRecordsGet(req('?userId=42&since=2026-10-26T00:00:00Z')))
        .status,
    ).toBe(503);
  });
});
