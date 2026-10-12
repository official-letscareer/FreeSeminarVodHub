/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import VodPassActivationDialog, {
  readInactivePass,
} from '@/components/vod-pass-activation-dialog';

const PASS = {
  applicationId: 123,
  durationDays: 30,
  expectedEndDate: '2026-11-11',
};

function renderDialog(
  overrides: Partial<React.ComponentProps<typeof VodPassActivationDialog>> = {},
) {
  const onActivated = jest.fn();
  const onLater = jest.fn();
  render(
    <VodPassActivationDialog
      pass={PASS}
      inactiveCount={1}
      onActivated={onActivated}
      onLater={onLater}
      {...overrides}
    />,
  );
  return { onActivated, onLater };
}

/** 응답을 즉시 주지 않고 테스트가 직접 풀어주는 fetch. 진행 중 상태를 시험할 때 쓴다. */
function deferredFetch() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise((r) => {
    resolve = r;
  });
  global.fetch = jest.fn().mockReturnValue(promise) as unknown as typeof fetch;
  return resolve;
}

describe('VodPassActivationDialog (LC-3438)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  it('제목, 이용 기간, 예상 종료일, 환불 불가 고지, 두 버튼을 보여준다', () => {
    renderDialog();

    expect(
      screen.getByText('현재 보유 중인 이용권이 있습니다. 사용하시겠습니까?'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('이용 기간 30일, 예상 종료일 2026-11-11'),
    ).toBeInTheDocument();
    expect(screen.getByText(/환불할 수\s*없습니다/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '사용하기' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '나중에' })).toBeEnabled();
  });

  it('이용권이 하나면 다건 안내 문구를 보여주지 않는다', () => {
    renderDialog({ inactiveCount: 1 });

    expect(screen.queryByText(/가장 먼저 구매한 이용권부터/)).toBeNull();
  });

  it('이용권이 여러 개면 개수와 함께 가장 먼저 구매한 것부터 활성화된다고 안내한다', () => {
    renderDialog({ inactiveCount: 3 });

    expect(
      screen.getByText(
        '보유한 이용권 3개 중 가장 먼저 구매한 이용권부터 활성화됩니다',
      ),
    ).toBeInTheDocument();
  });

  it('사용하기를 누르면 applicationId 로 활성화를 요청하고 성공하면 onActivated 를 부른다', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ startsAt: '2026-10-12', endsAt: '2026-11-11' }),
    }) as unknown as typeof fetch;
    const { onActivated, onLater } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: '사용하기' }));

    await waitFor(() => expect(onActivated).toHaveBeenCalledTimes(1));
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/vod/pass/activate',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ applicationId: 123 }),
      }),
    );
    expect(onLater).not.toHaveBeenCalled();
  });

  it('409 이면 렛커 서버 메시지를 모달 안에 보여주고 닫지 않는다', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        message: '이미 이용 중인 이용권이 있어 기간이 겹칩니다.',
      }),
    }) as unknown as typeof fetch;
    const { onActivated, onLater } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: '사용하기' }));

    expect(
      await screen.findByText('이미 이용 중인 이용권이 있어 기간이 겹칩니다.'),
    ).toBeInTheDocument();
    expect(onActivated).not.toHaveBeenCalled();
    expect(onLater).not.toHaveBeenCalled();
    // 메시지를 읽은 뒤 다시 시도하거나 나중에를 고를 수 있어야 한다.
    expect(screen.getByRole('button', { name: '사용하기' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '나중에' })).toBeEnabled();
  });

  it('응답 본문에 메시지가 없으면 기본 안내를 보여준다', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error('no body');
      },
    }) as unknown as typeof fetch;
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: '사용하기' }));

    expect(
      await screen.findByText(
        '이용권을 활성화하지 못했습니다. 잠시 후 다시 시도해주세요.',
      ),
    ).toBeInTheDocument();
  });

  it('네트워크 오류이면 기본 안내를 보여주고 버튼을 다시 연다', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('network')) as unknown as typeof fetch;
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: '사용하기' }));

    expect(
      await screen.findByText(
        '이용권을 활성화하지 못했습니다. 잠시 후 다시 시도해주세요.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '사용하기' })).toBeEnabled();
  });

  it('요청이 진행 중이면 두 버튼을 잠가 중복 호출을 막는다', async () => {
    const resolve = deferredFetch();
    const { onActivated, onLater } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: '사용하기' }));

    const activating = await screen.findByRole('button', {
      name: '활성화 중...',
    });
    expect(activating).toBeDisabled();
    expect(screen.getByRole('button', { name: '나중에' })).toBeDisabled();

    fireEvent.click(activating);
    fireEvent.click(screen.getByRole('button', { name: '나중에' }));
    // Esc 로도 닫히지 않는다.
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(onLater).not.toHaveBeenCalled();

    resolve({ ok: true, status: 200, json: async () => ({}) });
    await waitFor(() => expect(onActivated).toHaveBeenCalledTimes(1));
  });

  it('나중에를 누르면 onLater 를 부른다', () => {
    const { onLater } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: '나중에' }));

    expect(onLater).toHaveBeenCalledTimes(1);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('진행 중이 아닐 때 Esc 로 닫으면 나중에와 같이 onLater 를 부른다', () => {
    const { onLater } = renderDialog();

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(onLater).toHaveBeenCalledTimes(1);
  });
});

describe('readInactivePass (LC-3438)', () => {
  function res(status: number, body: unknown): Response {
    return {
      status,
      json: async () => body,
    } as unknown as Response;
  }

  it('403 VOD_PASS_INACTIVE 본문에서 활성화 대상 정보를 읽는다', async () => {
    await expect(
      readInactivePass(
        res(403, {
          code: 'VOD_PASS_INACTIVE',
          message: '활성화되지 않은 VOD 이용권이 있습니다.',
          pass: PASS,
          inactiveCount: 2,
        }),
      ),
    ).resolves.toEqual({ pass: PASS, inactiveCount: 2 });
  });

  it('다른 사유의 403 이나 형식이 어긋난 본문은 null 이다', async () => {
    await expect(
      readInactivePass(
        res(403, { code: 'OTHER', pass: PASS, inactiveCount: 1 }),
      ),
    ).resolves.toBeNull();
    await expect(
      readInactivePass(
        res(403, { code: 'VOD_PASS_INACTIVE', pass: {}, inactiveCount: 1 }),
      ),
    ).resolves.toBeNull();
    await expect(readInactivePass(res(403, null))).resolves.toBeNull();
  });

  it('403 이 아니면 본문을 읽지 않고 null 이다', async () => {
    const json = jest.fn();
    await expect(
      readInactivePass({ status: 401, json } as unknown as Response),
    ).resolves.toBeNull();
    expect(json).not.toHaveBeenCalled();
  });
});
