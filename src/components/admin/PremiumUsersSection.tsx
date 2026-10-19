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
import { PremiumUser } from '@/lib/types';

function formatPhoneNum(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

export default function PremiumUsersSection() {
  // ─── 프리미엄 멤버십 유저 상태 ────────────────────────────────────
  const [premiumUsers, setPremiumUsers] = useState<PremiumUser[]>([]);
  const [premiumLoading, setPremiumLoading] = useState(true);
  const [premiumName, setPremiumName] = useState('');
  const [premiumPhone, setPremiumPhone] = useState('');
  const [premiumAddLoading, setPremiumAddLoading] = useState(false);
  const [premiumError, setPremiumError] = useState('');
  const [deletePremiumTarget, setDeletePremiumTarget] =
    useState<PremiumUser | null>(null);
  const [selectedPremiumIds, setSelectedPremiumIds] = useState<Set<number>>(
    new Set(),
  );
  const [premiumBulkDeleteLoading, setPremiumBulkDeleteLoading] =
    useState(false);
  const [premiumCsvUploadLoading, setPremiumCsvUploadLoading] = useState(false);
  const [premiumCsvResult, setPremiumCsvResult] = useState<{
    added: number;
    skipped: number;
    errors: string[];
  } | null>(null);
  const premiumCsvInputRef = useRef<HTMLInputElement>(null);
  const [editingPremiumId, setEditingPremiumId] = useState<number | null>(null);
  const [editingPremiumName, setEditingPremiumName] = useState('');
  const [editingPremiumPhone, setEditingPremiumPhone] = useState('');

  // ─── 프리미엄 멤버십 유저 데이터 로드 ─────────────────────────────
  const fetchPremiumUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/premium-users');
      if (res.status === 401) return;
      const data = await res.json();
      setPremiumUsers(data);
      setSelectedPremiumIds(new Set());
    } catch {
      // 유저 로드 실패 시 조용히 무시
    } finally {
      setPremiumLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPremiumUsers();
  }, [fetchPremiumUsers]);

  // ─── 프리미엄 멤버십 유저 핸들러 ──────────────────────────────────
  async function handleAddPremium(e: React.FormEvent) {
    e.preventDefault();
    setPremiumError('');
    setPremiumAddLoading(true);
    try {
      const res = await fetch('/api/admin/premium-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: premiumName, phoneNum: premiumPhone }),
      });
      if (res.ok) {
        setPremiumName('');
        setPremiumPhone('');
        await fetchPremiumUsers();
      } else {
        const data = await res.json();
        setPremiumError(data.message || '유저 추가에 실패했습니다.');
      }
    } catch {
      setPremiumError('서버 연결에 실패했습니다.');
    } finally {
      setPremiumAddLoading(false);
    }
  }

  async function handleDeletePremium(id: number) {
    try {
      await fetch(`/api/admin/premium-users?id=${id}`, { method: 'DELETE' });
      setDeletePremiumTarget(null);
      await fetchPremiumUsers();
    } catch {
      setPremiumError('삭제에 실패했습니다.');
    }
  }

  async function handleSavePremium(id: number) {
    if (!editingPremiumName.trim()) return;
    const digits = editingPremiumPhone.replace(/\D/g, '').slice(0, 11);
    try {
      const res = await fetch('/api/admin/premium-users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          name: editingPremiumName,
          phoneNum: digits,
        }),
      });
      if (res.ok) {
        setEditingPremiumId(null);
        await fetchPremiumUsers();
      } else {
        const data = await res.json();
        setPremiumError(data.message || '저장에 실패했습니다.');
      }
    } catch {
      setPremiumError('서버 연결에 실패했습니다.');
    }
  }

  function handleDownloadPremiumTemplate() {
    window.location.href = '/api/admin/premium-users/csv-template';
  }

  async function handlePremiumCsvUpload(
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = e.target.files?.[0];
    if (!file) return;

    setPremiumCsvUploadLoading(true);
    setPremiumCsvResult(null);
    setPremiumError('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/admin/premium-users/csv-upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (res.ok) {
        setPremiumCsvResult(data);
        await fetchPremiumUsers();
      } else {
        setPremiumError(data.message || 'CSV 업로드에 실패했습니다.');
      }
    } catch {
      setPremiumError('서버 연결에 실패했습니다.');
    } finally {
      setPremiumCsvUploadLoading(false);
      if (premiumCsvInputRef.current) premiumCsvInputRef.current.value = '';
    }
  }

  function toggleSelectPremium(id: number) {
    setSelectedPremiumIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllPremium() {
    if (selectedPremiumIds.size === premiumUsers.length) {
      setSelectedPremiumIds(new Set());
    } else {
      setSelectedPremiumIds(new Set(premiumUsers.map((u) => u.id)));
    }
  }

  async function handleBulkDeletePremium() {
    if (selectedPremiumIds.size === 0) return;
    setPremiumBulkDeleteLoading(true);
    try {
      await fetch('/api/admin/premium-users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedPremiumIds) }),
      });
      await fetchPremiumUsers();
    } catch {
      setPremiumError('일괄 삭제에 실패했습니다.');
    } finally {
      setPremiumBulkDeleteLoading(false);
    }
  }

  const allPremiumSelected =
    premiumUsers.length > 0 && selectedPremiumIds.size === premiumUsers.length;
  const somePremiumSelected = selectedPremiumIds.size > 0;

  return (
    <div className="space-y-6">
      {/* ── 프리미엄 멤버십 유저 관리 ────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">프리미엄 멤버십 유저 관리</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 개별 추가 폼 */}
          <form onSubmit={handleAddPremium} className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="이름"
                value={premiumName}
                onChange={(e) => setPremiumName(e.target.value)}
                disabled={premiumAddLoading}
                required
                className="flex-1"
              />
              <Input
                placeholder="01012345678"
                value={premiumPhone}
                onChange={(e) =>
                  setPremiumPhone(
                    e.target.value.replace(/\D/g, '').slice(0, 11),
                  )
                }
                disabled={premiumAddLoading}
                required
                className="flex-1"
              />
              <Button
                type="submit"
                disabled={premiumAddLoading}
                className="shrink-0"
              >
                {premiumAddLoading ? '추가 중...' : '추가'}
              </Button>
            </div>
          </form>

          {/* CSV 업로드 영역 */}
          <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border border-dashed border-gray-300">
            <div className="flex-1 text-sm text-gray-600">
              CSV 파일로 프리미엄 유저 일괄 등록
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownloadPremiumTemplate}
              className="shrink-0"
            >
              양식 다운로드
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => premiumCsvInputRef.current?.click()}
              disabled={premiumCsvUploadLoading}
              className="shrink-0"
            >
              {premiumCsvUploadLoading ? '업로드 중...' : 'CSV 업로드'}
            </Button>
            <input
              ref={premiumCsvInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handlePremiumCsvUpload}
            />
          </div>

          {/* CSV 업로드 결과 */}
          {premiumCsvResult && (
            <div className="text-sm p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="font-medium text-green-800">
                업로드 완료: {premiumCsvResult.added}명 추가,{' '}
                {premiumCsvResult.skipped}명 스킵
              </p>
              {premiumCsvResult.errors.length > 0 && (
                <ul className="mt-1 text-green-700 text-xs space-y-0.5">
                  {premiumCsvResult.errors.map((e, i) => (
                    <li key={i}>• {e}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {premiumError && (
            <Alert variant="destructive">
              <AlertDescription>{premiumError}</AlertDescription>
            </Alert>
          )}

          {/* 유저 목록 테이블 */}
          {premiumLoading ? (
            <p className="text-sm text-gray-500">불러오는 중...</p>
          ) : premiumUsers.length === 0 ? (
            <p className="text-sm text-gray-500">
              등록된 프리미엄 유저가 없습니다.
            </p>
          ) : (
            <div className="space-y-2">
              {/* 일괄 삭제 툴바 */}
              {somePremiumSelected && (
                <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded-lg">
                  <span className="text-sm text-blue-700 flex-1">
                    {selectedPremiumIds.size}명 선택됨
                  </span>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleBulkDeletePremium}
                    disabled={premiumBulkDeleteLoading}
                  >
                    {premiumBulkDeleteLoading ? '삭제 중...' : '선택 삭제'}
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
                          checked={allPremiumSelected}
                          onChange={toggleSelectAllPremium}
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
                    {premiumUsers.map((user) => (
                      <tr
                        key={user.id}
                        className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${selectedPremiumIds.has(user.id) ? 'bg-blue-50' : ''}`}
                      >
                        <td className="p-2">
                          <input
                            type="checkbox"
                            checked={selectedPremiumIds.has(user.id)}
                            onChange={() => toggleSelectPremium(user.id)}
                            className="rounded"
                          />
                        </td>
                        {editingPremiumId === user.id ? (
                          <>
                            <td className="p-1">
                              <input
                                value={editingPremiumName}
                                onChange={(e) =>
                                  setEditingPremiumName(e.target.value)
                                }
                                className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-gray-900"
                                autoFocus
                              />
                            </td>
                            <td className="p-1">
                              <input
                                value={editingPremiumPhone}
                                onChange={(e) =>
                                  setEditingPremiumPhone(
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
                                  onClick={() => handleSavePremium(user.id)}
                                >
                                  저장
                                </button>
                                <button
                                  className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                                  onClick={() => setEditingPremiumId(null)}
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
                                setEditingPremiumId(user.id);
                                setEditingPremiumName(user.name);
                                setEditingPremiumPhone(user.phoneNum);
                              }}
                              title="클릭하여 수정"
                            >
                              {user.name}
                            </td>
                            <td
                              className="p-2 text-gray-600 cursor-pointer hover:text-blue-600"
                              onClick={() => {
                                setEditingPremiumId(user.id);
                                setEditingPremiumName(user.name);
                                setEditingPremiumPhone(user.phoneNum);
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
                                onClick={() => setDeletePremiumTarget(user)}
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

      {/* 프리미엄 유저 삭제 확인 다이얼로그 */}
      <Dialog
        open={!!deletePremiumTarget}
        onOpenChange={() => setDeletePremiumTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>프리미엄 유저 삭제</DialogTitle>
            <DialogDescription>
              &quot;{deletePremiumTarget?.name}&quot; (
              {deletePremiumTarget?.phoneNum})을(를) 삭제하시겠습니까?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeletePremiumTarget(null)}
            >
              취소
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                deletePremiumTarget &&
                handleDeletePremium(deletePremiumTarget.id)
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
