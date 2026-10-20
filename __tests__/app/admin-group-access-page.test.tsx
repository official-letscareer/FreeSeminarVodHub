/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import AdminVodLayout from '@/app/admin/vod/layout';
import GroupAccessPage from '@/app/admin/vod/group-access/page';

const mockRouter = { push: jest.fn() };
jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/admin/vod/group-access',
}));

const originalFetch = global.fetch;
let fetchMock: jest.Mock;

beforeEach(() => {
  fetchMock = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => [],
  }));
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

function renderPage() {
  return render(
    <AdminVodLayout>
      <GroupAccessPage />
    </AdminVodLayout>,
  );
}

describe('어드민 그룹 접근 규칙 페이지', () => {
  it('메뉴에 프리미엄 유저 대신 그룹 접근 규칙이 있고 현재 페이지로 표시된다', async () => {
    renderPage();

    const links = screen.getAllByRole('link', { name: '그룹 접근 규칙' });
    expect(links[0]).toHaveAttribute('href', '/admin/vod/group-access');
    expect(links[0]).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByText('프리미엄 유저')).toBeNull();
    await screen.findByText('등록된 규칙이 없습니다.');
  });

  it('그룹 규칙 섹션이 뜨고 프리미엄 유저 API 는 부르지 않는다', async () => {
    renderPage();

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('그룹 접근 규칙');
    await screen.findByText('등록된 규칙이 없습니다.');
    expect(screen.getByLabelText('프로그램')).toBeInTheDocument();

    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls).toContain('/api/admin/group-access-rules');
    expect(urls.some((url) => url.includes('premium'))).toBe(false);
  });
});
