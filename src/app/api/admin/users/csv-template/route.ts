import { NextRequest, NextResponse } from 'next/server';

function isAdminAuthorized(request: NextRequest): boolean {
  return request.cookies.get('admin_verified')?.value === '1';
}

export async function GET(request: NextRequest) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ message: '인증이 필요합니다.' }, { status: 401 });
  }

  const csvContent = '이름,전화번호\n홍길동,01012345678\n';

  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="allowed_users_template.csv"',
    },
  });
}
