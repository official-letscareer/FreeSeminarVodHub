'use client';

import { Input } from '@/components/ui/input';

// 서버 검증 상한(10^15)이 16자리라 그 이상은 입력부터 막는다.
const MAX_PROGRAM_ID_DIGITS = 16;
const MAX_TITLE_LENGTH = 100;

interface ManualProgramFieldsProps {
  programId: string;
  onProgramIdChange: (programId: string) => void;
  title: string;
  onTitleChange: (title: string) => void;
  disabled?: boolean;
}

/**
 * 프로그램 번호 직접 입력. 비공개 프로그램은 검색에 나오지 않아 번호와 표시 이름만 받는다.
 * 번호가 실제 프로그램인지는 확인하지 않는다.
 */
export default function ManualProgramFields({
  programId,
  onProgramIdChange,
  title,
  onTitleChange,
  disabled,
}: ManualProgramFieldsProps) {
  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-500">
        비공개 프로그램이나 검색에 안 나오는 프로그램은 번호로 직접 입력하세요.
        번호가 맞는지는 확인하지 않습니다.
      </p>
      <div className="flex gap-2 items-center flex-wrap">
        <label className="text-sm text-gray-600" htmlFor="gar-manual-id">
          프로그램 번호
        </label>
        <Input
          id="gar-manual-id"
          inputMode="numeric"
          maxLength={MAX_PROGRAM_ID_DIGITS}
          value={programId}
          onChange={(e) => onProgramIdChange(e.target.value.replace(/\D/g, ''))}
          disabled={disabled}
          className="w-32"
        />
        <label className="text-sm text-gray-600" htmlFor="gar-manual-title">
          표시 이름(선택)
        </label>
        <Input
          id="gar-manual-title"
          maxLength={MAX_TITLE_LENGTH}
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          disabled={disabled}
          className="flex-1 min-w-48"
        />
      </div>
    </div>
  );
}
