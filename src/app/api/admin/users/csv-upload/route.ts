import { NextRequest, NextResponse } from 'next/server';
import { addAllowedUser } from '@/lib/kv';

function isAdminAuthorized(request: NextRequest): boolean {
  return request.cookies.get('admin_verified')?.value === '1';
}

function parsePhoneNum(raw: string): string {
  return raw.trim().replace(/[^0-9-]/g, '');
}

function isValidPhoneNum(phoneNum: string): boolean {
  return /^010-\d{4}-\d{4}$/.test(phoneNum) || /^010\d{8}$/.test(phoneNum);
}

export async function POST(request: NextRequest) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ message: '인증이 필요합니다.' }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ message: '파일 업로드 형식이 잘못되었습니다.' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ message: 'CSV 파일을 첨부해주세요.' }, { status: 400 });
  }

  const text = await (file as File).text();
  const lines = text.split(/\r?\n/).filter((line) => line.trim());

  if (lines.length < 2) {
    return NextResponse.json({ message: 'CSV 파일에 데이터가 없습니다.' }, { status: 400 });
  }

  // 헤더 행 제거 (첫 번째 줄)
  const dataLines = lines.slice(1);

  let added = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let i = 0; i < dataLines.length; i++) {
    const line = dataLines[i].trim();
    if (!line) continue;

    const parts = line.split(',');
    if (parts.length < 2) {
      errors.push(`${i + 2}행: 형식 오류 (이름,전화번호 형식 필요)`);
      skipped++;
      continue;
    }

    const name = parts[0].trim();
    const phoneNum = parsePhoneNum(parts[1]);

    if (!name) {
      errors.push(`${i + 2}행: 이름이 비어있습니다`);
      skipped++;
      continue;
    }

    if (!isValidPhoneNum(phoneNum)) {
      errors.push(`${i + 2}행: 전화번호 형식 오류 (${parts[1].trim()})`);
      skipped++;
      continue;
    }

    try {
      await addAllowedUser(name, phoneNum);
      added++;
    } catch (err: unknown) {
      // 중복 유저 (UNIQUE 제약 위반) 스킵
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('duplicate') || message.includes('unique')) {
        skipped++;
      } else {
        errors.push(`${i + 2}행: ${name} 등록 실패`);
        skipped++;
      }
    }
  }

  return NextResponse.json({ added, skipped, errors });
}
