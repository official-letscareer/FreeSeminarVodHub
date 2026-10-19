'use client';

/**
 * 어느 화면에서 어떤 클릭으로 이 화면에 왔는지 기록하기 위한 브라우저 전용 도우미(LC-3438).
 *
 * `page_view` 의 `detail` 에 다음 값을 싣는다.
 *   from  직전에 본 화면의 경로. 직접 진입이거나 외부에서 왔으면 빈 문자열
 *   via   이동 직전에 누른 링크·버튼의 글자(80자까지). 클릭 없이 왔으면 없다
 *   ref   이 탭에서 처음 연 화면일 때, 다른 사이트에서 왔다면 그 도메인
 *
 * 이름·전화번호·주소 쿼리 같은 식별 정보는 싣지 않는다. 글자는 화면에 보이던 것 그대로다.
 * 이 파일의 공개 함수는 예외를 던지지 않는다.
 */

const CLICK_STORAGE_KEY = 'vod_nav_click';
const LAST_STORAGE_KEY = 'vod_nav_last';
const CLICK_MAX_AGE_MS = 10_000;
const LABEL_MAX = 80;

interface ClickRecord {
  label: string;
  at: number;
}

interface LastPage {
  path: string;
  from: string;
  via: string | null;
  ref: string | null;
}

export interface NavigationContext {
  from: string;
  via?: string;
  ref?: string;
}

let installed = false;

function clean(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

/** 클릭한 요소에서 사람이 읽을 수 있는 이름을 뽑는다. */
export function labelOf(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest('a, button, [role="button"], [data-track]');
  if (!el) return null;

  const label =
    clean(el.getAttribute('data-track')) ||
    clean(el.getAttribute('aria-label')) ||
    clean(el.getAttribute('title')) ||
    clean(el.textContent) ||
    clean(el.querySelector('img')?.getAttribute('alt'));
  return label ? label.slice(0, LABEL_MAX) : null;
}

function writeJson(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장소를 쓸 수 없으면 이동 경로만 비게 된다.
  }
}

function readJson<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** 클릭 기록을 시작한다. 여러 번 불러도 한 번만 붙는다. */
export function installClickTracker(): void {
  try {
    if (installed || typeof document === 'undefined') return;
    installed = true;
    document.addEventListener(
      'click',
      (event) => {
        const label = labelOf(event.target);
        if (label) writeJson(CLICK_STORAGE_KEY, { label, at: Date.now() });
      },
      true,
    );
  } catch {
    // 로그는 부가 기능이다.
  }
}

function externalReferrerHost(): string | null {
  try {
    if (!document.referrer) return null;
    const url = new URL(document.referrer);
    return url.origin === window.location.origin ? null : url.hostname;
  } catch {
    return null;
  }
}

/**
 * 지금 연 화면의 이동 정보를 만든다. 화면을 열 때 한 번 부른다.
 *
 * 같은 경로를 다시 부르면(React 개발 모드의 이중 실행, 새로고침) 처음 만든 값을 그대로 돌려준다.
 */
export function readNavigationContext(pathname: string): NavigationContext {
  try {
    const last = readJson<LastPage>(LAST_STORAGE_KEY);
    if (last && last.path === pathname) {
      return toContext(last);
    }

    const click = readJson<ClickRecord>(CLICK_STORAGE_KEY);
    const via =
      click && Date.now() - click.at <= CLICK_MAX_AGE_MS ? click.label : null;
    try {
      sessionStorage.removeItem(CLICK_STORAGE_KEY);
    } catch {
      // 무시한다.
    }

    const page: LastPage = {
      path: pathname,
      from: last?.path ?? '',
      via,
      ref: last ? null : externalReferrerHost(),
    };
    writeJson(LAST_STORAGE_KEY, page);
    return toContext(page);
  } catch {
    return { from: '' };
  }
}

function toContext(page: LastPage): NavigationContext {
  const context: NavigationContext = { from: page.from };
  if (page.via) context.via = page.via;
  if (page.ref) context.ref = page.ref;
  return context;
}
