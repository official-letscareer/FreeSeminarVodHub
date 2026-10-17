'use client';

export type AccessMode = 'challenge' | 'vod-pass';

interface AccessModeSelectorProps {
  value: AccessMode;
  disabled?: boolean;
  onChange: (mode: AccessMode) => void;
}

const OPTIONS: { mode: AccessMode; title: string; description: string }[] = [
  {
    mode: 'challenge',
    title: '챌린지 참여자',
    description:
      '활성 챌린지 참여자인지, 허용 옵션이 있는지로 판단한다. 아래 필터를 켜고 끌 수 있다.',
  },
  {
    mode: 'vod-pass',
    title: 'VOD 이용권 보유자',
    description:
      '챌린지 결제 때 VOD 이용권을 추가로 구매해 이용 중인 사람만 통과한다. 챌린지 필터는 쓰지 않는다.',
  },
];

/**
 * VOD 접근 기준을 하나만 고르게 한다(LC-3438). 두 기준은 함께 적용되지 않는다 —
 * 이용권 기준을 고르면 챌린지 참여·옵션 필터는 판정에 쓰이지 않는다.
 */
export default function AccessModeSelector({
  value,
  disabled = false,
  onChange,
}: AccessModeSelectorProps) {
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-sm font-medium text-gray-900">
        누가 VOD를 볼 수 있나요
      </legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {OPTIONS.map((option) => {
          const checked = value === option.mode;
          return (
            <label
              key={option.mode}
              className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${
                checked
                  ? 'border-primary bg-primary/5'
                  : 'border-gray-200 bg-white hover:bg-gray-50'
              } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              <input
                type="radio"
                name="vod-access-mode"
                className="mt-1"
                checked={checked}
                onChange={() => onChange(option.mode)}
              />
              <span>
                <span className="block text-sm font-medium text-gray-900">
                  {option.title}
                </span>
                <span className="mt-0.5 block text-xs text-gray-500">
                  {option.description}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
