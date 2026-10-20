import type { GroupAccessRule, ProgramApplication } from './types';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// 서버 날짜는 오프셋 없는 KST LocalDateTime 이다. 오프셋을 붙이지 않고 new Date 에 넘기면
// 실행 환경(Vercel 은 UTC)의 시간대로 읽혀 9시간이 어긋난다.
function parseKstDateTime(value: string): Date {
  return new Date(`${value}+09:00`);
}

// 종료일의 KST 날짜 기준으로 graceDays 일 뒤 23:59:59.999 KST. 종료 시각(예: 오후 10시)이 아니라
// 그날 하루 끝까지 열어 둔다 — 서버 기본 유예 규칙과 같은 기준이다.
function endOfGraceKst(endDate: string, graceDays: number): Date {
  const [year, month, day] = endDate.slice(0, 10).split('-').map(Number);
  return new Date(
    Date.UTC(year, month - 1, day + graceDays, 23, 59, 59, 999) - KST_OFFSET_MS,
  );
}

function isPlanMatched(
  rule: GroupAccessRule,
  planType: string | null,
): boolean {
  if (rule.planTypes.length === 0) return true;
  // 플랜이 없는 챌린지 신청은 "전체 플랜" 규칙에만 맞는다.
  return planType !== null && rule.planTypes.includes(planType);
}

/**
 * 사용자의 신청 내역을 그룹 접근 규칙과 대조해, 지금 접근 가능하면 접근이 끝나는 시각을 돌려준다.
 * 맞는 규칙이 없거나 기간 밖이면 null.
 *
 * 접근 기간은 신청의 프로그램 시작일부터 종료일 + graceDays 일 23:59:59.999 KST 까지다.
 * 판정에는 규칙의 표시용 날짜가 아니라 서버가 내려준 신청의 날짜를 쓴다 — 프로그램 일정이
 * 바뀌어도 판정이 따라간다. 여럿이 맞으면 가장 늦은 종료 시각을 돌려준다(쿠키 수명 계산용).
 */
export function findGroupAccessEndsAt(
  applications: ProgramApplication[],
  rules: GroupAccessRule[],
  now: Date,
): Date | null {
  let latest: Date | null = null;

  for (const application of applications) {
    const startsAt = parseKstDateTime(application.startDate);
    if (now < startsAt) continue;

    for (const rule of rules) {
      if (
        rule.programType !== application.programType ||
        rule.programId !== application.programId ||
        !isPlanMatched(rule, application.planType)
      ) {
        continue;
      }

      const endsAt = endOfGraceKst(application.endDate, rule.graceDays);
      if (now > endsAt) continue;
      if (latest === null || endsAt > latest) latest = endsAt;
    }
  }

  return latest;
}
