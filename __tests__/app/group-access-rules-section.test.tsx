/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import GroupAccessRulesSection from '@/components/admin/GroupAccessRulesSection';

function res(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const CHALLENGE_PROGRAM = {
  programId: 11,
  programType: 'CHALLENGE',
  title: '마케팅 챌린지 3기',
  startDate: '2026-11-01T10:00:00',
  endDate: '2026-11-30T22:00:00',
  planTypes: ['BASIC', 'STANDARD'],
};
const LIVE_PROGRAM = {
  programId: 21,
  programType: 'LIVE',
  title: '현직자 라이브',
  startDate: '2026-11-05T19:00:00',
  endDate: '2026-11-05T21:00:00',
  planTypes: [],
};
const ENDED_PROGRAM = {
  programId: 12,
  programType: 'CHALLENGE',
  title: '마케팅 챌린지 1기',
  startDate: '2026-03-01T10:00:00',
  endDate: '2026-03-31T22:00:00',
  planTypes: ['LIGHT'],
};
const RULE = {
  id: 1,
  programType: 'CHALLENGE',
  programId: 9,
  programTitle: '기존 챌린지',
  // KST 2026-10-01 10:00 / 2026-10-31 22:00
  programStartDate: '2026-10-01T01:00:00+00:00',
  programEndDate: '2026-10-31T13:00:00+00:00',
  planTypes: [],
  graceDays: 7,
  memo: '3기 수강생',
  createdAt: '2026-10-01T00:00:00+00:00',
};

let fetchMock: jest.Mock;

function mockApi(overrides: Record<string, () => unknown> = {}) {
  fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url}`;
    if (overrides[key]) return overrides[key]();
    if (key === 'GET /api/admin/group-access-rules') return res(200, [RULE]);
    if (key === 'GET /api/admin/group-access-rules/programs?type=CHALLENGE')
      return res(200, [CHALLENGE_PROGRAM]);
    if (key === 'GET /api/admin/group-access-rules/programs?type=LIVE')
      return res(200, [LIVE_PROGRAM]);
    if (key === 'POST /api/admin/group-access-rules')
      return res(201, { ...RULE, id: 2 });
    throw new Error(`unexpected ${key}`);
  });
  global.fetch = fetchMock as unknown as typeof fetch;
}

function requestedUrls(): string[] {
  return fetchMock.mock.calls.map(([url]) => url as string);
}

const PROGRAMS_API = '/api/admin/group-access-rules/programs';

function searchUrl(type: string, keyword: string) {
  return `${PROGRAMS_API}?type=${type}&keyword=${encodeURIComponent(keyword)}`;
}

function programInput() {
  return screen.getByLabelText('프로그램');
}

function typeKeyword(value: string) {
  fireEvent.change(programInput(), { target: { value } });
}

function passDebounce() {
  act(() => {
    jest.advanceTimersByTime(300);
  });
}

async function selectProgram(title: string) {
  fireEvent.focus(programInput());
  fireEvent.click(
    await screen.findByRole('option', { name: new RegExp(title) }),
  );
}

const originalFetch = global.fetch;

beforeEach(() => {
  // 2026-10-21 12:00 KST
  jest.useFakeTimers().setSystemTime(new Date('2026-10-21T03:00:00Z'));
});

afterEach(() => {
  jest.useRealTimers();
  global.fetch = originalFetch;
});

describe('GroupAccessRulesSection', () => {
  it('첫 렌더에서 규칙 목록과 챌린지 프로그램 목록을 함께 요청한다', async () => {
    mockApi();
    render(<GroupAccessRulesSection />);

    expect(requestedUrls()).toEqual(
      expect.arrayContaining([
        '/api/admin/group-access-rules',
        '/api/admin/group-access-rules/programs?type=CHALLENGE',
      ]),
    );
    await screen.findByText('기존 챌린지');
  });

  it('목록에 플랜이 비면 전체, 접근 기간은 시작일 ~ 종료일+N일(KST)로 보여준다', async () => {
    mockApi();
    render(<GroupAccessRulesSection />);

    const row = (await screen.findByText('기존 챌린지')).closest('tr')!;
    expect(row).toHaveTextContent('전체');
    expect(row).toHaveTextContent('2026-10-01 ~ 2026-11-07');
    expect(row).toHaveTextContent('3기 수강생');
  });

  it('번호로 직접 등록한 규칙은 #번호·수동, 기간은 프로그램 종료일 + N일로 보여준다', async () => {
    mockApi({
      'GET /api/admin/group-access-rules': () =>
        res(200, [
          {
            ...RULE,
            id: 3,
            programId: 77,
            programTitle: '',
            programStartDate: null,
            programEndDate: null,
            graceDays: 30,
          },
        ]),
    });
    render(<GroupAccessRulesSection />);

    const row = (await screen.findByText('#77')).closest('tr')!;
    expect(row).toHaveTextContent('수동');
    expect(row).toHaveTextContent('프로그램 종료일 + 30일');
  });

  it('챌린지 프로그램을 고르면 그 프로그램의 플랜만 고를 수 있다', async () => {
    mockApi();
    render(<GroupAccessRulesSection />);

    await selectProgram('마케팅 챌린지 3기');

    const selected = screen.getByLabelText('선택한 프로그램');
    expect(selected).toHaveTextContent('마케팅 챌린지 3기');
    expect(selected).toHaveTextContent('ID 11');
    expect(selected).toHaveTextContent('2026-11-01 ~ 2026-11-30');
    expect(screen.getByLabelText('BASIC')).toBeInTheDocument();
    expect(screen.getByLabelText('STANDARD')).toBeInTheDocument();
    expect(screen.queryByLabelText('PREMIUM')).not.toBeInTheDocument();
  });

  it('종류를 바꾸면 검색어·프로그램·플랜 선택을 비우고 그 종류의 목록을 다시 불러온다', async () => {
    mockApi({
      [`GET ${searchUrl('CHALLENGE', '마케팅')}`]: () =>
        res(200, [CHALLENGE_PROGRAM]),
    });
    render(<GroupAccessRulesSection />);

    typeKeyword('마케팅');
    passDebounce();
    await selectProgram('마케팅 챌린지 3기');
    fireEvent.click(screen.getByLabelText('BASIC'));

    fireEvent.change(screen.getByLabelText('종류'), {
      target: { value: 'LIVE' },
    });

    expect(programInput()).toHaveValue('');
    expect(screen.queryByLabelText('선택한 프로그램')).toBeNull();
    expect(screen.queryByLabelText('BASIC')).not.toBeInTheDocument();
    fireEvent.focus(programInput());
    await screen.findByRole('option', { name: /현직자 라이브/ });
    expect(requestedUrls()).toContain(
      '/api/admin/group-access-rules/programs?type=LIVE',
    );

    fireEvent.change(screen.getByLabelText('종류'), {
      target: { value: 'CHALLENGE' },
    });
    await selectProgram('마케팅 챌린지 3기');
    expect(screen.getByLabelText('BASIC')).not.toBeChecked();
  });

  it('검색어는 마지막 입력 후 300ms 가 지나야 한 번 요청한다', async () => {
    mockApi({
      [`GET ${searchUrl('CHALLENGE', '마케팅')}`]: () =>
        res(200, [CHALLENGE_PROGRAM]),
    });
    render(<GroupAccessRulesSection />);
    await screen.findByText('기존 챌린지');

    typeKeyword('마');
    act(() => {
      jest.advanceTimersByTime(200);
    });
    typeKeyword('마케');
    act(() => {
      jest.advanceTimersByTime(200);
    });
    typeKeyword(' 마케팅 ');
    act(() => {
      jest.advanceTimersByTime(299);
    });
    expect(requestedUrls().filter((url) => url.includes('keyword'))).toEqual(
      [],
    );

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(requestedUrls().filter((url) => url.includes('keyword'))).toEqual([
      searchUrl('CHALLENGE', '마케팅'),
    ]);
    expect(
      await screen.findByRole('option', { name: /마케팅 챌린지 3기/ }),
    ).toBeInTheDocument();
  });

  it('이전 검색어의 응답이 늦게 와도 버린다', async () => {
    let resolveSlow: (value: unknown) => void = () => {};
    mockApi({
      [`GET ${searchUrl('CHALLENGE', '1기')}`]: () =>
        new Promise((resolve) => {
          resolveSlow = resolve;
        }),
      [`GET ${searchUrl('CHALLENGE', '3기')}`]: () =>
        res(200, [CHALLENGE_PROGRAM]),
    });
    render(<GroupAccessRulesSection />);

    typeKeyword('1기');
    passDebounce();
    typeKeyword('3기');
    passDebounce();
    await screen.findByRole('option', { name: /마케팅 챌린지 3기/ });

    await act(async () => {
      resolveSlow(res(200, [ENDED_PROGRAM]));
    });

    expect(
      within(screen.getByRole('listbox')).getAllByRole('option'),
    ).toHaveLength(1);
    expect(
      screen.queryByRole('option', { name: /마케팅 챌린지 1기/ }),
    ).toBeNull();
  });

  it('결과 항목에 ID·기간을 보여주고 끝난 프로그램에는 종료를 붙인다', async () => {
    mockApi({
      [`GET ${searchUrl('CHALLENGE', '마케팅')}`]: () =>
        res(200, [CHALLENGE_PROGRAM, ENDED_PROGRAM]),
    });
    render(<GroupAccessRulesSection />);

    typeKeyword('마케팅');
    passDebounce();

    const ongoing = await screen.findByRole('option', {
      name: /마케팅 챌린지 3기/,
    });
    const ended = screen.getByRole('option', { name: /마케팅 챌린지 1기/ });
    expect(ongoing).toHaveTextContent('ID 11 · 2026-11-01 ~ 2026-11-30');
    expect(within(ongoing).queryByText('종료')).toBeNull();
    expect(ended).toHaveTextContent('ID 12 · 2026-03-01 ~ 2026-03-31');
    expect(within(ended).getByText('종료')).toBeInTheDocument();
  });

  it('검색 결과가 없으면 안내 문구를 보여준다', async () => {
    mockApi({
      [`GET ${searchUrl('CHALLENGE', '없음')}`]: () => res(200, []),
    });
    render(<GroupAccessRulesSection />);

    typeKeyword('없음');
    passDebounce();

    expect(await screen.findByText('검색 결과가 없습니다')).toBeInTheDocument();
  });

  it('위/아래로 이동하고 Enter 로 고르며 Esc 로 닫는다', async () => {
    mockApi({
      [`GET ${searchUrl('CHALLENGE', '마케팅')}`]: () =>
        res(200, [CHALLENGE_PROGRAM, ENDED_PROGRAM]),
    });
    render(<GroupAccessRulesSection />);

    typeKeyword('마케팅');
    passDebounce();
    await screen.findByRole('option', { name: /마케팅 챌린지 1기/ });
    const input = programInput();
    expect(input).toHaveAttribute('role', 'combobox');
    expect(input).toHaveAttribute('aria-expanded', 'true');

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox')).toBeNull();

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    const first = screen.getByRole('option', { name: /마케팅 챌린지 3기/ });
    expect(first).toHaveAttribute('aria-selected', 'true');
    expect(input).toHaveAttribute('aria-activedescendant', first.id);

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(screen.getByLabelText('선택한 프로그램')).toHaveTextContent(
      '마케팅 챌린지 1기',
    );
    expect(screen.getByLabelText('LIGHT')).toBeInTheDocument();
    expect(screen.queryByLabelText('BASIC')).toBeNull();
    expect(
      fetchMock.mock.calls.find(([, init]) => init?.method === 'POST'),
    ).toBeUndefined();
  });

  it('변경을 누르면 선택과 플랜을 비우고 다시 검색할 수 있다', async () => {
    mockApi();
    render(<GroupAccessRulesSection />);

    await selectProgram('마케팅 챌린지 3기');
    fireEvent.click(screen.getByLabelText('BASIC'));
    fireEvent.click(screen.getByRole('button', { name: '변경' }));

    expect(screen.queryByLabelText('선택한 프로그램')).toBeNull();
    expect(screen.queryByLabelText('BASIC')).toBeNull();
    expect(programInput()).toHaveFocus();
    expect(
      screen.getByRole('option', { name: /마케팅 챌린지 3기/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '등록' })).toBeDisabled();
  });

  it('LIVE 에서는 프로그램을 골라도 플랜 선택이 없다', async () => {
    mockApi();
    render(<GroupAccessRulesSection />);

    fireEvent.change(screen.getByLabelText('종류'), {
      target: { value: 'LIVE' },
    });
    await selectProgram('현직자 라이브');

    expect(screen.queryByText(/플랜 \(선택하지 않으면 전체\)/)).toBeNull();
  });

  it('등록하면 서버가 준 KST 날짜 문자열 그대로 본문에 담아 POST 한다', async () => {
    mockApi();
    render(<GroupAccessRulesSection />);

    await selectProgram('마케팅 챌린지 3기');
    fireEvent.click(screen.getByLabelText('STANDARD'));
    fireEvent.change(screen.getByLabelText('종료 후 열람 일수'), {
      target: { value: '14' },
    });
    fireEvent.change(screen.getByPlaceholderText('메모'), {
      target: { value: '기업 제휴' },
    });
    fireEvent.click(screen.getByRole('button', { name: '등록' }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.find(([, init]) => init?.method === 'POST'),
      ).toBeDefined(),
    );
    const [, init] = fetchMock.mock.calls.find(
      ([, init]) => init?.method === 'POST',
    )!;
    expect(JSON.parse(init.body)).toEqual({
      programType: 'CHALLENGE',
      programId: 11,
      programTitle: '마케팅 챌린지 3기',
      programStartDate: '2026-11-01T10:00:00',
      programEndDate: '2026-11-30T22:00:00',
      planTypes: ['STANDARD'],
      graceDays: 14,
      memo: '기업 제휴',
    });
    // 등록이 끝나면 선택을 비운다
    await waitFor(() =>
      expect(screen.queryByLabelText('선택한 프로그램')).toBeNull(),
    );
  });

  it('수정은 플랜·N·메모 세 값을 모두 PATCH 로 보낸다', async () => {
    mockApi({
      'PATCH /api/admin/group-access-rules': () => res(200, { success: true }),
    });
    render(<GroupAccessRulesSection />);

    await screen.findByText('기존 챌린지');
    fireEvent.click(screen.getByRole('button', { name: '수정' }));
    fireEvent.click(screen.getByLabelText('PREMIUM'));
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH'),
      ).toBeDefined(),
    );
    const [, init] = fetchMock.mock.calls.find(
      ([, init]) => init?.method === 'PATCH',
    )!;
    expect(JSON.parse(init.body)).toEqual({
      id: 1,
      planTypes: ['PREMIUM'],
      graceDays: 7,
      memo: '3기 수강생',
    });
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: '저장' })).toBeNull(),
    );
  });

  it('401 이면 재로그인 안내를 보여준다', async () => {
    mockApi({
      'GET /api/admin/group-access-rules': () => res(401, {}),
    });
    render(<GroupAccessRulesSection />);

    expect(
      await screen.findByText(/관리자 로그인이 만료되었습니다/),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '다시 로그인' })).toHaveAttribute(
      'href',
      '/admin',
    );
  });
});
