/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';

// window.location.href 대입은 jsdom 30에서 가로챌 수 없는 non-configurable
// accessor라, 그 대입을 감싸는 navigateTo만 mock한다(src/lib/navigate.ts 참고).
const navigateToMock = jest.fn();
jest.mock('@/lib/navigate', () => ({
  navigateTo: (...args: unknown[]) => navigateToMock(...args),
}));

import MembershipLoginPage from '@/app/membership/page';

describe('MembershipLoginPage — VOD 로그인 진입점 (LC-3208)', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...ORIGINAL_ENV,
      NEXT_PUBLIC_LETSCAREER_SSO_URL: 'https://letscareer.co.kr',
    };
    window.history.pushState({}, '', '/membership');
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('이름+전화번호 폼 없이 "VOD 로그인" 버튼만 보여준다', () => {
    render(<MembershipLoginPage />);

    expect(
      screen.getByRole('button', { name: 'VOD 로그인' }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('이름')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('전화번호')).not.toBeInTheDocument();
  });

  it('"VOD 로그인" 클릭 시 SSO 로그인 페이지로 redirect_uri·service_name과 함께 이동한다', () => {
    render(<MembershipLoginPage />);

    fireEvent.click(screen.getByRole('button', { name: 'VOD 로그인' }));

    const expectedRedirectUri = `${window.location.origin}/auth/callback`;
    expect(navigateToMock).toHaveBeenCalledWith(
      `https://letscareer.co.kr/sso/login?redirect_uri=${encodeURIComponent(expectedRedirectUri)}&service_name=VOD`,
    );
  });

  it('SSO URL 환경변수가 없으면 이동하지 않고 안내 문구를 보여준다', () => {
    delete process.env.NEXT_PUBLIC_LETSCAREER_SSO_URL;
    render(<MembershipLoginPage />);

    fireEvent.click(screen.getByRole('button', { name: 'VOD 로그인' }));

    expect(
      screen.getByText('SSO 로그인이 아직 설정되지 않았습니다.'),
    ).toBeInTheDocument();
    expect(navigateToMock).not.toHaveBeenCalled();
  });

  it('?error=sso_failed 로 진입하면 실패 안내를 보여준다', () => {
    window.history.pushState({}, '', '/membership?error=sso_failed');
    render(<MembershipLoginPage />);

    expect(
      screen.getByText('로그인에 실패했습니다. 다시 시도해주세요.'),
    ).toBeInTheDocument();
  });
});
