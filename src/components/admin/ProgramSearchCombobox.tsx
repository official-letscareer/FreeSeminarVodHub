'use client';

import { useId, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { parseKstDateTime } from '@/lib/groupAccess';
import type { GroupAccessProgramType } from '@/lib/types';

const MAX_KEYWORD_LENGTH = 50;

/** 프로그램 목록 API 응답 한 건. 날짜는 서버가 준 오프셋 없는 KST 문자열 그대로다. */
export interface ProgramOption {
  programId: number;
  programType: GroupAccessProgramType;
  title: string;
  startDate: string;
  endDate: string;
  planTypes: string[];
}

function formatPeriod(program: ProgramOption): string {
  return `${program.startDate.slice(0, 10)} ~ ${program.endDate.slice(0, 10)}`;
}

function isEnded(program: ProgramOption): boolean {
  return parseKstDateTime(program.endDate).getTime() < Date.now();
}

function ProgramSummary({ program }: { program: ProgramOption }) {
  return (
    <>
      <span className="font-medium text-gray-900">{program.title}</span>
      <span className="text-xs text-gray-500">
        ID {program.programId} · {formatPeriod(program)}
      </span>
      {isEnded(program) ? (
        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
          종료
        </span>
      ) : null}
    </>
  );
}

interface ProgramSearchComboboxProps {
  id: string;
  query: string;
  onQueryChange: (query: string) => void;
  programs: ProgramOption[];
  loading: boolean;
  selected: ProgramOption | null;
  onSelect: (program: ProgramOption | null) => void;
  disabled?: boolean;
}

/**
 * 프로그램 검색 콤보박스. 검색어·목록·선택은 부모가 들고, 여기서는 열림과 키보드 이동만 다룬다.
 * 고르면 선택한 프로그램을 보여주고, "변경" 을 누르면 다시 검색 입력으로 돌아간다.
 */
export default function ProgramSearchCombobox({
  id,
  query,
  onQueryChange,
  programs,
  loading,
  selected,
  onSelect,
  disabled,
}: ProgramSearchComboboxProps) {
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  // 목록이 바뀌어 범위를 벗어난 인덱스는 렌더 중에 잘라 쓴다.
  const active = loading ? -1 : Math.min(activeIndex, programs.length - 1);
  const optionId = (index: number) => `${listboxId}-option-${index}`;

  function select(program: ProgramOption) {
    onSelect(program);
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleChangeSelection() {
    // 입력창이 다시 그려진 뒤에 포커스를 옮겨야 해서 선택 해제를 먼저 반영한다.
    flushSync(() => onSelect(null));
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setOpen(true);
        setActiveIndex(Math.min(active + 1, programs.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setOpen(true);
        setActiveIndex(Math.max(active - 1, 0));
        break;
      case 'Enter':
        // 폼 안이라 Enter 가 등록 제출로 새지 않게 막는다.
        e.preventDefault();
        if (open && active >= 0) select(programs[active]);
        break;
      case 'Escape':
        if (open) {
          e.preventDefault();
          setOpen(false);
        }
        break;
    }
  }

  if (selected) {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-gray-200 px-3 py-1.5 text-sm">
        <div
          aria-label="선택한 프로그램"
          className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2"
        >
          <ProgramSummary program={selected} />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 shrink-0 px-2"
          onClick={handleChangeSelection}
          disabled={disabled}
        >
          변경
        </Button>
      </div>
    );
  }

  const emptyMessage = query.trim()
    ? '검색 결과가 없습니다'
    : '진행 예정·진행 중인 프로그램이 없습니다';

  return (
    <div className="relative min-w-0 flex-1">
      <Input
        ref={inputRef}
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={
          open && active >= 0 ? optionId(active) : undefined
        }
        placeholder="제목 또는 ID 로 검색"
        maxLength={MAX_KEYWORD_LENGTH}
        autoComplete="off"
        value={query}
        onChange={(e) => {
          onQueryChange(e.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
      />
      {open ? (
        <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-72 overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-md">
          {loading ? (
            <p className="px-3 py-2 text-sm text-gray-500">불러오는 중...</p>
          ) : programs.length === 0 ? (
            <p className="px-3 py-2 text-sm text-gray-500">{emptyMessage}</p>
          ) : (
            <ul id={listboxId} role="listbox" aria-label="프로그램 검색 결과">
              {programs.map((program, index) => (
                <li
                  key={program.programId}
                  id={optionId(index)}
                  role="option"
                  aria-selected={index === active}
                  // 클릭이 입력창 blur 로 목록을 먼저 닫지 않게 한다.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => select(program)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`flex cursor-pointer flex-wrap items-center gap-x-2 px-3 py-2 text-sm ${
                    index === active ? 'bg-gray-100' : ''
                  }`}
                >
                  <ProgramSummary program={program} />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
