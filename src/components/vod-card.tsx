'use client';

import { VodItem } from '@/lib/types';

export default function VodCard({ vod }: { vod: VodItem }) {
  return <div data-vod-id={vod.id}>{vod.title}</div>;
}
