'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Banner } from '@/lib/types';

export default function BannerSection() {
  // ─── 배너 상태 ────────────────────────────────────────────────────
  const [banners, setBanners] = useState<Banner[]>([]);
  const [bannersLoading, setBannersLoading] = useState(true);
  const [bannerLinkUrl, setBannerLinkUrl] = useState('');
  const [bannerPosition, setBannerPosition] =
    useState<Banner['position']>('both');
  const [bannerIsRandom, setBannerIsRandom] = useState(false);
  const [bannerAddLoading, setBannerAddLoading] = useState(false);
  const [bannerError, setBannerError] = useState('');
  const [editingBannerLinkId, setEditingBannerLinkId] = useState<number | null>(
    null,
  );
  const [editingBannerLinkText, setEditingBannerLinkText] = useState('');
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const [editingBannerId, setEditingBannerId] = useState<number | null>(null);
  const [editingBannerLinkUrl, setEditingBannerLinkUrl] = useState('');
  const [editingBannerPosition, setEditingBannerPosition] =
    useState<Banner['position']>('both');
  const [editingBannerIsRandom, setEditingBannerIsRandom] = useState(false);

  const fetchBanners = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/banners');
      if (res.status === 401) return;
      const data = await res.json();
      setBanners(data);
    } catch {
      // 조용히 무시
    } finally {
      setBannersLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBanners();
  }, [fetchBanners]);

  // ─── 배너 핸들러 ─────────────────────────────────────────────────
  async function handleBannerUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setBannerAddLoading(true);
    setBannerError('');
    try {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('linkUrl', bannerLinkUrl);
      formData.append('position', bannerPosition);
      formData.append('isRandom', String(bannerIsRandom));

      const res = await fetch('/api/admin/banners', {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        setBannerLinkUrl('');
        setBannerPosition('both');
        setBannerIsRandom(false);
        await fetchBanners();
      } else {
        const data = await res.json();
        setBannerError(data.message || '배너 추가에 실패했습니다.');
      }
    } catch {
      setBannerError('서버 연결에 실패했습니다.');
    } finally {
      setBannerAddLoading(false);
      if (bannerInputRef.current) bannerInputRef.current.value = '';
    }
  }

  async function handleSaveBannerLink(id: number) {
    try {
      await fetch('/api/admin/banners', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, linkUrl: editingBannerLinkText }),
      });
      setEditingBannerLinkId(null);
      await fetchBanners();
    } catch {
      setBannerError('배너 링크 저장에 실패했습니다.');
    }
  }

  async function handleDeleteBanner(id: number) {
    try {
      await fetch(`/api/admin/banners?id=${id}`, { method: 'DELETE' });
      await fetchBanners();
    } catch {
      setBannerError('배너 삭제에 실패했습니다.');
    }
  }

  async function handleBannerMoveUp(index: number) {
    if (index === 0) return;
    const newList = [...banners];
    [newList[index - 1], newList[index]] = [newList[index], newList[index - 1]];
    await fetch('/api/admin/banners', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds: newList.map((b) => b.id) }),
    });
    await fetchBanners();
  }

  function startEditingBanner(banner: Banner) {
    setEditingBannerId(banner.id);
    setEditingBannerLinkUrl(banner.linkUrl);
    setEditingBannerPosition(banner.position);
    setEditingBannerIsRandom(banner.isRandom);
  }

  async function handleSaveBanner(id: number) {
    try {
      await fetch('/api/admin/banners', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          linkUrl: editingBannerLinkUrl,
          position: editingBannerPosition,
          isRandom: editingBannerIsRandom,
        }),
      });
      setEditingBannerId(null);
      await fetchBanners();
    } catch {
      setBannerError('배너 저장에 실패했습니다.');
    }
  }

  async function handleBannerMoveDown(index: number) {
    if (index === banners.length - 1) return;
    const newList = [...banners];
    [newList[index], newList[index + 1]] = [newList[index + 1], newList[index]];
    await fetch('/api/admin/banners', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds: newList.map((b) => b.id) }),
    });
    await fetchBanners();
  }

  return (
    <div className="space-y-6">
      {/* ── 배너 관리 ────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">배너 관리</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 배너 추가 폼 */}
          <div className="space-y-3 p-3 bg-gray-50 rounded-lg border border-dashed border-gray-300">
            <p className="text-sm font-medium text-gray-700">
              배너 추가 (1120×180 이미지)
            </p>
            <div className="flex gap-2">
              <Input
                placeholder="클릭 시 이동할 URL (선택사항)"
                value={bannerLinkUrl}
                onChange={(e) => setBannerLinkUrl(e.target.value)}
                disabled={bannerAddLoading}
                className="flex-1"
              />
            </div>
            <div className="flex gap-3 items-center flex-wrap">
              <label className="text-sm text-gray-600">표시 위치</label>
              <select
                value={bannerPosition}
                onChange={(e) =>
                  setBannerPosition(e.target.value as Banner['position'])
                }
                disabled={bannerAddLoading}
                className="rounded-md border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                <option value="both">목록 + 재생화면</option>
                <option value="list">목록 상단만</option>
                <option value="player">재생화면 하단만</option>
              </select>
              <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bannerIsRandom}
                  onChange={(e) => setBannerIsRandom(e.target.checked)}
                  disabled={bannerAddLoading}
                  className="rounded"
                />
                랜덤 순서
              </label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => bannerInputRef.current?.click()}
                disabled={bannerAddLoading}
                className="shrink-0"
              >
                {bannerAddLoading ? '업로드 중...' : '이미지 선택 및 등록'}
              </Button>
              <input
                ref={bannerInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleBannerUpload}
              />
            </div>
            {bannerError && (
              <Alert variant="destructive">
                <AlertDescription>{bannerError}</AlertDescription>
              </Alert>
            )}
          </div>

          {/* 배너 목록 */}
          {bannersLoading ? (
            <p className="text-sm text-gray-500">불러오는 중...</p>
          ) : banners.length === 0 ? (
            <p className="text-sm text-gray-500">등록된 배너가 없습니다.</p>
          ) : (
            <ul className="space-y-2">
              {banners.map((banner, index) => (
                <li
                  key={banner.id}
                  className="flex items-center gap-3 p-3 rounded-lg border bg-white"
                >
                  {/* 순서 버튼 */}
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <button
                      className="w-7 h-7 flex items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                      onClick={() => handleBannerMoveUp(index)}
                      disabled={index === 0}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="m18 15-6-6-6 6" />
                      </svg>
                    </button>
                    <button
                      className="w-7 h-7 flex items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                      onClick={() => handleBannerMoveDown(index)}
                      disabled={index === banners.length - 1}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </button>
                  </div>
                  {/* 썸네일 */}
                  <img
                    src={banner.imageUrl}
                    alt="배너"
                    className="h-10 w-28 object-cover rounded shrink-0"
                  />
                  {/* 정보 */}
                  {editingBannerId === banner.id ? (
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <input
                        placeholder="링크 URL (선택사항)"
                        value={editingBannerLinkUrl}
                        onChange={(e) =>
                          setEditingBannerLinkUrl(e.target.value)
                        }
                        className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-gray-900"
                        autoFocus
                      />
                      <div className="flex items-center gap-2 flex-wrap">
                        <select
                          value={editingBannerPosition}
                          onChange={(e) =>
                            setEditingBannerPosition(
                              e.target.value as Banner['position'],
                            )
                          }
                          className="rounded border border-gray-300 px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-gray-900"
                        >
                          <option value="both">목록 + 재생화면</option>
                          <option value="list">목록 상단만</option>
                          <option value="player">재생화면 하단만</option>
                        </select>
                        <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editingBannerIsRandom}
                            onChange={(e) =>
                              setEditingBannerIsRandom(e.target.checked)
                            }
                            className="rounded"
                          />
                          랜덤
                        </label>
                        <button
                          className="text-xs px-2 py-1 rounded bg-gray-900 text-white hover:bg-gray-800 shrink-0"
                          onClick={() => handleSaveBanner(banner.id)}
                        >
                          저장
                        </button>
                        <button
                          className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 shrink-0"
                          onClick={() => setEditingBannerId(null)}
                        >
                          취소
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="flex-1 min-w-0 text-xs text-gray-500 space-y-0.5 cursor-pointer hover:text-gray-700"
                      onClick={() => startEditingBanner(banner)}
                      title="클릭하여 배너 정보 수정"
                    >
                      <p className="truncate">
                        {banner.linkUrl || '링크 없음'}
                      </p>
                      <p>
                        {banner.position === 'list'
                          ? '목록 상단'
                          : banner.position === 'player'
                            ? '재생화면 하단'
                            : '둘 다'}
                        {banner.isRandom && ' · 랜덤'}
                      </p>
                    </div>
                  )}
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDeleteBanner(banner.id)}
                    className="shrink-0"
                  >
                    삭제
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
