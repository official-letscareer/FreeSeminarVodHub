'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

interface NavItem {
  href: string;
  label: string;
  description: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

/** 어드민 메뉴. 한 화면에 몰려 있던 관리 기능을 목적별로 나눈다. */
const NAV_GROUPS: NavGroup[] = [
  {
    title: '콘텐츠',
    items: [
      {
        href: '/admin/vod',
        label: 'VOD 관리',
        description: '영상 추가, 순서, 공개 설정',
      },
      {
        href: '/admin/vod/banners',
        label: '배너 관리',
        description: '목록·재생 화면 배너',
      },
    ],
  },
  {
    title: '접근 관리',
    items: [
      {
        href: '/admin/vod/access',
        label: '접근 기준',
        description: '챌린지 참여자 또는 이용권 보유자',
      },
      {
        href: '/admin/vod/users',
        label: '예외 유저',
        description: '기준과 무관하게 허용',
      },
      {
        href: '/admin/vod/premium',
        label: '프리미엄 유저',
        description: '멤버십 명단',
      },
    ],
  },
  {
    title: '분석',
    items: [
      {
        href: '/admin/vod/usage',
        label: '이용 로그',
        description: '이용 현황과 유저별 이동 경로',
      },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/admin/vod') return pathname === '/admin/vod';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AdminVodLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const current = NAV_GROUPS.flatMap((group) => group.items).find((item) =>
    isActive(pathname, item.href),
  );

  async function handleLogout() {
    await fetch('/api/admin/auth', { method: 'DELETE' });
    router.push('/admin');
  }

  return (
    <div className="min-h-screen bg-gray-50 md:flex">
      {/* 데스크톱: 왼쪽 고정 메뉴 */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-gray-200 bg-white md:flex">
        <div className="border-b border-gray-200 px-5 py-4">
          <p className="text-xs font-medium text-gray-500">세미나 VOD</p>
          <p className="text-base font-bold text-gray-900">어드민</p>
        </div>
        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="px-2 pb-1 text-xs font-semibold text-gray-400">
                {group.title}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isActive(pathname, item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        className={`block rounded-md px-2 py-2 text-sm ${
                          active
                            ? 'bg-primary/10 font-semibold text-primary'
                            : 'text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="border-t border-gray-200 p-3">
          <Button variant="outline" className="w-full" onClick={handleLogout}>
            로그아웃
          </Button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* 모바일: 위쪽 가로 메뉴 */}
        <header className="border-b border-gray-200 bg-white md:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <p className="text-base font-bold text-gray-900">VOD 어드민</p>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              로그아웃
            </Button>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-2">
            {NAV_GROUPS.flatMap((group) => group.items).map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${
                    active
                      ? 'bg-primary text-white'
                      : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>

        <main className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
          {current && (
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {current.label}
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                {current.description}
              </p>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
