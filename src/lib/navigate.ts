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
