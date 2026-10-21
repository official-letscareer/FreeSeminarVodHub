import { findGroupAccessEndsAt } from '@/lib/groupAccess';
import type { GroupAccessRule, ProgramApplication } from '@/lib/types';

function rule(overrides: Partial<GroupAccessRule> = {}): GroupAccessRule {
  return {
    id: 1,
    programType: 'CHALLENGE',
    programId: 42,
    programTitle: '10월 챌린지',
    programStartDate: '2026-10-20T01:00:00+00:00',
    programEndDate: '2026-11-20T13:00:00+00:00',
    planTypes: [],
    graceDays: 3,
    memo: null,
    createdAt: '2026-10-01T00:00:00+00:00',
    ...overrides,
  };
}

function application(
  overrides: Partial<ProgramApplication> = {},
): ProgramApplication {
  return {
    programType: 'CHALLENGE',
    programId: 42,
    planType: 'BASIC',
    startDate: '2026-10-20T10:00:00',
    endDate: '2026-11-20T22:00:00',
    ...overrides,
  };
}

// 2026-11-23 23:59:59.999 KST = 2026-11-23T14:59:59.999Z (종료일 11-20 + 3일)
const GRACE_END = new Date('2026-11-23T14:59:59.999Z');
const DURING = new Date('2026-11-01T00:00:00Z');

describe('findGroupAccessEndsAt', () => {
  it('플랜이 규칙에 들어 있으면 종료일 + N일 23:59:59.999 KST 를 돌려준다', () => {
    const result = findGroupAccessEndsAt(
      [application({ planType: 'BASIC' })],
      [rule({ planTypes: ['BASIC', 'PREMIUM'] })],
      DURING,
    );
    expect(result).toEqual(GRACE_END);
  });

  it('규칙의 표시용 날짜가 null(번호로 직접 등록)이어도 신청의 날짜로 판정한다', () => {
    const manual = rule({ programStartDate: null, programEndDate: null });
    expect(findGroupAccessEndsAt([application()], [manual], DURING)).toEqual(
      GRACE_END,
    );
    expect(
      findGroupAccessEndsAt(
        [application()],
        [manual],
        new Date(GRACE_END.getTime() + 1),
      ),
    ).toBeNull();
  });

  it('플랜이 규칙에 없으면 null', () => {
    const result = findGroupAccessEndsAt(
      [application({ planType: 'LIGHT' })],
      [rule({ planTypes: ['BASIC', 'PREMIUM'] })],
      DURING,
    );
    expect(result).toBeNull();
  });

  it('규칙 플랜이 비어 있으면 모든 플랜이 맞는다', () => {
    const result = findGroupAccessEndsAt(
      [application({ planType: 'LIGHT' })],
      [rule({ planTypes: [] })],
      DURING,
    );
    expect(result).toEqual(GRACE_END);
  });

  it('플랜이 없는 챌린지 신청은 전체 플랜 규칙에만 맞는다', () => {
    const apps = [application({ planType: null })];
    expect(
      findGroupAccessEndsAt(apps, [rule({ planTypes: [] })], DURING),
    ).toEqual(GRACE_END);
    expect(
      findGroupAccessEndsAt(apps, [rule({ planTypes: ['BASIC'] })], DURING),
    ).toBeNull();
  });

  it('종료일 + N일 23:59:59.999 KST 직전까지는 통과, 직후는 null', () => {
    const apps = [application()];
    const rules = [rule()];
    expect(findGroupAccessEndsAt(apps, rules, GRACE_END)).toEqual(GRACE_END);
    expect(
      findGroupAccessEndsAt(apps, rules, new Date(GRACE_END.getTime() + 1)),
    ).toBeNull();
  });

  it('시작 전이면 null, 시작 시각(KST)부터 통과', () => {
    const apps = [application({ startDate: '2026-10-20T10:00:00' })];
    const rules = [rule()];
    // 2026-10-20 10:00 KST = 01:00Z
    expect(
      findGroupAccessEndsAt(apps, rules, new Date('2026-10-20T00:59:59.999Z')),
    ).toBeNull();
    expect(
      findGroupAccessEndsAt(apps, rules, new Date('2026-10-20T01:00:00Z')),
    ).toEqual(GRACE_END);
  });

  it('프로그램 ID 나 종류가 다르면 null', () => {
    expect(
      findGroupAccessEndsAt([application({ programId: 43 })], [rule()], DURING),
    ).toBeNull();
    expect(
      findGroupAccessEndsAt(
        [application({ programType: 'LIVE', planType: null })],
        [rule()],
        DURING,
      ),
    ).toBeNull();
  });

  it('N=0 이면 종료일 당일 23:59:59.999 KST 까지', () => {
    const apps = [application()];
    const rules = [rule({ graceDays: 0 })];
    const endOfDay = new Date('2026-11-20T14:59:59.999Z');
    expect(findGroupAccessEndsAt(apps, rules, endOfDay)).toEqual(endOfDay);
    expect(
      findGroupAccessEndsAt(apps, rules, new Date(endOfDay.getTime() + 1)),
    ).toBeNull();
  });

  it('규칙이 여러 건 맞으면 가장 늦은 종료 시각', () => {
    const result = findGroupAccessEndsAt(
      [application()],
      [rule({ id: 1, graceDays: 3 }), rule({ id: 2, graceDays: 10 })],
      DURING,
    );
    expect(result).toEqual(new Date('2026-11-30T14:59:59.999Z'));
  });

  it('LIVE 신청은 같은 LIVE 규칙에 맞는다', () => {
    const result = findGroupAccessEndsAt(
      [
        application({
          programType: 'LIVE',
          programId: 7,
          planType: null,
          startDate: '2026-10-25T19:00:00',
          endDate: '2026-10-25T21:00:00',
        }),
      ],
      [rule({ programType: 'LIVE', programId: 7, graceDays: 30 })],
      new Date('2026-11-10T00:00:00Z'),
    );
    expect(result).toEqual(new Date('2026-11-24T14:59:59.999Z'));
  });

  it('신청이나 규칙이 없으면 null', () => {
    expect(findGroupAccessEndsAt([], [rule()], DURING)).toBeNull();
    expect(findGroupAccessEndsAt([application()], [], DURING)).toBeNull();
  });
});
