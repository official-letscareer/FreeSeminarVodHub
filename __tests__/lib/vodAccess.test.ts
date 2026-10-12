jest.mock('@/lib/kv');
jest.mock('@/lib/sso');
jest.mock('@/lib/vodPass', () => ({
  ...jest.requireActual('@/lib/vodPass'),
  getMyVodPasses: jest.fn(),
}));

import { NextRequest } from 'next/server';
import { checkVodAccess } from '@/lib/vodAccess';
import { getAccessSettings } from '@/lib/kv';
import { getSsoUserProfile, SSO_ACCESS_TOKEN_COOKIE } from '@/lib/sso';
import { getMyVodPasses, VodPass } from '@/lib/vodPass';
import { AccessSettings } from '@/lib/types';

const mockGetAccessSettings = getAccessSettings as jest.MockedFunction<
  typeof getAccessSettings
>;
const mockGetSsoUserProfile = getSsoUserProfile as jest.MockedFunction<
  typeof getSsoUserProfile
>;
const mockGetMyVodPasses = getMyVodPasses as jest.MockedFunction<
  typeof getMyVodPasses
>;

const GATE_OFF: AccessSettings = {
  requireChallengeParticipation: false,
  requireChallengeOption: false,
  allowedOptionCodes: [],
  requireVodPass: false,
};
const GATE_ON: AccessSettings = { ...GATE_OFF, requireVodPass: true };

function makeSsoReq(): NextRequest {
  const req = new NextRequest('http://localhost/api/vod');
  req.cookies.set(SSO_ACCESS_TOKEN_COOKIE, 'access.jwt.value');
  return req;
}

function profile(canWatchVod: boolean | null, participating = false) {
  return {
    name: '홍길동',
    isActiveChallengeParticipant: participating,
    optionCodes: [],
    canWatchVod,
  };
}

function pass(overrides: Partial<VodPass>): VodPass {
  return {
    applicationId: 1,
    status: 'UNACTIVATED',
    durationDays: 30,
    startsAt: null,
    endsAt: null,
    ...overrides,
  };
}

