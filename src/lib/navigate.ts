/**
 * `window.location.href` 대입을 감싼다.
 *
 * jsdom(30)의 `window.location`/`location.href`는 스펙대로 non-configurable
 * accessor라 테스트에서 직접 가로챌 수 없다 — 이 함수로 감싸 mock 가능한 지점을
 * 만든다.
 */
export function navigateTo(url: string): void {
  window.location.href = url;
}

/**
 * 구글 OAuth 동의 창처럼 크기를 지정한 별도 창을 연다.
 *
 * `popup=yes`를 명시해야 브라우저가 새 탭이 아니라 독립된 창으로 띄운다 — width/height 만으로도
 * 대부분 창으로 열리지만 명시하는 쪽이 표준이다.
 *
 * 좌표를 `screen` 이 아니라 `screenX/screenY` + `outerWidth/outerHeight` 로 잡는 이유는
 * 듀얼 모니터 때문이다. `screen` 은 주 모니터 기준이라 오프너가 보조 모니터에 있으면
 * 팝업만 다른 모니터에 뜬다.
 *
 * 반환값이 null 이면 팝업이 차단된 것이다. 호출부는 전체 이동으로 폴백해야 한다.
 * 차단되지 않으려면 이 함수가 **사용자 클릭 핸들러 안에서 동기적으로** 불려야 한다 —
 * 앞에 await 을 끼우면 사용자 제스처가 소실돼 차단된다.
 */
export function openPopup(
  url: string,
  name: string,
  width: number,
  height: number,
): Window | null {
  const left = window.screenX + (window.outerWidth - width) / 2;
  const top = window.screenY + (window.outerHeight - height) / 2;
  return window.open(
    url,
    name,
    `popup=yes,width=${width},height=${height},left=${left},top=${top}`,
  );
}
