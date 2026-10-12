import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { insertUsageLogs, UsageLogRow } from '@/lib/kv';
import { SSO_ACCESS_TOKEN_COOKIE, getSsoUserProfile } from '@/lib/sso';
import { USAGE_LIMITS, sanitizeUsageBatch } from '@/lib/usageLogEvents';

function unauthorized(): NextResponse {
  return NextResponse.json({ message: '인증이 필요합니다.' }, { status: 401 });
}

function badRequest(): NextResponse {
  return NextResponse.json({ message: '잘못된 요청입니다.' }, { status: 400 });
}

/**
 * VOD 이용 로그 수집(LC-3438). 본문은 `sanitizeUsageBatch` 가 정한 형식이다.
 *
 * 이 라우트는 이용권 자격(canWatchVod 등)을 보지 않는다 — 로그인한 사용자가 무엇을 했는지만
 * 기록한다. 로그 저장은 부가 기능이므로 저장소 오류나 테이블 없음은 서버 로그만 남기고 202 로
 * 응답한다. 500 은 내지 않는다. IP 는 저장하지 않는다.
 */
export async function POST(request: NextRequest) {
  try {
    const ssoToken = request.cookies.get(SSO_ACCESS_TOKEN_COOKIE)?.value;
    const verified = request.cookies.get('auth_verified')?.value === '1';
    if (!ssoToken && !verified) return unauthorized();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return badRequest();
    }

    const batch = sanitizeUsageBatch(body);
    if (!batch) return badRequest();

    let authMethod: UsageLogRow['authMethod'];
    let userName: string | null;
    let userKey: string | null;

    if (ssoToken) {
      // SSO 이름은 서버가 확인한 값만 쓴다. 클라이언트가 보낸 이름·키는 무시한다.
      const profile = await getSsoUserProfile(ssoToken);
      if (!profile) return unauthorized();
      authMethod = 'sso';
      userName = profile.name;
      userKey = createHash('sha256')
        .update(`sso:${profile.name}`)
        .digest('hex');
    } else {
      // 이름+전화번호 로그인은 서버가 이름을 알 수 없어 클라이언트 값을 그대로 쓴다.
      authMethod = 'verified';
      userName = batch.userName;
      userKey = batch.userKey;
    }

    const userAgent =
      request.headers
        .get('user-agent')
        ?.slice(0, USAGE_LIMITS.USER_AGENT_MAX) || null;

    const rows: UsageLogRow[] = batch.events.map((event) => ({
      occurredAt: event.occurredAt,
      sessionId: batch.sessionId,
      authMethod,
      userName,
      userKey,
      eventType: event.type,
      vodId: event.vodId,
      youtubeId: event.youtubeId,
      pagePath: event.pagePath,
      positionSec: event.positionSec,
      durationSec: event.durationSec,
      watchedSec: event.watchedSec,
      detail: event.detail,
      userAgent,
    }));

    try {
      await insertUsageLogs(rows);
    } catch (error) {
      // 행 내용(이름 포함)이 섞일 수 있는 details 는 남기지 않는다.
      const { code, message } = (error ?? {}) as {
        code?: unknown;
        message?: unknown;
      };
      console.error('[vod-usage-log] 저장 실패', { code, message });
      return NextResponse.json({ ok: false }, { status: 202 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('[vod-usage-log] 처리 실패', error);
    return NextResponse.json({ ok: false }, { status: 202 });
  }
}
