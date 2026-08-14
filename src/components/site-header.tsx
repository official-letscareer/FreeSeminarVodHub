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
    /*
      배경을 깔지 않는다. 흰 판에 아래쪽만 톤이 들어간 배경이면 헤더가 페이지 위에 얹힌
      별개의 조각처럼 읽힌다 — 배경 그러데이션이 헤더를 관통해 흐르게 두면 상단 전체가
      한 면으로 보인다. 같은 이유로 경계선도 두지 않는다. 아래 배너·목록이 이미 시작점을
      분명히 알려주므로 선을 그을 이유가 없다.
    */
    <header>
      {/* 헤더 바 자체는 화면 끝까지 채우되, 안쪽 내용은 본문과 같은 max-w-5xl 폭으로 맞춘다.
          목록·상세·배너까지 모든 화면이 같은 좌우 라인을 쓰므로 페이지를 넘겨도 기준선이
          흔들리지 않는다.

          로고·구분선·여백은 제목 크기에 맞춰 함께 키운다. 제목만 키우면 로고가 작아 보이고
          위아래가 눌린 느낌이 난다 — 헤더의 어색함은 대개 한 요소만 바뀌었을 때 생긴다. */}
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <img
            src="/logo/logo-simple.svg"
            alt="렛츠커리어"
            className="h-7 w-7 shrink-0"
          />
          <div className="h-6 w-px shrink-0 bg-gray-200" />
          <div className="min-w-0">{left}</div>
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
    </header>
  );
}
