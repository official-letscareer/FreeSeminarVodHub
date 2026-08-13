import { ReactNode } from 'react';

/**
 * VOD 서비스가 렛츠커리어 소속임을 알 수 있게 로고를 붙인 공통 헤더.
 * /vod, /vod/[id] 둘 다 구조가 같아 공유한다.
 */
export default function SiteHeader({
  left,
  right,
}: {
  left: ReactNode;
  right?: ReactNode;
}) {
  return (
    <header className="flex items-center justify-between gap-3 border-b bg-white px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <img src="/logo/logo-simple.svg" alt="렛츠커리어" className="h-5 w-5 shrink-0" />
        <div className="h-4 w-px shrink-0 bg-gray-200" />
        <div className="min-w-0">{left}</div>
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </header>
  );
}
