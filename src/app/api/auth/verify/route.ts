import { NextRequest, NextResponse } from 'next/server';
import {
  isAllowedUser,
  checkRateLimit,
  getAccessSettings,
  getGroupAccessRules,
} from '@/lib/kv';
import { isEligibleForAccess } from '@/lib/accessControl';
import {
  findGroupAccessEndsAt,
  parseProgramApplications,
} from '@/lib/groupAccess';
import type { ProgramApplication } from '@/lib/types';
import { RATE_LIMIT } from '@/lib/constants';
import { setUsageLogIdentityCookie } from '@/lib/usageLogIdentity';

// 이용권 게이트(LC-3438)가 켜져 있을 때 이 경로로 들어온 `auth_verified` 쿠키의 수명.
// 이 경로는 이용권 종료일을 받지 못해 쿠키가 만료·비활성을 반영하지 못하므로 짧게 둔다.
const VOD_PASS_GATE_COOKIE_MAX_AGE = 60 * 60 * 24; // 24시간
const DEFAULT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1년 (챌린지 기간 동안 유지)


function readCanWatchVod(source: { canWatchVod?: unknown }): boolean | null {
  return typeof source.canWatchVod === 'boolean' ? source.canWatchVod : null;
}

function isValidName(name: unknown): name is string {
  return typeof name === 'string' && name.trim().length > 0;
}

