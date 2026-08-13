import { NextRequest, NextResponse } from 'next/server';
import { getAccessSettings, updateAccessSettings } from '@/lib/kv';

function isAdminAuthorized(request: NextRequest): boolean {
  return request.cookies.get('admin_verified')?.value === '1';
}

export async function GET(request: NextRequest) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ message: '인증이 필요합니다.' }, { status: 401 });
  }
  const settings = await getAccessSettings();
  return NextResponse.json(settings);
}

export async function PATCH(request: NextRequest) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ message: '인증이 필요합니다.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: '잘못된 요청입니다.' }, { status: 400 });
  }

  const { requireChallengeParticipation, requireChallengeOption, allowedOptionCodes } =
    body as Record<string, unknown>;

  if (
    requireChallengeParticipation !== undefined &&
    typeof requireChallengeParticipation !== 'boolean'
  ) {
    return NextResponse.json(
      { message: 'requireChallengeParticipation은 boolean이어야 합니다.' },
      { status: 400 }
    );
  }
  if (requireChallengeOption !== undefined && typeof requireChallengeOption !== 'boolean') {
    return NextResponse.json(
      { message: 'requireChallengeOption은 boolean이어야 합니다.' },
      { status: 400 }
    );
  }
  if (
    allowedOptionCodes !== undefined &&
    (!Array.isArray(allowedOptionCodes) ||
      allowedOptionCodes.some((code) => typeof code !== 'string'))
  ) {
    return NextResponse.json(
      { message: 'allowedOptionCodes는 문자열 배열이어야 합니다.' },
      { status: 400 }
    );
  }

  const settings = await updateAccessSettings({
    requireChallengeParticipation,
    requireChallengeOption,
    allowedOptionCodes: allowedOptionCodes as string[] | undefined,
  });
  return NextResponse.json(settings);
}
