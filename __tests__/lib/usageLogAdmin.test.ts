import { USAGE_EVENT_TYPES } from '@/lib/usageLogEvents';
import {
  USAGE_EVENT_LABELS,
  clampInt,
  clampUsageDays,
  clampUsageLimit,
  usageEventLabel,
} from '@/lib/usageLogAdmin';

describe('USAGE_EVENT_LABELS', () => {
  it('usageLogEvents 의 이벤트 목록과 키가 정확히 같다', () => {
    expect(Object.keys(USAGE_EVENT_LABELS).sort()).toEqual(
      [...USAGE_EVENT_TYPES].sort(),
    );
  });

  it('모든 이벤트에 비어 있지 않은 한글 라벨이 있다', () => {
    for (const type of USAGE_EVENT_TYPES) {
      expect(USAGE_EVENT_LABELS[type]).toMatch(/[가-힣]/);
    }
  });

  it('목록에 없는 값은 원문을 돌려준다', () => {
    expect(usageEventLabel('video_play')).toBe(USAGE_EVENT_LABELS.video_play);
    expect(usageEventLabel('future_event')).toBe('future_event');
    expect(usageEventLabel('toString')).toBe('toString');
  });
});

describe('clampInt', () => {
  it.each([
    [undefined, 30],
    [null, 30],
    ['', 30],
    ['  ', 30],
    ['abc', 30],
    ['0', 1],
    ['-3', 1],
    ['7', 7],
    ['7.9', 7],
    ['999', 180],
    [180, 180],
    [Number.POSITIVE_INFINITY, 30],
  ])('%p 는 %p', (input, expected) => {
    expect(clampInt(input, 1, 180, 30)).toBe(expected);
  });

  it('기간과 건수 보정은 서로 다른 범위를 쓴다', () => {
    expect(clampUsageDays('1000')).toBe(180);
    expect(clampUsageDays(undefined)).toBe(30);
    expect(clampUsageLimit('1000')).toBe(200);
    expect(clampUsageLimit(undefined)).toBe(100);
  });
});
