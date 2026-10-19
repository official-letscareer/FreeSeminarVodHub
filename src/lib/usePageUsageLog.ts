'use client';

import { useEffect } from 'react';
import { flushUsageLog, logUsage } from './usageLog';
import { installClickTracker, readNavigationContext } from './usageNavigation';

interface Options {
  enabled: boolean;
  vodId?: number;
}

/**
 * 페이지 열람(`page_view`)과 이탈(`page_leave`, `detail.dwell_sec`)을 기록한다(LC-3438).
 *
 * `page_view` 의 `detail` 에는 이동 경로(`from`, `via`, `ref`)가 들어간다(`usageNavigation.ts`).
 *
 * 이탈은 언마운트와 pagehide 둘 다에서 일어날 수 있다. 같은 페이지에서 한 번만 보낸다.
 * 이탈 경로는 마운트 때 잡아 둔다 — 언마운트 시점에는 주소가 이미 다음 페이지일 수 있다.
 */
export function usePageUsageLog({ enabled, vodId }: Options): void {
  useEffect(() => {
    if (!enabled) return;

    const pagePath = window.location.pathname;
    const startedAt = Date.now();
    let left = false;

    // 어디서 어떤 클릭으로 왔는지 함께 남긴다. 어드민 이용 로그의 이동 경로 트리가 이 값을 쓴다.
    installClickTracker();
    const detail = { ...readNavigationContext(pagePath) };
    logUsage({ type: 'page_view', vodId, pagePath, detail });

    function leave() {
      if (left) return;
      left = true;
      logUsage({
        type: 'page_leave',
        vodId,
        pagePath,
        detail: { dwell_sec: Math.round((Date.now() - startedAt) / 1000) },
      });
    }

    // 큐의 pagehide 리스너보다 늦게 등록되더라도 이탈 이벤트가 같이 나가도록 직접 비운다.
    function handlePageHide() {
      leave();
      void flushUsageLog({ beacon: true });
    }

    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      leave();
    };
  }, [enabled, vodId]);
}
