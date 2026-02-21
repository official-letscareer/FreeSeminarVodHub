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
import { VodItem, AllowedUser } from '@/lib/types';

export default function AdminVodPage() {
  const router = useRouter();

  // ─── VOD 상태 ─────────────────────────────────────────────────────
  const [vodList, setVodList] = useState<VodItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [addTitle, setAddTitle] = useState('');
  const [addUrl, setAddUrl] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<VodItem | null>(null);

  // ─── 예외 유저 상태 ───────────────────────────────────────────────
  const [users, setUsers] = useState<AllowedUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [userName, setUserName] = useState('');
  const [userPhone, setUserPhone] = useState('');
  const [userAddLoading, setUserAddLoading] = useState(false);
  const [userError, setUserError] = useState('');
  const [deleteUserTarget, setDeleteUserTarget] = useState<AllowedUser | null>(null);

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

  // ─── 예외 유저 데이터 로드 ────────────────────────────────────────
  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/users');
      if (res.status === 401) return;
      const data = await res.json();
      setUsers(data);
    } catch {
      // 유저 로드 실패 시 조용히 무시
    } finally {
      setUsersLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVodList();
    fetchUsers();
  }, [fetchVodList, fetchUsers]);

  // ─── VOD 핸들러 ───────────────────────────────────────────────────
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

  // ─── 예외 유저 핸들러 ─────────────────────────────────────────────
  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    setUserError('');
    setUserAddLoading(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: userName, phoneNum: userPhone }),
      });
      if (res.ok) {
        setUserName('');
        setUserPhone('');
        await fetchUsers();
      } else {
        const data = await res.json();
        setUserError(data.message || '유저 추가에 실패했습니다.');
      }
    } catch {
      setUserError('서버 연결에 실패했습니다.');
    } finally {
      setUserAddLoading(false);
    }
  }

  async function handleDeleteUser(id: number) {
    try {
      await fetch(`/api/admin/users?id=${id}`, { method: 'DELETE' });
      setDeleteUserTarget(null);
      await fetchUsers();
    } catch {
      setUserError('삭제에 실패했습니다.');
    }
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
                  <li key={vod.id} className={`flex items-center gap-2 p-3 rounded border ${vod.embedEnabled ? 'bg-white' : 'bg-gray-100 opacity-60'}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate">{vod.title}</p>
                        {!vod.embedEnabled && (
                          <span className="text-xs bg-gray-300 text-gray-700 px-1.5 py-0.5 rounded shrink-0">비공개</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <img
                          src={`https://img.youtube.com/vi/${vod.youtubeId}/default.jpg`}
                          alt={vod.title}
                          className="w-16 h-10 object-cover rounded"
                        />
                        <p className="text-xs text-gray-500">{vod.youtubeId}</p>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0 flex-wrap justify-end">
                      <Button
                        variant={vod.embedEnabled ? 'outline' : 'default'}
                        size="sm"
                        onClick={() => handleToggleEmbed(vod.id, vod.embedEnabled)}
                      >
                        {vod.embedEnabled ? '숨기기' : '공개'}
                      </Button>
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

        {/* ── 예외 유저 관리 ───────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">예외 접근 유저 관리</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleAddUser} className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="이름"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  disabled={userAddLoading}
                  required
                  className="flex-1"
                />
                <Input
                  placeholder="전화번호 (01012345678)"
                  value={userPhone}
                  onChange={(e) => setUserPhone(e.target.value)}
                  disabled={userAddLoading}
                  required
                  className="flex-1"
                />
                <Button type="submit" disabled={userAddLoading} className="shrink-0">
                  {userAddLoading ? '추가 중...' : '추가'}
                </Button>
              </div>
              {userError && (
                <Alert variant="destructive">
                  <AlertDescription>{userError}</AlertDescription>
                </Alert>
              )}
            </form>

            {usersLoading ? (
              <p className="text-sm text-gray-500">불러오는 중...</p>
            ) : users.length === 0 ? (
              <p className="text-sm text-gray-500">등록된 예외 유저가 없습니다.</p>
            ) : (
              <ul className="space-y-1">
                {users.map((user) => (
                  <li key={user.id} className="flex items-center gap-2 p-2 bg-white rounded border text-sm">
                    <span className="font-medium">{user.name}</span>
                    <span className="text-gray-500">{user.phoneNum}</span>
                    <div className="flex-1" />
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setDeleteUserTarget(user)}
                    >삭제</Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* VOD 삭제 확인 다이얼로그 */}
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

      {/* 유저 삭제 확인 다이얼로그 */}
      <Dialog open={!!deleteUserTarget} onOpenChange={() => setDeleteUserTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>예외 유저 삭제</DialogTitle>
            <DialogDescription>
              &quot;{deleteUserTarget?.name}&quot; ({deleteUserTarget?.phoneNum})을(를) 삭제하시겠습니까?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteUserTarget(null)}>취소</Button>
            <Button variant="destructive" onClick={() => deleteUserTarget && handleDeleteUser(deleteUserTarget.id)}>
              삭제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