describe('checkVodAccess', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-10-12T03:00:00Z'));
    mockGetAccessSettings.mockResolvedValue(GATE_OFF);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('판정표 5가지(LC-3438)', () => {
    it('requireVodPass OFF — canWatchVod 가 false 여도 기존 판정(필터 꺼짐)으로 통과한다', async () => {
      mockGetSsoUserProfile.mockResolvedValue(profile(false));

      const result = await checkVodAccess(makeSsoReq());

      expect(result).toEqual({ authorized: true });
      expect(mockGetMyVodPasses).not.toHaveBeenCalled();
    });

    it('requireVodPass OFF — 기존 챌린지 참여 필터가 그대로 적용된다', async () => {
      mockGetSsoUserProfile.mockResolvedValue(profile(true, false));
      mockGetAccessSettings.mockResolvedValue({
        ...GATE_OFF,
        requireChallengeParticipation: true,
      });

      const result = await checkVodAccess(makeSsoReq());

      expect(result).toEqual({ authorized: false, reason: 'ineligible' });
      expect(mockGetMyVodPasses).not.toHaveBeenCalled();
    });

    it('ON + canWatchVod true — 통과한다', async () => {
      mockGetSsoUserProfile.mockResolvedValue(profile(true));
      mockGetAccessSettings.mockResolvedValue(GATE_ON);

      const result = await checkVodAccess(makeSsoReq());

      expect(result).toEqual({ authorized: true });
    });

    it('ON + canWatchVod true — 챌린지 필터가 켜져 있어도 쓰이지 않는다', async () => {
      mockGetSsoUserProfile.mockResolvedValue(profile(true, false));
      mockGetAccessSettings.mockResolvedValue({
        ...GATE_ON,
        requireChallengeParticipation: true,
      });

      const result = await checkVodAccess(makeSsoReq());

      expect(result).toEqual({ authorized: true });
    });

    it('ON + canWatchVod false + 미활성 이용권 있음 — inactive-pass 와 대상 이용권을 돌려준다', async () => {
      mockGetSsoUserProfile.mockResolvedValue(profile(false));
      mockGetAccessSettings.mockResolvedValue(GATE_ON);
      mockGetMyVodPasses.mockResolvedValue([
        pass({ applicationId: 20 }),
        pass({ applicationId: 10, durationDays: 30 }),
        pass({ applicationId: 5, status: 'EXPIRED' }),
      ]);

      const result = await checkVodAccess(makeSsoReq());

      expect(result).toEqual({
        authorized: false,
        reason: 'inactive-pass',
        pass: {
          applicationId: 10,
          durationDays: 30,
          // 2026-10-12 12:00 KST + 30일
          expectedEndDate: '2026-11-11',
        },
        inactiveCount: 2,
      });
      expect(mockGetMyVodPasses).toHaveBeenCalledWith('access.jwt.value');
    });

    it('ON + canWatchVod false + 미활성 이용권 없음 — ineligible', async () => {
      mockGetSsoUserProfile.mockResolvedValue(profile(false));
      mockGetAccessSettings.mockResolvedValue(GATE_ON);
      mockGetMyVodPasses.mockResolvedValue([
        pass({ applicationId: 1, status: 'EXPIRED' }),
        pass({ applicationId: 2, status: 'CANCELED' }),
      ]);

      const result = await checkVodAccess(makeSsoReq());

      expect(result).toEqual({ authorized: false, reason: 'ineligible' });
    });

    it('ON + canWatchVod false + 이용권이 하나도 없음 — ineligible', async () => {
      mockGetSsoUserProfile.mockResolvedValue(profile(false));
      mockGetAccessSettings.mockResolvedValue(GATE_ON);
      mockGetMyVodPasses.mockResolvedValue([]);

      const result = await checkVodAccess(makeSsoReq());

      expect(result).toEqual({ authorized: false, reason: 'ineligible' });
    });

    it('ON + canWatchVod false + 이용권 조회 실패(null) — ineligible', async () => {
      mockGetSsoUserProfile.mockResolvedValue(profile(false));
      mockGetAccessSettings.mockResolvedValue(GATE_ON);
      mockGetMyVodPasses.mockResolvedValue(null);

      const result = await checkVodAccess(makeSsoReq());

      expect(result).toEqual({ authorized: false, reason: 'ineligible' });
    });

    it('ON + canWatchVod null(구버전 서버) — 기존 판정으로 폴백한다(필터 꺼짐이면 통과)', async () => {
      mockGetSsoUserProfile.mockResolvedValue(profile(null));
      mockGetAccessSettings.mockResolvedValue(GATE_ON);

      const result = await checkVodAccess(makeSsoReq());

      expect(result).toEqual({ authorized: true });
      expect(mockGetMyVodPasses).not.toHaveBeenCalled();
    });

    it('ON + canWatchVod null — 기존 필터가 켜져 있으면 그 판정을 따른다', async () => {
      mockGetSsoUserProfile.mockResolvedValue(profile(null, false));
      mockGetAccessSettings.mockResolvedValue({
        ...GATE_ON,
        requireChallengeParticipation: true,
      });

      const result = await checkVodAccess(makeSsoReq());

      expect(result).toEqual({ authorized: false, reason: 'ineligible' });
    });
  });

  describe('우회 경로와 요청 수', () => {
    it('auth_verified 쿠키는 설정·프로필·이용권을 하나도 조회하지 않고 통과한다', async () => {
      const req = new NextRequest('http://localhost/api/vod');
      req.cookies.set('auth_verified', '1');
      mockGetAccessSettings.mockResolvedValue(GATE_ON);

      const result = await checkVodAccess(req);

      expect(result).toEqual({ authorized: true });
      expect(mockGetSsoUserProfile).not.toHaveBeenCalled();
      expect(mockGetAccessSettings).not.toHaveBeenCalled();
      expect(mockGetMyVodPasses).not.toHaveBeenCalled();
    });

    it('SSO 쿠키가 없으면 no-auth', async () => {
      const result = await checkVodAccess(
        new NextRequest('http://localhost/api/vod'),
      );

      expect(result).toEqual({ authorized: false, reason: 'no-auth' });
    });

    it('토큰이 무효하면 invalid-token 이고 설정·이용권을 조회하지 않는다', async () => {
      mockGetSsoUserProfile.mockResolvedValue(null);

      const result = await checkVodAccess(makeSsoReq());

      expect(result).toEqual({ authorized: false, reason: 'invalid-token' });
      expect(mockGetAccessSettings).not.toHaveBeenCalled();
      expect(mockGetMyVodPasses).not.toHaveBeenCalled();
    });

    it('통과 경로(canWatchVod true)에서는 getMyVodPasses 를 호출하지 않는다', async () => {
      mockGetSsoUserProfile.mockResolvedValue(profile(true));
      mockGetAccessSettings.mockResolvedValue(GATE_ON);

      await checkVodAccess(makeSsoReq());

      expect(mockGetMyVodPasses).not.toHaveBeenCalled();
    });
  });
});
