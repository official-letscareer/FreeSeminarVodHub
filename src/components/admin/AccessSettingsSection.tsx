'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import AccessModeSelector, {
  type AccessMode,
} from '@/components/access-mode-selector';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AccessSettings } from '@/lib/types';

export default function AccessSettingsSection() {
  // ─── 챌린지 참여/옵션 필터 상태(LC-3208) ───────────────────────────
  const [accessSettings, setAccessSettings] = useState<AccessSettings>({
    requireChallengeParticipation: false,
    requireChallengeOption: false,
    allowedOptionCodes: [],
    requireVodPass: false,
  });
  const [accessSettingsLoading, setAccessSettingsLoading] = useState(true);
  const [accessSettingsSaving, setAccessSettingsSaving] = useState(false);
  const [accessSettingsError, setAccessSettingsError] = useState('');
  const [newOptionCode, setNewOptionCode] = useState('');

  // ─── 챌린지 참여/옵션 필터 설정 로드(LC-3208) ──────────────────────
  const fetchAccessSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/access-settings');
      if (res.status === 401) return;
      const data = await res.json();
      setAccessSettings(data);
    } catch {
      // 조용히 무시
    } finally {
      setAccessSettingsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccessSettings();
  }, [fetchAccessSettings]);

  // ─── 챌린지 참여/옵션 필터 핸들러(LC-3208) ─────────────────────────
  async function saveAccessSettings(updates: Partial<AccessSettings>) {
    setAccessSettingsSaving(true);
    setAccessSettingsError('');
    try {
      const res = await fetch('/api/admin/access-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setAccessSettingsError(data?.message || '설정 저장에 실패했습니다.');
        return;
      }
      const data = await res.json();
      setAccessSettings(data);
    } catch {
      setAccessSettingsError('설정 저장에 실패했습니다.');
    } finally {
      setAccessSettingsSaving(false);
    }
  }

  function handleToggleRequireParticipation(checked: boolean) {
    saveAccessSettings({ requireChallengeParticipation: checked });
  }

  function handleToggleRequireOption(checked: boolean) {
    saveAccessSettings({ requireChallengeOption: checked });
  }

  function handleChangeAccessMode(mode: AccessMode) {
    saveAccessSettings({ requireVodPass: mode === 'vod-pass' });
  }

  function handleAddOptionCode(e: React.FormEvent) {
    e.preventDefault();
    const code = newOptionCode.trim();
    if (!code || accessSettings.allowedOptionCodes.includes(code)) return;
    saveAccessSettings({
      allowedOptionCodes: [...accessSettings.allowedOptionCodes, code],
    });
    setNewOptionCode('');
  }

  function handleRemoveOptionCode(code: string) {
    saveAccessSettings({
      allowedOptionCodes: accessSettings.allowedOptionCodes.filter(
        (c) => c !== code,
      ),
    });
  }

  return (
    <div className="space-y-6">
      {/* ── 챌린지 참여/옵션 필터 설정(LC-3208) ─────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">접근 기준 설정</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {accessSettingsLoading ? (
            <p className="text-sm text-gray-500">불러오는 중...</p>
          ) : (
            <>
              {accessSettingsError && (
                <Alert variant="destructive">
                  <AlertDescription>{accessSettingsError}</AlertDescription>
                </Alert>
              )}

              <AccessModeSelector
                value={accessSettings.requireVodPass ? 'vod-pass' : 'challenge'}
                disabled={accessSettingsSaving}
                onChange={handleChangeAccessMode}
              />

              {accessSettings.requireVodPass ? (
                <div className="space-y-1 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
                  <p>
                    렛츠커리어 서버가 알려주는 시청 가능 여부로만 판단한다. 지금
                    이용 중인 VOD 이용권이 있으면 통과한다.
                  </p>
                  <p>
                    컷오버 이전에 신청한 챌린지 참여자는 챌린지 종료 후 3일까지
                    이용권 없이도 통과한다(기존 약속을 지키는 레거시 시청 권한).
                  </p>
                  <p>
                    이름+전화번호 로그인은 통과한 뒤 24시간 동안 유지되어,
                    이용권이 끝나도 최대 하루는 볼 수 있다.
                  </p>
                  <p>
                    렛츠커리어 서버(BE) 배포 뒤에 켠다. 서버가 시청 가능 여부를
                    주지 않으면 챌린지 기준으로 되돌아간다.
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        챌린지 참여 필수
                      </p>
                      <p className="text-xs text-gray-500">
                        켜면 활성 챌린지 참여자가 아닌 사람은 통과하지 못한다.
                      </p>
                    </div>
                    <Switch
                      checked={accessSettings.requireChallengeParticipation}
                      disabled={accessSettingsSaving}
                      onCheckedChange={handleToggleRequireParticipation}
                      aria-label="챌린지 참여 필수 여부"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        옵션 필수
                      </p>
                      <p className="text-xs text-gray-500">
                        켜면 아래 허용 옵션 코드를 하나도 갖지 않은 사람은
                        통과하지 못한다.
                      </p>
                    </div>
                    <Switch
                      checked={accessSettings.requireChallengeOption}
                      disabled={accessSettingsSaving}
                      onCheckedChange={handleToggleRequireOption}
                      aria-label="옵션 필수 여부"
                    />
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-900">
                      허용 옵션 코드
                    </p>
                    <p className="text-xs text-gray-500">
                      챌린지 개설 화면의 옵션 코드(예: WFB1, PLUS1)를 등록한다.
                    </p>
                    <form onSubmit={handleAddOptionCode} className="flex gap-2">
                      <Input
                        placeholder="옵션 코드 (예: WFB1)"
                        value={newOptionCode}
                        onChange={(e) => setNewOptionCode(e.target.value)}
                        disabled={accessSettingsSaving}
                        className="flex-1"
                      />
                      <Button
                        type="submit"
                        size="sm"
                        disabled={accessSettingsSaving || !newOptionCode.trim()}
                      >
                        추가
                      </Button>
                    </form>
                    {accessSettings.allowedOptionCodes.length === 0 ? (
                      <p className="text-sm text-gray-500">
                        등록된 옵션 코드가 없습니다.
                      </p>
                    ) : (
                      <ul className="flex flex-wrap gap-2">
                        {accessSettings.allowedOptionCodes.map((code) => (
                          <li
                            key={code}
                            className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1 text-sm text-gray-700"
                          >
                            {code}
                            <button
                              type="button"
                              onClick={() => handleRemoveOptionCode(code)}
                              disabled={accessSettingsSaving}
                              className="text-gray-400 hover:text-gray-700"
                              aria-label={`${code} 삭제`}
                            >
                              ×
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
