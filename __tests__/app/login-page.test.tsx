/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';

const pushMock = jest.fn();
const replaceMock = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
}));

const verifyChallengeMock = jest.fn();
const setSessionMock = jest.fn();
jest.mock('@/lib/auth', () => ({
  verifyChallenge: (...args: unknown[]) => verifyChallengeMock(...args),
  setSession: (...args: unknown[]) => setSessionMock(...args),
}));

// window.location.href 대입은 jsdom 30에서 가로챌 수 없는 non-configurable
// accessor라, 그 대입을 감싸는 navigateTo만 mock한다(src/lib/navigate.ts 참고).
const navigateToMock = jest.fn();
const openPopupMock = jest.fn();
jest.mock('@/lib/navigate', () => ({
  navigateTo: (...args: unknown[]) => navigateToMock(...args),
  openPopup: (...args: unknown[]) => openPopupMock(...args),
}));

/** 열린 팝업 창 흉내. closed 를 직접 뒤집어 닫힘 감지를 시험할 수 있다. */
function fakePopup() {
  return { closed: false, close: jest.fn() } as unknown as Window;
}

/**
 * MessageEvent 의 source 는 getter 전용이고, jsdom 은 생성자 init 에 진짜 Window 만 받는다.
 * 가짜 팝업 객체를 source 로 넣기 위해 defineProperty 로 덮는다.
 */
function dispatchSsoMessage(
  source: Window,
  origin: string,
  data: { type: string; ok: boolean },
) {
  const event = new MessageEvent('message', { data, origin });
  Object.defineProperty(event, 'source', { value: source });
  fireEvent(window, event);
}

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: width,
  });
}

function openNamePhoneForm() {
  fireEvent.click(
    screen.getByRole('button', { name: '이름·전화번호로 로그인하기' }),
  );
}

import LoginPage from '@/app/login/page';

