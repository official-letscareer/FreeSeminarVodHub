'use client';

import { useState, useEffect, useCallback, useRef, memo } from 'react';
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
import { VodItem, AllowedUser, Banner } from '@/lib/types';

function formatPhoneNum(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

const AdminThumbnail = memo(function AdminThumbnail({
  youtubeId,
  title,
}: {
  youtubeId: string;
  title: string;
}) {
  const [src, setSrc] = useState(`https://img.youtube.com/vi/${youtubeId}/default.jpg`);
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
        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
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

export default function AdminVodPage() {
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
  const [editingPublishedAtId, setEditingPublishedAtId] = useState<number | null>(null);
  const [editingPublishedAtText, setEditingPublishedAtText] = useState('');

  // ─── 예외 유저 상태 ───────────────────────────────────────────────
  const [users, setUsers] = useState<AllowedUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [userName, setUserName] = useState('');
  const [userPhone, setUserPhone] = useState('');
  const [userAddLoading, setUserAddLoading] = useState(false);
  const [userError, setUserError] = useState('');
  const [deleteUserTarget, setDeleteUserTarget] = useState<AllowedUser | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(new Set());
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);
  const [csvUploadLoading, setCsvUploadLoading] = useState(false);
  const [csvResult, setCsvResult] = useState<{ added: number; skipped: number; errors: string[] } | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  // ─── 배너 상태 ────────────────────────────────────────────────────
  const [banners, setBanners] = useState<Banner[]>([]);
  const [bannersLoading, setBannersLoading] = useState(true);
  const [bannerLinkUrl, setBannerLinkUrl] = useState('');
  const [bannerPosition, setBannerPosition] = useState<Banner['position']>('both');
  const [bannerIsRandom, setBannerIsRandom] = useState(false);
  const [bannerAddLoading, setBannerAddLoading] = useState(false);
  const [bannerError, setBannerError] = useState('');
  const bannerInputRef = useRef<HTMLInputElement>(null);

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
      setSelectedUserIds(new Set());
    } catch {
      // 유저 로드 실패 시 조용히 무시
    } finally {
      setUsersLoading(false);
    }
  }, []);

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
    fetchVodList();
    fetchUsers();
    fetchBanners();
  }, [fetchVodList, fetchUsers, fetchBanners]);

  // ─── VOD 핸들러 ───────────────────────────────────────────────────
  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddError('');
    setAddLoading(true);
    try {
      const res = await fetch('/api/admin/vod', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: addTitle, youtubeUrl: addUrl, description: addDesc, publishedAt: addPublishedAt || null }),
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
        body: JSON.stringify({ id, publishedAt: editingPublishedAtText || null }),
      });
      setEditingPublishedAtId(null);
      await fetchVodList();
    } catch {
      setError('제작일 저장에 실패했습니다.');
    }
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

  // ─── CSV 핸들러 ───────────────────────────────────────────────────
  function handleDownloadTemplate() {
    window.location.href = '/api/admin/users/csv-template';
  }

  async function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvUploadLoading(true);
    setCsvResult(null);
    setUserError('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/admin/users/csv-upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (res.ok) {
        setCsvResult(data);
        await fetchUsers();
      } else {
        setUserError(data.message || 'CSV 업로드에 실패했습니다.');
      }
    } catch {
      setUserError('서버 연결에 실패했습니다.');
    } finally {
      setCsvUploadLoading(false);
      if (csvInputRef.current) csvInputRef.current.value = '';
    }
  }

  // ─── 체크박스 / 일괄 삭제 핸들러 ─────────────────────────────────
  function toggleSelectUser(id: number) {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedUserIds.size === users.length) {
      setSelectedUserIds(new Set());
    } else {
      setSelectedUserIds(new Set(users.map((u) => u.id)));
    }
  }

  async function handleBulkDelete() {
    if (selectedUserIds.size === 0) return;
    setBulkDeleteLoading(true);
    try {
      await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedUserIds) }),
      });
      await fetchUsers();
    } catch {
      setUserError('일괄 삭제에 실패했습니다.');
    } finally {
      setBulkDeleteLoading(false);
    }
  }

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

      const res = await fetch('/api/admin/banners', { method: 'POST', body: formData });
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

  async function handleLogout() {
    await fetch('/api/admin/auth', { method: 'DELETE' });
    router.push('/admin');
  }

  const allSelected = users.length > 0 && selectedUserIds.size === users.length;
  const someSelected = selectedUserIds.size > 0;

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
                  <li key={vod.id} className={`flex items-center gap-3 p-3 rounded-lg border ${vod.embedEnabled ? 'bg-white' : 'bg-gray-100 opacity-60'}`}>
                    {/* 순서 이동 버튼 */}
                    <div className="flex flex-col gap-0.5 shrink-0">
                      <button
                        className="w-7 h-7 flex items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        onClick={() => handleMoveUp(index)}
                        disabled={index === 0}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6"/></svg>
                      </button>
                      <button
                        className="w-7 h-7 flex items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        onClick={() => handleMoveDown(index)}
                        disabled={index === vodList.length - 1}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                      </button>
                    </div>

                    {/* 순서 번호 */}
                    <span className="text-xs font-mono text-gray-400 w-5 text-center shrink-0">{index + 1}</span>

                    {/* 썸네일 + 정보 */}
                    <AdminThumbnail youtubeId={vod.youtubeId} title={vod.title} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate">{vod.title}</p>
                        {!vod.embedEnabled && (
                          <span className="text-xs bg-gray-300 text-gray-700 px-1.5 py-0.5 rounded shrink-0">비공개</span>
                        )}
                      </div>
                      {/* 제작일 영역 */}
                      {editingPublishedAtId === vod.id ? (
                        <div className="mt-0.5 flex gap-1.5 items-center">
                          <input
                            type="date"
                            value={editingPublishedAtText}
                            onChange={(e) => setEditingPublishedAtText(e.target.value)}
                            className="rounded border border-gray-300 px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-gray-900"
                            autoFocus
                          />
                          <button
                            className="text-xs px-2 py-1 rounded bg-gray-900 text-white hover:bg-gray-800 shrink-0"
                            onClick={() => handleSavePublishedAt(vod.id)}
                          >저장</button>
                          <button
                            className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 shrink-0"
                            onClick={() => setEditingPublishedAtId(null)}
                          >취소</button>
                        </div>
                      ) : (
                        <p
                          className="text-xs text-gray-400 mt-0.5 cursor-pointer hover:text-gray-600"
                          onClick={() => { setEditingPublishedAtId(vod.id); setEditingPublishedAtText(vod.publishedAt ?? ''); }}
                          title="클릭하여 제작일 수정"
                        >
                          {vod.publishedAt ? `제작일: ${vod.publishedAt}` : '제작일 추가...'}
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
                          >저장</button>
                          <button
                            className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 shrink-0"
                            onClick={() => setEditingDescId(null)}
                          >취소</button>
                        </div>
                      ) : (
                        <p
                          className="text-xs text-gray-400 mt-0.5 cursor-pointer hover:text-gray-600 truncate"
                          onClick={() => { setEditingDescId(vod.id); setEditingDescText(vod.description); }}
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
                        onClick={() => handleToggleEmbed(vod.id, vod.embedEnabled)}
                      >
                        {vod.embedEnabled ? '숨기기' : '공개'}
                      </Button>
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

        {/* ── 배너 관리 ────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">배너 관리</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 배너 추가 폼 */}
            <div className="space-y-3 p-3 bg-gray-50 rounded-lg border border-dashed border-gray-300">
              <p className="text-sm font-medium text-gray-700">배너 추가 (1120×180 이미지)</p>
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
                  onChange={(e) => setBannerPosition(e.target.value as Banner['position'])}
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
                  <li key={banner.id} className="flex items-center gap-3 p-3 rounded-lg border bg-white">
                    {/* 순서 버튼 */}
                    <div className="flex flex-col gap-0.5 shrink-0">
                      <button
                        className="w-7 h-7 flex items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                        onClick={() => handleBannerMoveUp(index)}
                        disabled={index === 0}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6"/></svg>
                      </button>
                      <button
                        className="w-7 h-7 flex items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                        onClick={() => handleBannerMoveDown(index)}
                        disabled={index === banners.length - 1}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                      </button>
                    </div>
                    {/* 썸네일 */}
                    <img
                      src={banner.imageUrl}
                      alt="배너"
                      className="h-10 w-28 object-cover rounded shrink-0"
                    />
                    {/* 정보 */}
                    <div className="flex-1 min-w-0 text-xs text-gray-500 space-y-0.5">
                      <p className="truncate">{banner.linkUrl || '링크 없음'}</p>
                      <p>
                        {banner.position === 'list' ? '목록 상단' : banner.position === 'player' ? '재생화면 하단' : '둘 다'}
                        {banner.isRandom && ' · 랜덤'}
                      </p>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeleteBanner(banner.id)}
                      className="shrink-0"
                    >삭제</Button>
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
            {/* 개별 추가 폼 */}
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
                  placeholder="010-1234-5678"
                  value={userPhone}
                  onChange={(e) => setUserPhone(formatPhoneNum(e.target.value))}
                  disabled={userAddLoading}
                  required
                  className="flex-1"
                />
                <Button type="submit" disabled={userAddLoading} className="shrink-0">
                  {userAddLoading ? '추가 중...' : '추가'}
                </Button>
              </div>
            </form>

            {/* CSV 업로드 영역 */}
            <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border border-dashed border-gray-300">
              <div className="flex-1 text-sm text-gray-600">
                CSV 파일로 유저 일괄 등록
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDownloadTemplate}
                className="shrink-0"
              >
                양식 다운로드
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => csvInputRef.current?.click()}
                disabled={csvUploadLoading}
                className="shrink-0"
              >
                {csvUploadLoading ? '업로드 중...' : 'CSV 업로드'}
              </Button>
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleCsvUpload}
              />
            </div>

            {/* CSV 업로드 결과 */}
            {csvResult && (
              <div className="text-sm p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="font-medium text-green-800">
                  업로드 완료: {csvResult.added}명 추가, {csvResult.skipped}명 스킵
                </p>
                {csvResult.errors.length > 0 && (
                  <ul className="mt-1 text-green-700 text-xs space-y-0.5">
                    {csvResult.errors.map((e, i) => (
                      <li key={i}>• {e}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {userError && (
              <Alert variant="destructive">
                <AlertDescription>{userError}</AlertDescription>
              </Alert>
            )}

            {/* 유저 목록 테이블 */}
            {usersLoading ? (
              <p className="text-sm text-gray-500">불러오는 중...</p>
            ) : users.length === 0 ? (
              <p className="text-sm text-gray-500">등록된 예외 유저가 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {/* 일괄 삭제 툴바 */}
                {someSelected && (
                  <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded-lg">
                    <span className="text-sm text-blue-700 flex-1">
                      {selectedUserIds.size}명 선택됨
                    </span>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleBulkDelete}
                      disabled={bulkDeleteLoading}
                    >
                      {bulkDeleteLoading ? '삭제 중...' : '선택 삭제'}
                    </Button>
                  </div>
                )}

                {/* 테이블 */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        <th className="w-10 p-2 text-left">
                          <input
                            type="checkbox"
                            checked={allSelected}
                            onChange={toggleSelectAll}
                            className="rounded"
                          />
                        </th>
                        <th className="p-2 text-left font-medium text-gray-600">이름</th>
                        <th className="p-2 text-left font-medium text-gray-600">전화번호</th>
                        <th className="p-2 text-left font-medium text-gray-600">등록일</th>
                        <th className="w-16 p-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user) => (
                        <tr
                          key={user.id}
                          className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${selectedUserIds.has(user.id) ? 'bg-blue-50' : ''}`}
                        >
                          <td className="p-2">
                            <input
                              type="checkbox"
                              checked={selectedUserIds.has(user.id)}
                              onChange={() => toggleSelectUser(user.id)}
                              className="rounded"
                            />
                          </td>
                          <td className="p-2 font-medium">{user.name}</td>
                          <td className="p-2 text-gray-600">{user.phoneNum}</td>
                          <td className="p-2 text-gray-400 text-xs">
                            {new Date(user.createdAt).toLocaleDateString('ko-KR')}
                          </td>
                          <td className="p-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteUserTarget(user)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50 h-7 px-2"
                            >
                              삭제
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
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
