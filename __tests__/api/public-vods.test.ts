jest.mock('@/lib/kv');

import { GET } from '@/app/api/public/vods/route';
import { NextRequest } from 'next/server';
import { getEnabledVodList } from '@/lib/kv';

const mockGetEnabledVodList = getEnabledVodList as jest.MockedFunction<
  typeof getEnabledVodList
>;

const mockList = [
  {
    id: 1,
    title: 'A',
    youtubeId: 'aaa',
    description: '설명A',
    order: 1,
    embedEnabled: true,
    createdAt: '2024-01-01',
    publishedAt: null,
  },
];

describe('GET /api/public/vods', () => {
  beforeEach(() => {
    mockGetEnabledVodList.mockResolvedValue(mockList);
  });

  it('인증 쿠키 없이도 200 을 반환한다', async () => {
    const res = await GET(
      new NextRequest('https://hub.example.com/api/public/vods'),
    );
    expect(res.status).toBe(200);
  });

  it('썸네일·제목·부제목·허브 영상 URL 만 내보낸다', async () => {
    const res = await GET(
      new NextRequest('https://hub.example.com/api/public/vods'),
    );
    expect(await res.json()).toEqual([
      {
        id: 1,
        title: 'A',
        description: '설명A',
        thumbnailUrl: 'https://img.youtube.com/vi/aaa/hqdefault.jpg',
        url: 'https://hub.example.com/vod/1',
      },
    ]);
  });

  it('유튜브 영상 ID·URL 필드는 응답에 없다', async () => {
    const res = await GET(
      new NextRequest('https://hub.example.com/api/public/vods'),
    );
    const [item] = await res.json();
    expect(item).not.toHaveProperty('youtubeId');
    expect(JSON.stringify(item)).not.toContain('youtube.com/watch');
    expect(JSON.stringify(item)).not.toContain('youtu.be');
  });

  it('CDN 캐시 헤더를 단다', async () => {
    const res = await GET(
      new NextRequest('https://hub.example.com/api/public/vods'),
    );
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=300');
  });
});
