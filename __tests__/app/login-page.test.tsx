/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';

const pushMock = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
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
jest.mock('@/lib/navigate', () => ({
  navigateTo: (...args: unknown[]) => navigateToMock(...args),
}));

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
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('기존 이름+전화번호 폼이 그대로 남아있다 (확정 사항 4 — 대체 아님)', () => {
    render(<LoginPage />);

    expect(screen.getByLabelText('이름')).toBeInTheDocument();
    expect(screen.getByLabelText('전화번호')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '확인' })).toBeInTheDocument();
  });

  it('"렛츠커리어로 로그인" 클릭 시 SSO 로그인 페이지로 redirect_uri와 함께 이동한다', () => {
    render(<LoginPage />);

    fireEvent.click(
      screen.getByRole('button', { name: '렛츠커리어로 로그인' }),
    );

    const expectedRedirectUri = `${window.location.origin}/auth/callback`;
    expect(navigateToMock).toHaveBeenCalledWith(
      `https://letscareer.co.kr/sso/login?redirect_uri=${encodeURIComponent(expectedRedirectUri)}&service_name=VOD`,
    );
  });

  it('SSO URL 환경변수가 없으면 이동하지 않고 안내 문구를 보여준다', async () => {
    delete process.env.NEXT_PUBLIC_LETSCAREER_SSO_URL;
    render(<LoginPage />);

    fireEvent.click(
      screen.getByRole('button', { name: '렛츠커리어로 로그인' }),
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
