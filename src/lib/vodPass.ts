/**
 * VOD 이용권(LC-3438) 서버 전용 모듈.
 *
 * `lib/auth.ts` 는 클라이언트 전용이고, 렛커 서버 호출은 서버 전용 env(`LETSCAREER_API_URL`)
 * 가 필요하다. `lib/sso.ts` 와 같은 이유로 클라이언트 모듈에 넣지 않는다.
 */

export interface VodPass {
  applicationId: number;
  /** `UNACTIVATED | SCHEDULED | ACTIVE | EXPIRED | CANCELED`. 모르는 값도 그대로 둔다. */
  status: string;
  durationDays: number;
  /** 활성화 전에는 null. */
  startsAt: string | null;
  endsAt: string | null;
}

export type ActivateVodPassResult =
  | { ok: true; startsAt: string | null; endsAt: string | null }
  | { ok: false; status: number; message: string };

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function toVodPass(raw: unknown): VodPass | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const item = raw as Record<string, unknown>;
  if (
    typeof item.applicationId !== 'number' ||
    typeof item.status !== 'string' ||
    typeof item.durationDays !== 'number'
  ) {
    return null;
  }
  return {
    applicationId: item.applicationId,
    status: item.status,
    durationDays: item.durationDays,
    startsAt: typeof item.startsAt === 'string' ? item.startsAt : null,
    endsAt: typeof item.endsAt === 'string' ? item.endsAt : null,
  };
}

/** 렛커 서버는 `{status, message, data}` 로 감싸 내려준다. 감싸지 않은 형태도 받는다. */
function unwrapData(body: unknown): Record<string, unknown> | null {
  if (typeof body !== 'object' || body === null) return null;
  const record = body as Record<string, unknown>;
  const data = record.data;
  if (typeof data === 'object' && data !== null) {
    return data as Record<string, unknown>;
  }
  return record;
}

/**
 * `GET /api/v1/vod-pass`. 내 이용권 목록을 돌려준다. 실패는 모두 null 이다.
 * 이용권은 활성화 직후에도 바뀌므로 캐시하지 않는다.
 */
export async function getMyVodPasses(token: string): Promise<VodPass[] | null> {
  const apiUrl = process.env.LETSCAREER_API_URL;
  if (!apiUrl) return null;

  try {
    const res = await fetch(`${apiUrl}/api/v1/vod-pass`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;

    const data = unwrapData(await res.json());
    if (!data || !Array.isArray(data.passes)) return null;

    return data.passes
      .map(toVodPass)
      .filter((pass): pass is VodPass => pass !== null);
  } catch {
    return null;
  }
}

/**
 * `POST /api/v1/vod-pass/{applicationId}/activate`.
 * 호출한 쪽이 404(본인 이용권 없음), 409(취소됨·기간 충돌·환불 확인 중)를 구분할 수 있게
 * HTTP 상태와 렛커 서버가 준 메시지를 그대로 돌려준다.
 */
export async function activateVodPass(
  token: string,
  applicationId: number,
): Promise<ActivateVodPassResult> {
  const apiUrl = process.env.LETSCAREER_API_URL;
  if (!apiUrl) {
    return {
      ok: false,
      status: 502,
      message: '이용권 서버 주소가 설정되지 않았습니다.',
    };
  }

  try {
    const res = await fetch(
      `${apiUrl}/api/v1/vod-pass/${encodeURIComponent(applicationId)}/activate`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      },
    );

    const body: unknown = await res.json().catch(() => null);

    if (!res.ok) {
      const message =
        typeof (body as { message?: unknown } | null)?.message === 'string'
          ? (body as { message: string }).message
          : '이용권을 활성화하지 못했습니다.';
      return { ok: false, status: res.status, message };
    }

    // 이미 활성화가 끝난 응답이다. 본문을 못 읽어도 실패로 돌려주지 않는다.
    const activated = unwrapData(body);
    return {
      ok: true,
      startsAt:
        typeof activated?.startsAt === 'string' ? activated.startsAt : null,
      endsAt: typeof activated?.endsAt === 'string' ? activated.endsAt : null,
    };
  } catch {
    return {
      ok: false,
      status: 502,
      message: '이용권 서버에 연결하지 못했습니다.',
    };
  }
}

/** 활성화 대상: 미활성 이용권 중 가장 먼저 구매한 것(applicationId 가 가장 작은 것). */
export function pickActivatablePass(passes: VodPass[]): VodPass | null {
  let picked: VodPass | null = null;
  for (const pass of passes) {
    if (pass.status !== 'UNACTIVATED') continue;
    if (picked === null || pass.applicationId < picked.applicationId) {
      picked = pass;
    }
  }
  return picked;
}

/**
 * 지금 활성화하면 이용이 끝나는 날짜(KST, `YYYY-MM-DD`). 화면에는 "예상" 으로만 쓴다 —
 * 실제 종료 시각은 활성화 순간 렛커 서버가 정한다.
 */
export function expectedEndDate(durationDays: number, now: Date): string {
  const kstEnd = new Date(
    now.getTime() + KST_OFFSET_MS + durationDays * DAY_MS,
  );
  return kstEnd.toISOString().slice(0, 10);
}
