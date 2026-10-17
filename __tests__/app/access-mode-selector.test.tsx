/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import AccessModeSelector from '@/components/access-mode-selector';

describe('AccessModeSelector', () => {
  it('현재 기준만 선택돼 있다', () => {
    render(<AccessModeSelector value="vod-pass" onChange={jest.fn()} />);

    expect(
      screen.getByRole('radio', { name: /VOD 이용권 보유자/ }),
    ).toBeChecked();
    expect(
      screen.getByRole('radio', { name: /챌린지 참여자/ }),
    ).not.toBeChecked();
  });

  it('다른 기준을 누르면 그 기준으로 바꾸라고 알린다', () => {
    const onChange = jest.fn();
    render(<AccessModeSelector value="challenge" onChange={onChange} />);

    fireEvent.click(screen.getByRole('radio', { name: /VOD 이용권 보유자/ }));

    expect(onChange).toHaveBeenCalledWith('vod-pass');
  });

  it('저장 중에는 고를 수 없다', () => {
    const onChange = jest.fn();
    render(
      <AccessModeSelector value="challenge" disabled onChange={onChange} />,
    );

    expect(
      screen.getByRole('radio', { name: /VOD 이용권 보유자/ }),
    ).toBeDisabled();
  });
});