function isValidPhone(phone: unknown): phone is string {
  return typeof phone === 'string' && /^010\d{8}$/.test(phone);
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: '잘못된 요청입니다.' },
      { status: 400 },
    );
  }

  const { name, phoneNum: rawPhone } = body as Record<string, unknown>;
  console.log(
    'verify request body:',
    JSON.stringify({ name, phoneNum: rawPhone }),
  );

  if (!isValidName(name)) {
    return NextResponse.json(
      { message: '이름을 입력해주세요.' },
      { status: 400 },
    );
  }

  // 하이픈, 공백 자동 제거
  const phoneNum =
    typeof rawPhone === 'string' ? rawPhone.replace(/[-\s]/g, '') : rawPhone;

  if (!isValidPhone(phoneNum)) {
    return NextResponse.json(
      {
        message: '전화번호 형식이 올바르지 않습니다. (010으로 시작하는 11자리)',
      },
      { status: 400 },
    );
  }

  // Rate Limiting (IP + 전화번호 기준)
  const ip = getClientIp(request);
  const rateLimitKey = `verify:${ip}:${phoneNum}`;
  try {
    const { allowed, remaining } = await checkRateLimit(
      rateLimitKey,
      RATE_LIMIT.MAX_REQUESTS,
      RATE_LIMIT.WINDOW_SECONDS,
    );
    if (!allowed) {
      return NextResponse.json(
        { message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(RATE_LIMIT.WINDOW_SECONDS),
            'X-RateLimit-Remaining': String(remaining),
          },
        },
      );
    }
  } catch {
    // Rate Limiting 실패 시 요청은 통과시킴
  }

  const trimmedName = name.trim();
  let isChallenge = false;
  let optionCodes: string[] = [];
  // 렛커 서버가 판정한 시청 가능 여부. 응답에 없으면(구버전 서버·예외 유저) null.
  let canWatchVod: boolean | null = null;
  // 아래 3단계에서 설정을 읽어 게이트가 켜져 있을 때만 true 가 된다. 예외 유저는 그 단계를
  // 타지 않으므로 항상 false 다.
  let vodPassGateOn = false;
  // 렛커 서버가 내려준 신청 내역(그룹 접근 규칙 대조용). 응답을 받지 못했거나 구버전 서버면 빈 배열.
  let programApplications: ProgramApplication[] = [];
  // 그룹 접근 규칙으로 통과했을 때 접근이 끝나는 시각. 쿠키 수명을 이 시각까지로 자른다.
  let groupAccessEndsAt: Date | null = null;

  // 1) 예외 유저 테이블 확인
  try {
    const allowed = await isAllowedUser(trimmedName, phoneNum);
    console.log('isAllowedUser result:', allowed);
    if (allowed) {
      isChallenge = true;
    }
  } catch (err) {
    console.error('isAllowedUser error:', err);
    // Supabase 연결 실패 시 외부 API로 폴백
  }

  if (!isChallenge) {
    // 2) 렛츠커리어 서버 v2 API 호출
    const apiUrl = process.env.LETSCAREER_API_URL;
    if (!apiUrl) {
      return NextResponse.json(
        { message: '서버 설정 오류입니다.' },
        { status: 500 },
      );
    }
    try {
      // 외부 API에는 원본 전화번호 전달 (하이픈 포함 형식으로 매칭)
      const requestBody = JSON.stringify({
        name: trimmedName,
        phoneNum: rawPhone,
      });
      const fullUrl = `${apiUrl}/api/v2/user/verify-challenge`;
      console.log('verify-challenge URL:', fullUrl);
      console.log('verify-challenge request:', requestBody);
      // 서버는 공유 비밀 헤더가 맞을 때만 신청 내역(programApplications)을 채운다. 비인증 경로라
      // 이름+전화번호만으로 남의 신청 내역을 꺼내 볼 수 없게 하기 위해서다. env 가 없으면 헤더 없이
      // 보낸다 — 신청 내역이 빈 배열로 올 뿐 기존 판정은 그대로다.
      const headers: Record<string, string> = {
        'Content-Type': 'application/json; charset=utf-8',
      };
      const vodAccessSecret = process.env.VOD_ACCESS_SHARED_SECRET;
      if (vodAccessSecret) headers['X-Vod-Access-Secret'] = vodAccessSecret;
      const res = await fetch(fullUrl, {
        method: 'POST',
        headers,
        body: requestBody,
      });

      console.log('verify-challenge API status:', res.status);
      if (res.status === 404) {
        // 가입되지 않은 사용자
        isChallenge = false;
      } else if (res.ok) {
        const data = await res.json();
        if (typeof data === 'boolean') {
          isChallenge = data;
        } else if (typeof data?.data === 'boolean') {
          isChallenge = data.data;
        } else if (typeof data?.data?.isChallenge === 'boolean') {
          isChallenge = data.data.isChallenge;
          canWatchVod = readCanWatchVod(data.data);
          programApplications = parseProgramApplications(
            data.data.programApplications,
          );
          if (Array.isArray(data?.data?.optionCodes))
            optionCodes = data.data.optionCodes;
        } else if (typeof data?.isChallenge === 'boolean') {
          isChallenge = data.isChallenge;
          canWatchVod = readCanWatchVod(data);
          programApplications = parseProgramApplications(
            data.programApplications,
          );
          if (Array.isArray(data?.optionCodes)) optionCodes = data.optionCodes;
        }
        // 원본 응답은 찍지 않는다. 신청 내역(구매 내역)이 Vercel 로그에 남기 때문이다. 판정에 쓴 값만 요약한다.
        console.log(
          'verify-challenge response:',
          JSON.stringify({
            isChallenge,
            canWatchVod,
            programApplications: programApplications.length,
          }),
        );
      } else {
        const errorBody = await res.text().catch(() => '');
        console.error(
          `verify-challenge failed: status=${res.status}, body=${errorBody}`,
        );
        return NextResponse.json(
          { message: '서버 연결에 실패했습니다.' },
          { status: 502 },
        );
      }
    } catch {
      return NextResponse.json(
        { message: '서버 연결에 실패했습니다.' },
        { status: 502 },
      );
    }

    // 3) 챌린지 참여자/옵션 필터(LC-3208) — 예외 유저는 이 단계를 타지 않는다.
    // 백엔드 호출 자체를 안 거치는 우회라 여기서 걸러지지 않고 그대로 유지된다.
    //
    // 이용권 게이트(LC-3438)가 켜져 있고 렛커 서버가 canWatchVod 를 내려줬으면 위 필터
    // 대신 그 값으로 판정한다. 값이 없으면(null) 이용권을 모르는 구버전 서버라 기존 필터로
    // 되돌아간다 — SSO 경로(`lib/vodAccess.ts`)와 같은 규칙이다.
    //
    // 통과하지 못하는 사유(가입 안 됨, 이용권 없음, 게이트 상태)는 응답에 싣지 않는다.
    // 이 경로는 비인증이라 사유가 갈리면 이름+전화번호 조합으로 가입 여부를 알아낼 수 있다.
    if (isChallenge) {
      try {
        const settings = await getAccessSettings();
        vodPassGateOn = settings.requireVodPass;
        if (vodPassGateOn && canWatchVod !== null) {
          isChallenge = isChallenge && canWatchVod;
        } else {
          isChallenge = isEligibleForAccess(settings, true, optionCodes);
        }
      } catch (err) {
        console.error('getAccessSettings error:', err);
        // 설정 조회 실패 시 필터를 적용하지 못하지만, 기존 통과자를 막는 쪽보다
        // 통과시키는 쪽이 장애 영향이 작다고 판단해 그대로 통과시킨다.
      }
    }

    // 4) 그룹 접근 규칙 — 위 판정에서 막혔을 때만 규칙을 조회한다(통과 경로에 조회를 더하지 않는다).
    // 신청 내역이 없으면(구버전 서버·가입 안 됨) 조회하지 않는다. 조회가 실패하면 막힌 결과를 그대로
    // 둔다 — 규칙은 기존 판정 위에 더하는 통과 경로라, 실패가 기존 결과를 바꾸지 않게 한다.
    if (!isChallenge && programApplications.length > 0) {
      try {
        const rules = await getGroupAccessRules();
        groupAccessEndsAt = findGroupAccessEndsAt(
          programApplications,
          rules,
          new Date(),
        );
        isChallenge = groupAccessEndsAt !== null;
      } catch (err) {
        console.error('getGroupAccessRules error:', err);
      }
    }
  }

  const response = NextResponse.json({ isChallenge });
  if (isChallenge) {
    let maxAge = vodPassGateOn
      ? VOD_PASS_GATE_COOKIE_MAX_AGE
      : DEFAULT_COOKIE_MAX_AGE;
    // 규칙으로 통과했으면 접근 종료 시각이 지나도 쿠키가 남지 않게 자른다. 이 쿠키는 접근 시점에
    // 다시 확인하지 않기 때문이다(lib/vodAccess.ts). 기존 수명보다 길게 하지는 않는다.
    if (groupAccessEndsAt) {
      maxAge = Math.min(
        maxAge,
        Math.floor((groupAccessEndsAt.getTime() - Date.now()) / 1000),
      );
    }
    response.cookies.set('auth_verified', '1', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge,
    });
    // 이용 로그(LC-3438) 서명 식별 쿠키. 응답 본문은 바꾸지 않는다.
    setUsageLogIdentityCookie(response, trimmedName, phoneNum, maxAge);
  }
  return response;
}
