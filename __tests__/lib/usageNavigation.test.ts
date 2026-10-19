/** @jest-environment jsdom */
import {
  installClickTracker,
  labelOf,
  readNavigationContext,
} from '@/lib/usageNavigation';

function click(el: Element) {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe('usageNavigation', () => {
  beforeEach(() => {
    sessionStorage.clear();
    document.body.innerHTML = '';
    jest.useFakeTimers().setSystemTime(new Date('2026-10-19T02:00:00Z'));
  });

  afterEach(() => jest.useRealTimers());

  describe('labelOf', () => {
    it('data-track, aria-label, title, 글자, 이미지 alt 순으로 이름을 정한다', () => {
      document.body.innerHTML = `
        <a id="a" data-track="추천 카드" aria-label="x">본문</a>
        <a id="b" aria-label="라벨">본문</a>
        <a id="c" title="툴팁">본문</a>
        <a id="d">  본문
          글자 </a>
        <a id="e"><img alt="썸네일" /></a>`;
      const label = (id: string) => labelOf(document.getElementById(id));

      expect(label('a')).toBe('추천 카드');
      expect(label('b')).toBe('라벨');
      expect(label('c')).toBe('툴팁');
      expect(label('d')).toBe('본문 글자');
      expect(label('e')).toBe('썸네일');
    });

    it('링크·버튼 안쪽을 눌러도 가장 가까운 링크의 이름을 쓰고, 80자로 자른다', () => {
      document.body.innerHTML = `<a id="a" href="/vod/1"><span id="s">${'가'.repeat(120)}</span></a>`;

      const label = labelOf(document.getElementById('s'));

      expect(label).toHaveLength(80);
    });

    it('링크나 버튼이 아니면 null 이다', () => {
      document.body.innerHTML = '<div id="d">그냥 글자</div>';

      expect(labelOf(document.getElementById('d'))).toBeNull();
    });
  });

  describe('readNavigationContext', () => {
    it('이 탭의 첫 화면은 from 이 비어 있다', () => {
      expect(readNavigationContext('/vod')).toEqual({ from: '' });
    });

    it('다음 화면은 직전 경로를 from 으로 갖고, 직전에 누른 링크를 via 로 갖는다', () => {
      installClickTracker();
      document.body.innerHTML =
        '<a id="card" href="/vod/28">마케팅 취업 준비 101</a>';
      readNavigationContext('/vod');

      click(document.getElementById('card') as Element);
      jest.advanceTimersByTime(800);

      expect(readNavigationContext('/vod/28')).toEqual({
        from: '/vod',
        via: '마케팅 취업 준비 101',
      });
    });

    it('10초가 지난 클릭은 이동 원인으로 보지 않는다', () => {
      installClickTracker();
      document.body.innerHTML = '<button id="b">열기</button>';
      readNavigationContext('/vod');
      click(document.getElementById('b') as Element);
      jest.advanceTimersByTime(11_000);

      expect(readNavigationContext('/vod/7')).toEqual({ from: '/vod' });
    });

    it('클릭 기록은 한 번만 쓴다', () => {
      installClickTracker();
      document.body.innerHTML = '<button id="b">열기</button>';
      readNavigationContext('/vod');
      click(document.getElementById('b') as Element);
      readNavigationContext('/vod/7');

      expect(readNavigationContext('/vod/8')).toEqual({ from: '/vod/7' });
    });

    it('같은 경로를 다시 부르면(이중 실행, 새로고침) 처음 값을 그대로 돌려준다', () => {
      readNavigationContext('/vod');

      const first = readNavigationContext('/vod/7');
      const second = readNavigationContext('/vod/7');

      expect(first).toEqual({ from: '/vod' });
      expect(second).toEqual(first);
    });

    it('저장소를 못 쓰면 예외 없이 from 만 비운다', () => {
      const spy = jest
        .spyOn(Storage.prototype, 'getItem')
        .mockImplementation(() => {
          throw new Error('blocked');
        });

      expect(readNavigationContext('/vod')).toEqual({ from: '' });
      spy.mockRestore();
    });
  });
});
