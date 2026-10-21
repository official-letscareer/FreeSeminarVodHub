import { NextRequest, NextResponse } from 'next/server';
import {
  getGroupAccessRules,
  addGroupAccessRule,
  updateGroupAccessRule,
  deleteGroupAccessRule,
} from '@/lib/kv';
import { isLocalDateTime, parseKstDateTime } from '@/lib/groupAccess';
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from '@/lib/adminSession';

const CHALLENGE_PLAN_TYPES = ['LIGHT', 'BASIC', 'STANDARD', 'PREMIUM'];
const MAX_GRACE_DAYS = 365;
// 종료 후 이 일수 안의 프로그램까지 규칙을 만들 수 있다. 서버 프로그램 검색 범위와 같다.
const MAX_ENDED_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;

// 접근 권한을 만드는 API 라 서명 없는 admin_verified=1 만으로는 통과하지 못한다(누구나 쿠키를 직접
// 넣을 수 있다). usage-logs 처럼 로그인 때 발급된 서명 세션(admin_session)이 함께 있어야 한다.
function isAdminAuthorized(request: NextRequest): boolean {
  return (
    request.cookies.get('admin_verified')?.value === '1' &&
    verifyAdminSession(request.cookies.get(ADMIN_SESSION_COOKIE)?.value)
  );
}

function badRequest(message: string) {
  return NextResponse.json({ message }, { status: 400 });
}

function isValidGraceDays(value: unknown): value is number {
  return (
    Number.isInteger(value) &&
    (value as number) >= 0 &&
    (value as number) <= MAX_GRACE_DAYS
  );
}

function isValidPlanTypes(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((plan) => CHALLENGE_PLAN_TYPES.includes(plan))
  );
}

function isValidMemo(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === 'string';
}

function normalizeMemo(memo: string | null | undefined): string | null {
  return memo?.trim() || null;
}

// 프로그램 날짜는 드롭다운 목록(서버 응답)의 오프셋 없는 KST LocalDateTime 으로 받는다.
// 오프셋을 붙여 저장해야 timestamptz 가 DB 세션 시간대(UTC)로 읽어 9시간 어긋나지 않는다.
function toKstDate(value: unknown): Date | null {
  return isLocalDateTime(value) ? parseKstDateTime(value) : null;
}

async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json(
      { message: '인증이 필요합니다.' },
      { status: 401 },
    );
  }
  const rules = await getGroupAccessRules();
  return NextResponse.json(rules);
}

export async function POST(request: NextRequest) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json(
      { message: '인증이 필요합니다.' },
      { status: 401 },
    );
  }

  const body = await readJson(request);
  if (!body || typeof body !== 'object')
    return badRequest('잘못된 요청입니다.');

  const {
    programType,
    programId,
    programTitle,
    programStartDate,
    programEndDate,
    planTypes,
    graceDays,
    memo,
  } = body as Record<string, unknown>;

  if (programType !== 'CHALLENGE' && programType !== 'LIVE') {
    return badRequest('프로그램 종류는 CHALLENGE 또는 LIVE 여야 합니다.');
  }
  if (!Number.isInteger(programId) || (programId as number) <= 0) {
    return badRequest('프로그램을 선택해주세요.');
  }
  if (programTitle !== undefined && typeof programTitle !== 'string') {
    return badRequest('프로그램 제목 형식이 올바르지 않습니다.');
  }
  const startDate = toKstDate(programStartDate);
  const endDate = toKstDate(programEndDate);
  if (!startDate || !endDate) {
    return badRequest('프로그램 기간 형식이 올바르지 않습니다.');
  }
  // 규칙은 종료 후 1년 이내 프로그램까지만 만든다. 이미 만든 규칙은 그 뒤에도 남는다.
  if (endDate.getTime() < Date.now() - MAX_ENDED_DAYS * DAY_MS) {
    return badRequest(
      '종료 후 1년이 지난 프로그램에는 규칙을 만들 수 없습니다.',
    );
  }
  if (!isValidPlanTypes(planTypes)) {
    return badRequest('플랜 형식이 올바르지 않습니다.');
  }
  // LIVE 는 플랜이 없다. 플랜을 넣으면 신청의 planType(null)과 맞지 않아 아무도 통과하지 못한다.
  if (programType === 'LIVE' && planTypes.length > 0) {
    return badRequest('LIVE 는 플랜을 선택할 수 없습니다.');
  }
  if (!isValidGraceDays(graceDays)) {
    return badRequest(
      `종료 후 열람 일수는 0~${MAX_GRACE_DAYS} 사이 정수여야 합니다.`,
    );
  }
  if (!isValidMemo(memo)) return badRequest('메모 형식이 올바르지 않습니다.');

  const rule = await addGroupAccessRule({
    programType,
    programId: programId as number,
    programTitle: programTitle?.trim() ?? '',
    programStartDate: startDate.toISOString(),
    programEndDate: endDate.toISOString(),
    planTypes,
    graceDays,
    memo: normalizeMemo(memo),
  });
  return NextResponse.json(rule, { status: 201 });
}

// 플랜·N·메모만 바꾼다. 셋 다 받아 덮어쓴다(docs/group-access-rules.sql 의 update 함수와 같다).
export async function PATCH(request: NextRequest) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json(
      { message: '인증이 필요합니다.' },
      { status: 401 },
    );
  }

  const body = await readJson(request);
  if (!body || typeof body !== 'object')
    return badRequest('잘못된 요청입니다.');

  const { id, planTypes, graceDays, memo } = body as Record<string, unknown>;

  if (typeof id !== 'number') return badRequest('id(number)가 필요합니다.');
  if (!isValidPlanTypes(planTypes)) {
    return badRequest('플랜 형식이 올바르지 않습니다.');
  }
  if (!isValidGraceDays(graceDays)) {
    return badRequest(
      `종료 후 열람 일수는 0~${MAX_GRACE_DAYS} 사이 정수여야 합니다.`,
    );
  }
  if (!isValidMemo(memo)) return badRequest('메모 형식이 올바르지 않습니다.');

  // LIVE 규칙에 플랜이 들어가지 않게 하려면 규칙의 종류를 알아야 한다. 어드민만 부르는 경로라
  // 목록을 한 번 더 읽는 비용은 감수한다.
  const rule = (await getGroupAccessRules()).find((r) => r.id === id);
  if (!rule) {
    return NextResponse.json(
      { message: '규칙을 찾을 수 없습니다.' },
      { status: 404 },
    );
  }
  if (rule.programType === 'LIVE' && planTypes.length > 0) {
    return badRequest('LIVE 는 플랜을 선택할 수 없습니다.');
  }

  await updateGroupAccessRule(id, {
    planTypes,
    graceDays,
    memo: normalizeMemo(memo),
  });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json(
      { message: '인증이 필요합니다.' },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(request.url);
  const idParam = searchParams.get('id');
  const id = idParam ? parseInt(idParam, 10) : NaN;

  if (isNaN(id)) return badRequest('규칙 ID가 필요합니다.');

  await deleteGroupAccessRule(id);
  return NextResponse.json({ success: true });
}