describe('LoginPage — SSO 버튼 (LC-3208)', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...ORIGINAL_ENV,
      NEXT_PUBLIC_LETSCAREER_SSO_URL: 'https://letscareer.co.kr',
    };
    window.history.pushState({}, '', '/login');
    setViewportWidth(1280);
    openPopupMock.mockReturnValue(fakePopup());
    // 기본값: 로그인되지 않은 상태(/api/vod 가 401)
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false }) as unknown as typeof fetch;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('처음에는 렛츠커리어 로그인만 보이고 이름+전화번호 폼은 접혀 있다 (LC-3515)', () => {
    render(<LoginPage />);

    expect(
      screen.getByRole('button', { name: '렛츠커리어로 로그인하기' }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('이름')).toBeNull();
    expect(screen.queryByRole('button', { name: '확인' })).toBeNull();
  });

  it('"이름·전화번호로 로그인하기"를 누르면 폼이 열리고 렛츠커리어 로그인은 그대로 보인다 (확정 사항 4 — 대체 아님)', () => {
    render(<LoginPage />);

    openNamePhoneForm();

    expect(screen.getByLabelText('이름')).toBeInTheDocument();
    expect(screen.getByLabelText('전화번호')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '확인' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '렛츠커리어로 로그인하기' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '이름·전화번호로 로그인하기' }),
    ).toBeNull();
  });

  it('"렛츠커리어로 로그인하기" 클릭 시 팝업 창으로 SSO 로그인 페이지를 연다', () => {
    render(<LoginPage />);

    fireEvent.click(
      screen.getByRole('button', { name: '렛츠커리어로 로그인하기' }),
    );

    const expectedRedirectUri = `${window.location.origin}/auth/callback/popup`;
    expect(openPopupMock).toHaveBeenCalledWith(
      `https://letscareer.co.kr/sso/login?redirect_uri=${encodeURIComponent(expectedRedirectUri)}&service_name=VOD`,
      'letscareer-sso',
      500,
      650,
    );
    // 팝업으로 열었으면 탭 전체를 이동시키지 않는다.
    expect(navigateToMock).not.toHaveBeenCalled();
  });

  it('팝업이 차단되면 기존 전체 이동으로 폴백한다 — 콜백도 팝업용이 아닌 경로를 쓴다', () => {
    openPopupMock.mockReturnValue(null);
    render(<LoginPage />);

    fireEvent.click(
      screen.getByRole('button', { name: '렛츠커리어로 로그인하기' }),
    );

    const expectedRedirectUri = `${window.location.origin}/auth/callback`;
    expect(navigateToMock).toHaveBeenCalledWith(
      `https://letscareer.co.kr/sso/login?redirect_uri=${encodeURIComponent(expectedRedirectUri)}&service_name=VOD`,
    );
  });

  it('모바일 폭에서는 팝업을 열지 않고 전체 이동한다', () => {
    setViewportWidth(500);
    render(<LoginPage />);

    fireEvent.click(
      screen.getByRole('button', { name: '렛츠커리어로 로그인하기' }),
    );

    expect(openPopupMock).not.toHaveBeenCalled();
    expect(navigateToMock).toHaveBeenCalledWith(
      expect.stringContaining(encodeURIComponent('/auth/callback')),
    );
  });

  it('팝업이 보낸 성공 메시지를 받으면 /vod 로 이동한다', () => {
    const popup = fakePopup();
    openPopupMock.mockReturnValue(popup);
    render(<LoginPage />);

    fireEvent.click(
      screen.getByRole('button', { name: '렛츠커리어로 로그인하기' }),
    );

    dispatchSsoMessage(popup, window.location.origin, {
      type: 'letscareer-sso:result',
      ok: true,
    });

    expect(replaceMock).toHaveBeenCalledWith('/vod');
  });

  it('로그인하지 않고 팝업만 닫으면 /vod 로 보내지 않는다', async () => {
    const popup = fakePopup();
    openPopupMock.mockReturnValue(popup);
    render(<LoginPage />);

    fireEvent.click(
      screen.getByRole('button', { name: '렛츠커리어로 로그인하기' }),
    );
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith('/api/vod', expect.anything()),
    );

    // 로그인하지 않은 채 사용자가 창을 닫는다.
    // 감시 인터벌은 500ms 다. 실제로 두 주기를 흘려보낸 뒤 확인한다.
    (popup as unknown as { closed: boolean }).closed = true;
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1200));
    });

    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('이미 로그인돼 있던 상태에서 팝업만 닫아도 /vod 로 보내지 않는다', async () => {
    // 예전 로그인 쿠키가 남아 있어 열기 전부터 인가된 상태다. 이 팝업이 한 일이 없으므로
    // 이동하면 "취소했는데 로그인됨"으로 보인다.
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true }) as unknown as typeof fetch;
    const popup = fakePopup();
    openPopupMock.mockReturnValue(popup);
    render(<LoginPage />);

    fireEvent.click(
      screen.getByRole('button', { name: '렛츠커리어로 로그인하기' }),
    );
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    // 감시 인터벌은 500ms 다. 실제로 두 주기를 흘려보낸 뒤 확인한다.
    (popup as unknown as { closed: boolean }).closed = true;
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1200));
    });

    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('403 은 로그인된 것으로 보지 않아 팝업을 닫아도 이동하지 않는다 (활성화 단계가 없다)', async () => {
    let loggedIn = false;
    global.fetch = jest.fn().mockImplementation(async () => {
      if (!loggedIn) return { ok: false, status: 401, json: async () => ({}) };
      return { ok: false, status: 403, json: async () => ({ code: 'OTHER' }) };
    }) as unknown as typeof fetch;
    const popup = fakePopup();
    openPopupMock.mockReturnValue(popup);
    render(<LoginPage />);

    fireEvent.click(
      screen.getByRole('button', { name: '렛츠커리어로 로그인하기' }),
    );
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    await act(async () => {
      await Promise.resolve();
    });
    loggedIn = true;

    (popup as unknown as { closed: boolean }).closed = true;
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1200));
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('이름+전화번호 확인이 실패하면 고정 안내 문구를 보여준다', async () => {
    verifyChallengeMock.mockResolvedValue(false);
    render(<LoginPage />);
    openNamePhoneForm();

    fireEvent.change(screen.getByLabelText('이름'), {
      target: { value: '홍길동' },
    });
    fireEvent.change(screen.getByLabelText('전화번호'), {
      target: { value: '01012345678' },
    });
    fireEvent.click(screen.getByRole('button', { name: '확인' }));

    expect(
      await screen.findByText(
        '현재 참여 중인 챌린지가 없습니다. 이용권을 보유하셨다면 렛츠커리어 로그인으로 확인해주세요.',
      ),
    ).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
    expect(setSessionMock).not.toHaveBeenCalled();
  });

  it('이름+전화번호 확인에 성공하면 /vod 로 이동한다', async () => {
    verifyChallengeMock.mockResolvedValue(true);
    render(<LoginPage />);
    openNamePhoneForm();

    fireEvent.change(screen.getByLabelText('이름'), {
      target: { value: '홍길동' },
    });
    fireEvent.change(screen.getByLabelText('전화번호'), {
      target: { value: '01012345678' },
    });
    fireEvent.click(screen.getByRole('button', { name: '확인' }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/vod'));
    expect(setSessionMock).toHaveBeenCalled();
  });

  it('다른 오리진에서 온 메시지는 무시한다', () => {
    const popup = fakePopup();
    openPopupMock.mockReturnValue(popup);
    render(<LoginPage />);

    fireEvent.click(
      screen.getByRole('button', { name: '렛츠커리어로 로그인하기' }),
    );

    dispatchSsoMessage(popup, 'https://evil.example.com', {
      type: 'letscareer-sso:result',
      ok: true,
    });

    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('SSO URL 환경변수가 없으면 이동하지 않고 안내 문구를 보여준다', async () => {
    delete process.env.NEXT_PUBLIC_LETSCAREER_SSO_URL;
    render(<LoginPage />);

    fireEvent.click(
      screen.getByRole('button', { name: '렛츠커리어로 로그인하기' }),
    );

    expect(
      await screen.findByText('SSO 로그인이 아직 설정되지 않았습니다.'),
    ).toBeInTheDocument();
    expect(navigateToMock).not.toHaveBeenCalled();
  });

  it('?error=sso_failed 로 진입하면 실패 안내를 보여준다', async () => {
    window.history.pushState({}, '', '/login?error=sso_failed');
    render(<LoginPage />);

    expect(
      await screen.findByText(
        '렛츠커리어 로그인에 실패했습니다. 다시 시도해주세요.',
      ),
    ).toBeInTheDocument();
  });
});
