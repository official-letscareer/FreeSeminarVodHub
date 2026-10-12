'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { logUsage } from '@/lib/usageLog';

/** `/api/vod` 계열이 403 `VOD_PASS_INACTIVE` 로 내려주는 활성화 대상 정보(LC-3438). */
export interface InactivePassInfo {
  pass: {
    applicationId: number;
    durationDays: number;
    expectedEndDate: string;
  };
  /** 미활성 이용권 전체 개수 */
  inactiveCount: number;
}

/**
 * 403 응답이 "비활성 이용권" 사유이면 활성화 대상 정보를 돌려주고, 아니면 null 이다.
 * 목록 화면과 재생 화면이 같은 본문을 읽으므로 한 곳에 둔다.
 */
export async function readInactivePass(
  res: Response,
): Promise<InactivePassInfo | null> {
  if (res.status !== 403) return null;

  const body: unknown = await res.json().catch(() => null);
  if (typeof body !== 'object' || body === null) return null;

  const { code, pass, inactiveCount } = body as Record<string, unknown>;
  if (code !== 'VOD_PASS_INACTIVE') return null;
  if (typeof pass !== 'object' || pass === null) return null;

  const { applicationId, durationDays, expectedEndDate } = pass as Record<
    string,
    unknown
  >;
  if (
    typeof applicationId !== 'number' ||
    typeof durationDays !== 'number' ||
    typeof expectedEndDate !== 'string' ||
    typeof inactiveCount !== 'number'
  ) {
    return null;
  }

  return {
    pass: { applicationId, durationDays, expectedEndDate },
    inactiveCount,
  };
}

const FALLBACK_ERROR =
  '이용권을 활성화하지 못했습니다. 잠시 후 다시 시도해주세요.';

interface Props extends InactivePassInfo {
  /** 활성화가 끝났다. 호출한 화면이 모달을 닫고 목록·영상을 다시 조회한다. */
  onActivated: () => void;
  /** "나중에", Esc, 바깥 클릭. 활성화 요청이 진행 중일 때는 호출되지 않는다. */
  onLater: () => void;
}

/**
 * 비활성 VOD 이용권 활성화 안내(LC-3438).
 *
 * 열려 있는 동안만 렌더한다 — 닫는 것은 호출한 화면이 이 컴포넌트를 내리는 것으로 한다.
 * 활성화 대상은 서버가 정한다(가장 먼저 구매한 미활성 이용권). 여기서는 고르지 않는다.
 */
export default function VodPassActivationDialog({
  pass,
  inactiveCount,
  onActivated,
  onLater,
}: Props) {
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // 이 컴포넌트는 열려 있는 동안만 렌더되므로, 마운트가 곧 모달이 열린 순간이다.
  useEffect(() => {
    logUsage({ type: 'pass_prompt_shown' });
  }, []);

  async function handleActivate() {
    setPending(true);
    setErrorMessage('');

    try {
      const res = await fetch('/api/vod/pass/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId: pass.applicationId }),
      });

      if (res.ok) {
        logUsage({ type: 'pass_activated' });
        // 성공하면 호출한 화면이 이 모달을 내린다. 그 전까지 버튼은 잠가 둔다.
        onActivated();
        return;
      }

      logUsage({
        type: 'pass_activate_failed',
        detail: { status: res.status },
      });
      // 409(기간 충돌·환불 확인 중·취소됨)의 사유는 렛커 서버 메시지에 있다.
      const body: unknown = await res.json().catch(() => null);
      const message = (body as { message?: unknown } | null)?.message;
      setErrorMessage(
        typeof message === 'string' && message ? message : FALLBACK_ERROR,
      );
    } catch {
      // 응답을 받지 못한 실패(네트워크 오류)는 HTTP 상태가 없어 0 으로 남긴다.
      logUsage({ type: 'pass_activate_failed', detail: { status: 0 } });
      setErrorMessage(FALLBACK_ERROR);
    }
    setPending(false);
  }

  function handleOpenChange(open: boolean) {
    if (!open && !pending) onLater();
  }

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="leading-snug">
            현재 보유 중인 이용권이 있습니다. 사용하시겠습니까?
          </DialogTitle>
          <DialogDescription>
            {`이용 기간 ${pass.durationDays}일, 예상 종료일 ${pass.expectedEndDate}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 text-sm text-gray-600">
          <p>
            사용하기를 누르면 이용 기간이 바로 시작되며, 이후에는 환불할 수
            없습니다.
          </p>
          {inactiveCount > 1 && (
            <p>
              {`보유한 이용권 ${inactiveCount}개 중 가장 먼저 구매한 이용권부터 활성화됩니다`}
            </p>
          )}
          {errorMessage && (
            <p role="alert" className="text-red-500">
              {errorMessage}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={onLater}>
            나중에
          </Button>
          <Button disabled={pending} onClick={handleActivate}>
            {pending ? '활성화 중...' : '사용하기'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
