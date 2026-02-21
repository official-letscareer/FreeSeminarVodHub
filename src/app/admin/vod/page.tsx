'use client';

import { useState, useEffect, useCallback } from 'react';
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

export default function AdminVodPage() {
  const router = useRouter();
  const [vodList, setVodList] = useState<VodItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [addTitle, setAddTitle] = useState('');
  const [addUrl, setAddUrl] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<VodItem | null>(null);

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

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddError('');
    setAddLoading(true);
    try {
      const res = await fetch('/api/admin/vod', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: addTitle, youtubeUrl: addUrl }),
      });
      if (res.ok) {
        setAddTitle('');
        setAddUrl('');
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

  async function handleLogout() {
    await fetch('/api/admin/auth', { method: 'DELETE' });
    router.push('/admin');
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">VOD 관리</h1>
          <Button variant="outline" onClick={handleLogout}>로그아웃</Button>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* VOD 추가 폼 */}
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

        {/* VOD 목록 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">VOD 목록 ({vodList.length}개)</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-gray-500">불러오는 중...</p>
            ) : vodList.length === 0 ? (
              <p className="text-sm text-gray-500">등록된 VOD가 없습니다.</p>
            ) : (
              <ul className="space-y-2">
                {vodList.map((vod, index) => (
                  <li key={vod.id} className="flex items-center gap-2 p-3 bg-white rounded border">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{vod.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <img
                          src={`https://img.youtube.com/vi/${vod.youtubeId}/default.jpg`}
                          alt={vod.title}
                          className="w-16 h-10 object-cover rounded"
                        />
                        <p className="text-xs text-gray-500">{vod.youtubeId}</p>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleMoveUp(index)}
                        disabled={index === 0}
                      >↑</Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleMoveDown(index)}
                        disabled={index === vodList.length - 1}
                      >↓</Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setDeleteTarget(vod)}
                      >삭제</Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 삭제 확인 다이얼로그 */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>VOD 삭제</DialogTitle>
            <DialogDescription>
              &quot;{deleteTarget?.title}&quot;을(를) 삭제하시겠습니까?
              삭제 후 유저에게 영상이 비공개 처리됩니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>취소</Button>
            <Button variant="destructive" onClick={() => deleteTarget && handleDelete(deleteTarget.id)}>
              삭제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
