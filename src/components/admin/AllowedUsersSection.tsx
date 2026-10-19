'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
import { AllowedUser } from '@/lib/types';

function formatPhoneNum(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

export default function AllowedUsersSection() {
  // ─── 예외 유저 상태 ───────────────────────────────────────────────
  const [users, setUsers] = useState<AllowedUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [userName, setUserName] = useState('');
  const [userPhone, setUserPhone] = useState('');
  const [userAddLoading, setUserAddLoading] = useState(false);
  const [userError, setUserError] = useState('');
  const [deleteUserTarget, setDeleteUserTarget] = useState<AllowedUser | null>(
    null,
  );
  const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(
    new Set(),
  );
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);
  const [csvUploadLoading, setCsvUploadLoading] = useState(false);
  const [csvResult, setCsvResult] = useState<{
    added: number;
    skipped: number;
    errors: string[];
  } | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [editingUserName, setEditingUserName] = useState('');
  const [editingUserPhone, setEditingUserPhone] = useState('');

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

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

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

  async function handleSaveUser(id: number) {
    if (!editingUserName.trim()) return;
    const digits = editingUserPhone.replace(/\D/g, '').slice(0, 11);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name: editingUserName, phoneNum: digits }),
      });
      if (res.ok) {
        setEditingUserId(null);
        await fetchUsers();
      } else {
        const data = await res.json();
        setUserError(data.message || '저장에 실패했습니다.');
      }
    } catch {
      setUserError('서버 연결에 실패했습니다.');
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

  const allSelected = users.length > 0 && selectedUserIds.size === users.length;
  const someSelected = selectedUserIds.size > 0;

  return (
    <div className="space-y-6">
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
                placeholder="01012345678"
                value={userPhone}
                onChange={(e) =>
                  setUserPhone(e.target.value.replace(/\D/g, '').slice(0, 11))
                }
                disabled={userAddLoading}
                required
                className="flex-1"
              />
              <Button
                type="submit"
                disabled={userAddLoading}
                className="shrink-0"
              >
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
                업로드 완료: {csvResult.added}명 추가, {csvResult.skipped}명
                스킵
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
            <p className="text-sm text-gray-500">
              등록된 예외 유저가 없습니다.
            </p>
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
                      <th className="p-2 text-left font-medium text-gray-600">
                        이름
                      </th>
                      <th className="p-2 text-left font-medium text-gray-600">
                        전화번호
                      </th>
                      <th className="p-2 text-left font-medium text-gray-600">
                        등록일
                      </th>
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
                        {editingUserId === user.id ? (
                          <>
                            <td className="p-1">
                              <input
                                value={editingUserName}
                                onChange={(e) =>
                                  setEditingUserName(e.target.value)
                                }
                                className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-gray-900"
                                autoFocus
                              />
                            </td>
                            <td className="p-1">
                              <input
                                value={editingUserPhone}
                                onChange={(e) =>
                                  setEditingUserPhone(
                                    formatPhoneNum(e.target.value),
                                  )
                                }
                                placeholder="01012345678"
                                className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-gray-900"
                              />
                            </td>
                            <td className="p-2 text-gray-400 text-xs">
                              {new Date(user.createdAt).toLocaleDateString(
                                'ko-KR',
                              )}
                            </td>
                            <td className="p-1">
                              <div className="flex gap-1">
                                <button
                                  className="text-xs px-2 py-1 rounded bg-gray-900 text-white hover:bg-gray-800"
                                  onClick={() => handleSaveUser(user.id)}
                                >
                                  저장
                                </button>
                                <button
                                  className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                                  onClick={() => setEditingUserId(null)}
                                >
                                  취소
                                </button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td
                              className="p-2 font-medium cursor-pointer hover:text-blue-600"
                              onClick={() => {
                                setEditingUserId(user.id);
                                setEditingUserName(user.name);
                                setEditingUserPhone(user.phoneNum);
                              }}
                              title="클릭하여 수정"
                            >
                              {user.name}
                            </td>
                            <td
                              className="p-2 text-gray-600 cursor-pointer hover:text-blue-600"
                              onClick={() => {
                                setEditingUserId(user.id);
                                setEditingUserName(user.name);
                                setEditingUserPhone(user.phoneNum);
                              }}
                              title="클릭하여 수정"
                            >
                              {user.phoneNum}
                            </td>
                            <td className="p-2 text-gray-400 text-xs">
                              {new Date(user.createdAt).toLocaleDateString(
                                'ko-KR',
                              )}
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
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 유저 삭제 확인 다이얼로그 */}
      <Dialog
        open={!!deleteUserTarget}
        onOpenChange={() => setDeleteUserTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>예외 유저 삭제</DialogTitle>
            <DialogDescription>
              &quot;{deleteUserTarget?.name}&quot; ({deleteUserTarget?.phoneNum}
              )을(를) 삭제하시겠습니까?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteUserTarget(null)}>
              취소
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                deleteUserTarget && handleDeleteUser(deleteUserTarget.id)
              }
            >
              삭제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
