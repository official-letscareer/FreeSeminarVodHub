'use client';

import { useState, useEffect, useCallback, memo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { VodItem } from '@/lib/types';

const AdminThumbnail = memo(function AdminThumbnail({
  youtubeId,
  title,
}: {
  youtubeId: string;
  title: string;
}) {
  const [src, setSrc] = useState(
    `https://img.youtube.com/vi/${youtubeId}/default.jpg`,
  );
  const [failed, setFailed] = useState(false);

  function handleError() {
    if (src.includes('default.jpg') && !src.includes('hq')) {
      setSrc(`https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`);
    } else {
      setFailed(true);
    }
  }

  if (failed) {
    return (
      <div className="w-20 h-12 rounded shrink-0 bg-gray-200 flex items-center justify-center">
        <svg
          className="w-5 h-5 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"
          />
        </svg>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={title}
      onError={handleError}
      className="w-20 h-12 object-cover rounded shrink-0"
    />
  );
});

export default function VodSection() {
  const router = useRouter();

  // ─── VOD 상태 ─────────────────────────────────────────────────────
  const [vodList, setVodList] = useState<VodItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [addTitle, setAddTitle] = useState('');
  const [addUrl, setAddUrl] = useState('');
  const [addDesc, setAddDesc] = useState('');
  const [addPublishedAt, setAddPublishedAt] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<VodItem | null>(null);
  const [editingDescId, setEditingDescId] = useState<number | null>(null);
  const [editingDescText, setEditingDescText] = useState('');
  const [editingTitleId, setEditingTitleId] = useState<number | null>(null);
  const [editingTitleText, setEditingTitleText] = useState('');
  const [editingPublishedAtId, setEditingPublishedAtId] = useState<
    number | null
  >(null);
  const [editingPublishedAtText, setEditingPublishedAtText] = useState('');

  // ─── VOD 데이터 로드 ──────────────────────────────────────────────
  const fetchVodList = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/vod');
      if (res.status === 401) {
        router.push('/admin');
        return;
      }
      const data = await res.json();
      setVodList(data);
    } catch {
      setError('VOD 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchVodList();
  }, [fetchVodList]);

  // ─── VOD 핸들러 ───────────────────────────────────────────────────
  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddError('');
    setAddLoading(true);
    try {
      const res = await fetch('/api/admin/vod', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: addTitle,
          youtubeUrl: addUrl,
          description: addDesc,
          publishedAt: addPublishedAt || null,
        }),
      });
      if (res.ok) {
        setAddTitle('');
        setAddUrl('');
        setAddDesc('');
        setAddPublishedAt('');
        await fetchVodList();
      } else {
        const data = await res.json();
        setAddError(data.message || 'VOD 추가에 실패했습니다.');
      }
    } catch {
      setAddError('서버 연결에 실패했습니다.');
    } finally {
      setAddLoading(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await fetch(`/api/admin/vod?id=${id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      await fetchVodList();
    } catch {
      setError('삭제에 실패했습니다.');
    }
  }

  async function handleToggleEmbed(id: number, currentEnabled: boolean) {
    try {
      await fetch('/api/admin/vod', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, embedEnabled: !currentEnabled }),
      });
      await fetchVodList();
    } catch {
      setError('상태 변경에 실패했습니다.');
    }
  }

  async function handleMoveUp(index: number) {
    if (index === 0) return;
    const newList = [...vodList];
    [newList[index - 1], newList[index]] = [newList[index], newList[index - 1]];
    const orderedIds = newList.map((v) => v.id);
    await fetch('/api/admin/vod/order', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds }),
    });
    await fetchVodList();
  }

  async function handleMoveDown(index: number) {
    if (index === vodList.length - 1) return;
    const newList = [...vodList];
    [newList[index], newList[index + 1]] = [newList[index + 1], newList[index]];
    const orderedIds = newList.map((v) => v.id);
    await fetch('/api/admin/vod/order', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds }),
    });
    await fetchVodList();
  }

  async function handleSaveTitle(id: number) {
    if (!editingTitleText.trim()) return;
    try {
      await fetch('/api/admin/vod', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, title: editingTitleText }),
      });
      setEditingTitleId(null);
      await fetchVodList();
    } catch {
      setError('제목 저장에 실패했습니다.');
    }
  }

  async function handleSaveDescription(id: number) {
    try {
      await fetch('/api/admin/vod', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, description: editingDescText }),
      });
      setEditingDescId(null);
      await fetchVodList();
    } catch {
      setError('설명 저장에 실패했습니다.');
    }
  }

  async function handleSavePublishedAt(id: number) {
    try {
      await fetch('/api/admin/vod', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          publishedAt: editingPublishedAtText || null,
        }),
      });
      setEditingPublishedAtId(null);
      await fetchVodList();
    } catch {
      setError('제작일 저장에 실패했습니다.');
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* ── VOD 추가 폼 ──────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">VOD 추가</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAdd} className="space-y-3">
            <Input
              placeholder="제목"
              value={addTitle}
              onChange={(e) => setAddTitle(e.target.value)}
              disabled={addLoading}
              required
            />
            <Input
              placeholder="유튜브 URL (예: https://youtube.com/watch?v=...)"
              value={addUrl}
              onChange={(e) => setAddUrl(e.target.value)}
              disabled={addLoading}
              required
            />
            <textarea
              placeholder="설명 (선택사항)"
              value={addDesc}
              onChange={(e) => setAddDesc(e.target.value)}
              disabled={addLoading}
              rows={2}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent resize-none"
            />
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600 shrink-0">제작일</label>
              <Input
                type="date"
                value={addPublishedAt}
                onChange={(e) => setAddPublishedAt(e.target.value)}
                disabled={addLoading}
                className="flex-1"
              />
            </div>
            {addError && (
              <Alert variant="destructive">
                <AlertDescription>{addError}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" disabled={addLoading}>
              {addLoading ? '추가 중...' : '추가'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* ── VOD 목록 ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            VOD 목록 ({vodList.length}개)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-gray-500">불러오는 중...</p>
          ) : vodList.length === 0 ? (
            <p className="text-sm text-gray-500">등록된 VOD가 없습니다.</p>
          ) : (
            <ul className="space-y-2">
              {vodList.map((vod, index) => (
                <li
                  key={vod.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border ${vod.embedEnabled ? 'bg-white' : 'bg-gray-100 opacity-60'}`}
                >
                  {/* 순서 이동 버튼 */}
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <button
                      className="w-7 h-7 flex items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      onClick={() => handleMoveUp(index)}
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
                      className="w-7 h-7 flex items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      onClick={() => handleMoveDown(index)}
                      disabled={index === vodList.length - 1}
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

                  {/* 순서 번호 */}
                  <span className="text-xs font-mono text-gray-400 w-5 text-center shrink-0">
                    {index + 1}
                  </span>

                  {/* 썸네일 + 정보 */}
                  <AdminThumbnail youtubeId={vod.youtubeId} title={vod.title} />
                  <div className="flex-1 min-w-0">
                    {/* 제목 영역 */}
                    {editingTitleId === vod.id ? (
                      <div className="flex gap-1.5 items-center mb-0.5">
                        <input
                          value={editingTitleText}
                          onChange={(e) => setEditingTitleText(e.target.value)}
                          className="flex-1 rounded border border-gray-300 px-2 py-0.5 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-gray-900 min-w-0"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveTitle(vod.id);
                            if (e.key === 'Escape') setEditingTitleId(null);
                          }}
                        />
                        <button
                          className="text-xs px-2 py-1 rounded bg-gray-900 text-white hover:bg-gray-800 shrink-0"
                          onClick={() => handleSaveTitle(vod.id)}
                        >
                          저장
                        </button>
                        <button
                          className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 shrink-0"
                          onClick={() => setEditingTitleId(null)}
                        >
                          취소
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 mb-0.5">
                        <p
                          className="font-medium text-sm truncate cursor-pointer hover:text-blue-600"
                          onClick={() => {
                            setEditingTitleId(vod.id);
                            setEditingTitleText(vod.title);
                          }}
                          title="클릭하여 제목 수정"
                        >
                          {vod.title}
                        </p>
                        {!vod.embedEnabled && (
                          <span className="text-xs bg-gray-300 text-gray-700 px-1.5 py-0.5 rounded shrink-0">
                            비공개
                          </span>
                        )}
                      </div>
                    )}
                    {/* 제작일 영역 */}
                    {editingPublishedAtId === vod.id ? (
                      <div className="mt-0.5 flex gap-1.5 items-center">
                        <input
                          type="date"
                          value={editingPublishedAtText}
                          onChange={(e) =>
                            setEditingPublishedAtText(e.target.value)
                          }
                          className="rounded border border-gray-300 px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-gray-900"
                          autoFocus
                        />
                        <button
                          className="text-xs px-2 py-1 rounded bg-gray-900 text-white hover:bg-gray-800 shrink-0"
                          onClick={() => handleSavePublishedAt(vod.id)}
                        >
                          저장
                        </button>
                        <button
                          className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 shrink-0"
                          onClick={() => setEditingPublishedAtId(null)}
                        >
                          취소
                        </button>
                      </div>
                    ) : (
                      <p
                        className="text-xs text-gray-400 mt-0.5 cursor-pointer hover:text-gray-600"
                        onClick={() => {
                          setEditingPublishedAtId(vod.id);
                          setEditingPublishedAtText(vod.publishedAt ?? '');
                        }}
                        title="클릭하여 제작일 수정"
                      >
                        {vod.publishedAt
                          ? `제작일: ${vod.publishedAt}`
                          : '제작일 추가...'}
                      </p>
                    )}

                    {/* 설명 영역 */}
                    {editingDescId === vod.id ? (
                      <div className="mt-1 flex gap-1.5 items-start">
                        <textarea
                          value={editingDescText}
                          onChange={(e) => setEditingDescText(e.target.value)}
                          rows={2}
                          className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-gray-900"
                          autoFocus
                        />
                        <button
                          className="text-xs px-2 py-1 rounded bg-gray-900 text-white hover:bg-gray-800 shrink-0"
                          onClick={() => handleSaveDescription(vod.id)}
                        >
                          저장
                        </button>
                        <button
                          className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 shrink-0"
                          onClick={() => setEditingDescId(null)}
                        >
                          취소
                        </button>
                      </div>
                    ) : (
                      <p
                        className="text-xs text-gray-400 mt-0.5 cursor-pointer hover:text-gray-600 truncate"
                        onClick={() => {
                          setEditingDescId(vod.id);
                          setEditingDescText(vod.description);
                        }}
                        title="클릭하여 설명 수정"
                      >
                        {vod.description || '설명 추가...'}
                      </p>
                    )}
                  </div>

                  {/* 액션 버튼 */}
                  <div className="flex gap-1.5 shrink-0">
                    <Button
                      variant={vod.embedEnabled ? 'outline' : 'default'}
                      size="sm"
                      onClick={() =>
                        handleToggleEmbed(vod.id, vod.embedEnabled)
                      }
                    >
                      {vod.embedEnabled ? '숨기기' : '공개'}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setDeleteTarget(vod)}
                    >
                      삭제
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* VOD 삭제 확인 다이얼로그 */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>VOD 삭제</DialogTitle>
            <DialogDescription>
              &quot;{deleteTarget?.title}&quot;을(를) 삭제하시겠습니까? 삭제 후
              유저에게 영상이 비공개 처리됩니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              취소
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && handleDelete(deleteTarget.id)}
            >
              삭제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
