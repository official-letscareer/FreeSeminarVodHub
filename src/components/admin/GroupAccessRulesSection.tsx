'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { GroupAccessProgramType, GroupAccessRule } from '@/lib/types';

const RULES_API = '/api/admin/group-access-rules';
const CHALLENGE_PLAN_TYPES = ['LIGHT', 'BASIC', 'STANDARD', 'PREMIUM'];
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const SELECT_CLASS =
  'rounded-md border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900';

/** 프로그램 목록 API 응답 한 건. 날짜는 서버가 준 오프셋 없는 KST 문자열 그대로다. */
interface ProgramOption {
  programId: number;
  programType: GroupAccessProgramType;
  title: string;
  startDate: string;
  endDate: string;
  planTypes: string[];
}

class UnauthorizedError extends Error {}

async function requestJson<T>(
  input: string,
  init: RequestInit | undefined,
  fallbackMessage: string,
): Promise<T> {
  const res = await fetch(input, init);
  if (res.status === 401) throw new UnauthorizedError();
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message || fallbackMessage);
  return data as T;
}

// 규칙의 날짜는 timestamptz(UTC 표기)로 돌아온다. KST 날짜로 바꿔 plusDays 일을 더한다.
function formatKstDate(iso: string, plusDays = 0): string {
  return new Date(new Date(iso).getTime() + KST_OFFSET_MS + plusDays * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

function formatPlans(planTypes: string[]): string {
  return planTypes.length === 0 ? '전체' : planTypes.join(', ');
}

function togglePlan(plans: string[], plan: string): string[] {
  return plans.includes(plan)
    ? plans.filter((p) => p !== plan)
    : [...plans, plan];
}

function PlanCheckboxes({
  options,
  selected,
  onToggle,
  disabled,
}: {
  options: string[];
  selected: string[];
  onToggle: (plan: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {options.map((plan) => (
        <label
          key={plan}
          className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer"
        >
          <input
            type="checkbox"
            checked={selected.includes(plan)}
            onChange={() => onToggle(plan)}
            disabled={disabled}
            className="rounded"
          />
          {plan}
        </label>
      ))}
    </div>
  );
}

export default function GroupAccessRulesSection() {
  // ─── 규칙 목록 ─────────────────────────────────────────────────
  const [rules, setRules] = useState<GroupAccessRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [error, setError] = useState('');
  const [unauthorized, setUnauthorized] = useState(false);

  // ─── 등록 폼 ───────────────────────────────────────────────────
  const [programType, setProgramType] =
    useState<GroupAccessProgramType>('CHALLENGE');
  // 어느 종류의 목록인지 함께 들고 있어, 종류를 바꾸면 응답이 오기 전까지 로딩으로 본다.
  const [programList, setProgramList] = useState<{
    type: GroupAccessProgramType;
    programs: ProgramOption[];
  } | null>(null);
  const [programId, setProgramId] = useState<number | null>(null);
  const [planTypes, setPlanTypes] = useState<string[]>([]);
  const [graceDays, setGraceDays] = useState('0');
  const [memo, setMemo] = useState('');
  const [addLoading, setAddLoading] = useState(false);

  // ─── 수정·삭제 ─────────────────────────────────────────────────
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editPlanTypes, setEditPlanTypes] = useState<string[]>([]);
  const [editGraceDays, setEditGraceDays] = useState('');
  const [editMemo, setEditMemo] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<GroupAccessRule | null>(
    null,
  );

  const handleError = useCallback((err: unknown, fallback: string) => {
    if (err instanceof UnauthorizedError) setUnauthorized(true);
    else setError(err instanceof Error ? err.message : fallback);
  }, []);

  const fetchRules = useCallback(async () => {
    try {
      setRules(
        await requestJson<GroupAccessRule[]>(
          RULES_API,
          undefined,
          '규칙 목록을 불러오지 못했습니다.',
        ),
      );
    } catch (err) {
      handleError(err, '규칙 목록을 불러오지 못했습니다.');
    } finally {
      setRulesLoading(false);
    }
  }, [handleError]);

  // 규칙 목록과 프로그램 목록은 서로 기다리지 않는다. 첫 렌더에서 두 effect 가 함께 요청한다.
  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  useEffect(() => {
    let cancelled = false;
    requestJson<ProgramOption[]>(
      `${RULES_API}/programs?type=${programType}`,
      undefined,
      '프로그램 목록을 불러오지 못했습니다.',
    )
      .then((programs) => {
        if (!cancelled) setProgramList({ type: programType, programs });
      })
      .catch((err) => {
        if (cancelled) return;
        setProgramList({ type: programType, programs: [] });
        handleError(err, '프로그램 목록을 불러오지 못했습니다.');
      });
    return () => {
      cancelled = true;
    };
  }, [programType, handleError]);

  const programsLoading = programList?.type !== programType;
  const programs = programsLoading ? [] : programList.programs;
  const selectedProgram = programs.find((p) => p.programId === programId);

  function handleChangeProgramType(type: GroupAccessProgramType) {
    setProgramType(type);
    setProgramId(null);
    setPlanTypes([]);
  }

  function handleChangeProgram(value: string) {
    setProgramId(value ? Number(value) : null);
    setPlanTypes([]);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedProgram) {
      setError('프로그램을 선택해주세요.');
      return;
    }
    setError('');
    setAddLoading(true);
    try {
      await requestJson(
        RULES_API,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            programType,
            programId: selectedProgram.programId,
            programTitle: selectedProgram.title,
            programStartDate: selectedProgram.startDate,
            programEndDate: selectedProgram.endDate,
            planTypes: programType === 'CHALLENGE' ? planTypes : [],
            graceDays: Number(graceDays),
            memo,
          }),
        },
        '규칙 등록에 실패했습니다.',
      );
      setProgramId(null);
      setPlanTypes([]);
      setGraceDays('0');
      setMemo('');
      await fetchRules();
    } catch (err) {
      handleError(err, '규칙 등록에 실패했습니다.');
    } finally {
      setAddLoading(false);
    }
  }

  function startEdit(rule: GroupAccessRule) {
    setEditingId(rule.id);
    setEditPlanTypes(rule.planTypes);
    setEditGraceDays(String(rule.graceDays));
    setEditMemo(rule.memo ?? '');
  }

  async function handleSave(id: number) {
    setError('');
    try {
      await requestJson(
        RULES_API,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id,
            planTypes: editPlanTypes,
            graceDays: Number(editGraceDays),
            memo: editMemo,
          }),
        },
        '저장에 실패했습니다.',
      );
      setEditingId(null);
      await fetchRules();
    } catch (err) {
      handleError(err, '저장에 실패했습니다.');
    }
  }

  async function handleDelete(id: number) {
    setError('');
    try {
      await requestJson(
        `${RULES_API}?id=${id}`,
        { method: 'DELETE' },
        '삭제에 실패했습니다.',
      );
      setDeleteTarget(null);
      await fetchRules();
    } catch (err) {
      setDeleteTarget(null);
      handleError(err, '삭제에 실패했습니다.');
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">그룹 접근 규칙</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">
            선택한 프로그램(플랜)을 신청한 사람 전체에게 프로그램 시작일부터
            종료일 + N일까지 VOD 접근을 엽니다.
          </p>

          {/* 등록 폼 */}
          <form onSubmit={handleAdd} className="space-y-3">
            <div className="flex gap-3 items-center flex-wrap">
              <label className="text-sm text-gray-600" htmlFor="gar-type">
                종류
              </label>
              <select
                id="gar-type"
                value={programType}
                onChange={(e) =>
                  handleChangeProgramType(
                    e.target.value as GroupAccessProgramType,
                  )
                }
                disabled={addLoading}
                className={SELECT_CLASS}
              >
                <option value="CHALLENGE">챌린지</option>
                <option value="LIVE">라이브</option>
              </select>
              <label className="text-sm text-gray-600" htmlFor="gar-program">
                프로그램
              </label>
              <select
                id="gar-program"
                value={programId ?? ''}
                onChange={(e) => handleChangeProgram(e.target.value)}
                disabled={addLoading || programsLoading}
                className={`${SELECT_CLASS} min-w-0 flex-1`}
              >
                <option value="">
                  {programsLoading
                    ? '불러오는 중...'
                    : programs.length === 0
                      ? '진행 예정·진행 중인 프로그램이 없습니다'
                      : '프로그램 선택'}
                </option>
                {programs.map((program) => (
                  <option key={program.programId} value={program.programId}>
                    {program.title} ({program.startDate.slice(0, 10)} ~{' '}
                    {program.endDate.slice(0, 10)})
                  </option>
                ))}
              </select>
            </div>

            {programType === 'CHALLENGE' && selectedProgram ? (
              <div className="space-y-1">
                <p className="text-sm text-gray-600">
                  플랜 (선택하지 않으면 전체)
                </p>
                <PlanCheckboxes
                  options={selectedProgram.planTypes}
                  selected={planTypes}
                  onToggle={(plan) =>
                    setPlanTypes((prev) => togglePlan(prev, plan))
                  }
                  disabled={addLoading}
                />
              </div>
            ) : null}

            <div className="flex gap-2 items-center">
              <label
                className="text-sm text-gray-600 shrink-0"
                htmlFor="gar-grace"
              >
                종료 후 열람 일수
              </label>
              <Input
                id="gar-grace"
                type="number"
                min={0}
                max={365}
                value={graceDays}
                onChange={(e) => setGraceDays(e.target.value)}
                disabled={addLoading}
                required
                className="w-24"
              />
              <Input
                placeholder="메모"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                disabled={addLoading}
                className="flex-1"
              />
              <Button
                type="submit"
                disabled={addLoading || !selectedProgram}
                className="shrink-0"
              >
                {addLoading ? '등록 중...' : '등록'}
              </Button>
            </div>
          </form>

          {unauthorized ? (
            <Alert variant="destructive">
              <AlertDescription>
                관리자 로그인이 만료되었습니다.{' '}
                <Link href="/admin" className="underline">
                  다시 로그인
                </Link>
                해주세요.
              </AlertDescription>
            </Alert>
          ) : null}

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {/* 규칙 목록 */}
          {rulesLoading ? (
            <p className="text-sm text-gray-500">불러오는 중...</p>
          ) : rules.length === 0 ? (
            <p className="text-sm text-gray-500">등록된 규칙이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="p-2 text-left font-medium text-gray-600">
                      프로그램
                    </th>
                    <th className="p-2 text-left font-medium text-gray-600">
                      플랜
                    </th>
                    <th className="p-2 text-left font-medium text-gray-600">
                      접근 기간
                    </th>
                    <th className="p-2 text-left font-medium text-gray-600">
                      메모
                    </th>
                    <th className="w-28 p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((rule) => {
                    const editing = editingId === rule.id;
                    // 수정 중에는 입력 중인 N 으로 접근 종료일을 바로 보여준다.
                    const graceForDisplay = editing
                      ? Number(editGraceDays) || 0
                      : rule.graceDays;
                    return (
                      <tr
                        key={rule.id}
                        className="border-b border-gray-100 hover:bg-gray-50 transition-colors align-top"
                      >
                        <td className="p-2">
                          <p className="font-medium">{rule.programTitle}</p>
                          <p className="text-xs text-gray-400">
                            {rule.programType === 'CHALLENGE'
                              ? '챌린지'
                              : '라이브'}
                          </p>
                        </td>
                        <td className="p-2 text-gray-600">
                          {editing && rule.programType === 'CHALLENGE' ? (
                            <PlanCheckboxes
                              options={CHALLENGE_PLAN_TYPES}
                              selected={editPlanTypes}
                              onToggle={(plan) =>
                                setEditPlanTypes((prev) =>
                                  togglePlan(prev, plan),
                                )
                              }
                            />
                          ) : (
                            formatPlans(rule.planTypes)
                          )}
                        </td>
                        <td className="p-2 text-gray-600 whitespace-nowrap">
                          {formatKstDate(rule.programStartDate)} ~{' '}
                          {formatKstDate(rule.programEndDate, graceForDisplay)}
                          {editing ? (
                            <Input
                              aria-label="종료 후 열람 일수"
                              type="number"
                              min={0}
                              max={365}
                              value={editGraceDays}
                              onChange={(e) => setEditGraceDays(e.target.value)}
                              className="mt-1 h-8 w-24"
                            />
                          ) : (
                            <p className="text-xs text-gray-400">
                              종료 후 {rule.graceDays}일
                            </p>
                          )}
                        </td>
                        <td className="p-2 text-gray-600">
                          {editing ? (
                            <Input
                              aria-label="메모"
                              value={editMemo}
                              onChange={(e) => setEditMemo(e.target.value)}
                              className="h-8"
                            />
                          ) : (
                            (rule.memo ?? '')
                          )}
                        </td>
                        <td className="p-2">
                          {editing ? (
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                className="h-7 px-2"
                                onClick={() => handleSave(rule.id)}
                              >
                                저장
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2"
                                onClick={() => setEditingId(null)}
                              >
                                취소
                              </Button>
                            </div>
                          ) : (
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2"
                                onClick={() => startEdit(rule)}
                              >
                                수정
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeleteTarget(rule)}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50 h-7 px-2"
                              >
                                삭제
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 규칙 삭제 확인 다이얼로그 */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>그룹 접근 규칙 삭제</DialogTitle>
            <DialogDescription>
              &quot;{deleteTarget?.programTitle}&quot; 규칙을 삭제하시겠습니까?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              취소
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && handleDelete(deleteTarget.id)}
            >
              삭제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
