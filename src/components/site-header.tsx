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
    <header className="border-b bg-white">
      {/* 헤더 바 자체는 화면 끝까지 채우되, 안쪽 내용은 배너·본문과 같은
          max-w-5xl 폭으로 맞춰서 페이지 아래로 내려가도 좌우 라인이 일치하게 한다. */}
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <img
            src="/logo/logo-simple.svg"
            alt="렛츠커리어"
            className="h-5 w-5 shrink-0"
          />
          <div className="h-4 w-px shrink-0 bg-gray-200" />
          <div className="min-w-0">{left}</div>
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
    </header>
  );
}
