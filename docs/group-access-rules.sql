-- 그룹 접근 규칙 테이블. Supabase SQL Editor 에서 사람이 직접 실행한다. 이 레포는 실행하지 않는다.
-- 여러 번 실행해도 안전하다(멱등).
--
-- 규칙 한 건은 "이 프로그램(플랜)을 신청한 사람 전체에게, 프로그램 종료일 + grace_days 일까지" VOD 접근을 연다.
-- 판정은 VOD 허브(src/lib/groupAccess.ts)가 한다. 렛커 서버는 사용자의 신청 내역(programApplications)만 내려준다.
--
-- program_title, program_start_date, program_end_date 는 어드민 목록 표시용이다. 판정에는 쓰지 않는다.
-- 판정은 서버가 내려준 신청 내역의 날짜를 쓰므로, 프로그램 일정이 바뀌어도 판정이 따라간다.
--
-- grace_days 상한 365 는 서버가 신청 내역을 "종료일이 365일 이내이거나 미래인 것"만 내려주기 때문이다.
-- 이보다 크게 잡아도 서버 응답에 신청이 없어 통과하지 못한다.

CREATE TABLE IF NOT EXISTS group_access_rules (
  id BIGSERIAL PRIMARY KEY,
  program_type TEXT NOT NULL CHECK (program_type IN ('CHALLENGE', 'LIVE')),
  program_id BIGINT NOT NULL,
  program_title TEXT NOT NULL DEFAULT '',
  program_start_date TIMESTAMPTZ NOT NULL,
  program_end_date TIMESTAMPTZ NOT NULL,
  -- 비어 있으면 전체 플랜. LIVE 는 플랜이 없어 항상 빈 배열이다.
  plan_types TEXT[] NOT NULL DEFAULT '{}',
  grace_days INT NOT NULL DEFAULT 0 CHECK (grace_days BETWEEN 0 AND 365),
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS 비활성화 (API Routes에서 인증 처리). 다른 어드민 관리 테이블(allowed_users 등)과 같다.
ALTER TABLE group_access_rules DISABLE ROW LEVEL SECURITY;
