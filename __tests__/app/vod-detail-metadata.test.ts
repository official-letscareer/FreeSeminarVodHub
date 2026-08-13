jest.mock('@/lib/kv');

import { generateMetadata } from '@/app/vod/[id]/page';
import { getVodList } from '@/lib/kv';
import { VodItem } from '@/lib/types';

const mockGetVodList = getVodList as jest.MockedFunction<typeof getVodList>;

function makeVod(overrides: Partial<VodItem> = {}): VodItem {
  return {
    id: 1,
    title: '마케팅 취업 준비 101',
    youtubeId: 'abc123XYZ',
    description: '마케팅 취업 준비, 대체 뭐부터 해야 하지?',
    publishedAt: null,
    order: 1,
    embedEnabled: true,
    createdAt: '2024-01-01',
    ...overrides,
  };
}

describe('generateMetadata (/vod/[id])', () => {
  beforeEach(() => jest.clearAllMocks());

  it('존재하는 VOD → 제목·설명·유튜브 썸네일을 OG 메타데이터로 반환한다', async () => {
    mockGetVodList.mockResolvedValue([makeVod()]);

    const metadata = await generateMetadata({ params: Promise.resolve({ id: '1' }) });

    expect(metadata.title).toBe('마케팅 취업 준비 101');
    expect(metadata.description).toBe('마케팅 취업 준비, 대체 뭐부터 해야 하지?');
    expect(metadata.openGraph?.title).toBe('마케팅 취업 준비 101');
    expect(metadata.openGraph).toMatchObject({
      images: [
        {
          url: 'https://img.youtube.com/vi/abc123XYZ/hqdefault.jpg',
          width: 480,
          height: 360,
          alt: '마케팅 취업 준비 101',
        },
      ],
    });
    expect(metadata.twitter).toMatchObject({ card: 'summary_large_image' });
  });

  it('설명이 100자를 넘으면 잘라내고 말줄임표를 붙인다', async () => {
    const longDescription = '가'.repeat(150);
    mockGetVodList.mockResolvedValue([makeVod({ description: longDescription })]);

    const metadata = await generateMetadata({ params: Promise.resolve({ id: '1' }) });

    expect(metadata.description).toBe(`${'가'.repeat(100)}…`);
  });

  it('설명에 줄바꿈이 있으면 공백으로 접는다', async () => {
    mockGetVodList.mockResolvedValue([
      makeVod({ description: '첫 줄입니다.\n둘째 줄입니다.\n\n셋째 줄입니다.' }),
    ]);

    const metadata = await generateMetadata({ params: Promise.resolve({ id: '1' }) });

    expect(metadata.description).toBe('첫 줄입니다. 둘째 줄입니다. 셋째 줄입니다.');
  });

  it('설명이 비어 있으면 기본 설명으로 대체한다', async () => {
    mockGetVodList.mockResolvedValue([makeVod({ description: '' })]);

    const metadata = await generateMetadata({ params: Promise.resolve({ id: '1' }) });

    expect(metadata.description).toBe('챌린지 참여자 전용 VOD 스트리밍 서비스');
  });

  it('존재하지 않는 id → 기본 메타데이터로 대체한다', async () => {
    mockGetVodList.mockResolvedValue([makeVod({ id: 1 })]);

    const metadata = await generateMetadata({ params: Promise.resolve({ id: '999' }) });

    expect(metadata.title).toBe('세미나 VOD');
    expect(metadata.description).toBe('챌린지 참여자 전용 VOD 스트리밍 서비스');
    expect(metadata.openGraph).toBeUndefined();
  });

  it('id가 숫자가 아니면 조회 없이 기본 메타데이터를 반환한다', async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ id: 'abc' }) });

    expect(metadata.title).toBe('세미나 VOD');
    expect(mockGetVodList).not.toHaveBeenCalled();
  });

  it('Supabase 조회 실패 시에도 기본 메타데이터로 안전하게 대체한다', async () => {
    mockGetVodList.mockRejectedValue(new Error('Supabase error'));

    const metadata = await generateMetadata({ params: Promise.resolve({ id: '1' }) });

    expect(metadata.title).toBe('세미나 VOD');
    expect(metadata.description).toBe('챌린지 참여자 전용 VOD 스트리밍 서비스');
  });
});
