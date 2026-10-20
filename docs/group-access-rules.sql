-- 그룹 접근 규칙 테이블과 조회·변경 함수. Supabase SQL Editor 에서 사람이 직접 실행한다. 이 레포는 실행하지 않는다.
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
--
-- 왜 함수인가
--   허브는 공개 키(NEXT_PUBLIC_*)로 Supabase 에 붙는다. 테이블의 RLS 를 꺼 두면 공개 키를 아는 누구나 REST 로
--   규칙을 INSERT 해 자기 접근을 열 수 있다. 그래서 테이블은 RLS 를 켜고 정책을 만들지 않아 anon 이 직접
--   읽지도 쓰지도 못하게 하고, 아래 함수 4개로만 접근한다. 함수는 비밀 토큰을 확인한다.
--   서비스 롤 키는 전 테이블의 RLS 를 우회해 유출 시 피해가 커서 앱에 두지 않는다.
--
-- 보안 모델
--   - 함수는 anon 에게 열려 있지만, 첫 줄에서 group_access_rules_check_token 이 토큰을 확인한다.
--     토큰의 SHA-256 해시가 group_access_rules_admin.token_hash 와 같아야 하고, 아니면 SQLSTATE 42501(forbidden) 오류가 난다.
--   - group_access_rules, group_access_rules_admin 은 RLS 를 켜고 정책을 만들지 않는다. anon 은 읽지도 쓰지도 못한다.
--   - 함수는 입력을 다시 검증한다(program_type, grace_days 0~365). 허브 API 의 검증을 우회해 직접 호출해도 같은 제한이 걸린다.
--   - 토큰은 서버 환경변수 GROUP_ACCESS_RULES_TOKEN 에만 둔다. NEXT_PUBLIC_* 로 노출하지 않는다.
--     목록 함수는 VOD 접근 판정(서버)도 부르므로, 판정 경로도 이 토큰을 쓴다.
--
-- 남는 위험
--   - 공개 키를 아는 사람은 이 함수를 직접 호출해 토큰을 추측해 볼 수 있다. 호출 횟수 제한은 없고, 방어는 토큰의
--     길이(64자 16진수, 256비트)에만 의존한다. 아래 안내대로 openssl rand -hex 32 로 만든 토큰이면 현실적으로 추측할
--     수 없다. 짧거나 사람이 지은 토큰을 쓰면 이 방어가 무너진다.
--   - 토큰이 유출되면 누구나 규칙을 만들어 VOD 접근을 열 수 있다. 의심되면 아래 절차로 바로 교체한다.
--   - 해시 비교는 상수 시간 비교가 아니다. 해시값만 비교하므로 타이밍으로 토큰을 알아내기는 현실적으로 어렵다.
--
-- 토큰 등록과 교체
--   1) 로컬 터미널에서 토큰을 만든다.        TOKEN=$(openssl rand -hex 32)
--   2) 같은 터미널에서 해시를 구한다.          printf '%s' "$TOKEN" | shasum -a 256
--      출력 앞의 64자 16진수가 해시다(뒤의 '-' 는 제외한다). 평문 토큰은 SQL Editor 에 붙여 넣지 않는다.
--   3) 서버 환경변수 GROUP_ACCESS_RULES_TOKEN 에 1)의 토큰(평문)을 설정하고 재배포한다.
--   4) 아래 등록 SQL 의 주석을 풀고 <해시> 자리에 2)의 해시를 넣어 실행한다. 행은 하나만 유지한다.
--      교체할 때도 같은 SQL 을 다시 실행한다(기존 행을 지우고 새로 넣는다). 이전 토큰은 그 즉시 막힌다.
--
--   등록 SQL(주석을 풀어서 실행한다)
--     DELETE FROM group_access_rules_admin;
--     INSERT INTO group_access_rules_admin (token_hash) VALUES ('<해시>');
--
--   등록을 지우면(DELETE FROM group_access_rules_admin;) 모든 호출이 42501 로 막힌다. 규칙 조회가 막혀도
--   VOD 접근 판정은 기존 판정 결과를 그대로 쓴다(규칙으로 통과하는 사람만 막힌다).

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

-- 정책을 만들지 않는다. RLS 가 켜져 있으므로 anon, authenticated 는 읽지도 쓰지도 못한다.
-- SECURITY DEFINER 함수는 테이블 소유자로 실행돼 RLS 를 거치지 않는다.
ALTER TABLE group_access_rules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE group_access_rules FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE group_access_rules_id_seq FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS group_access_rules_admin (
  token_hash TEXT        NOT NULL,   -- 토큰의 SHA-256 해시(소문자 16진수 64자)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE group_access_rules_admin ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE group_access_rules_admin FROM PUBLIC, anon, authenticated;

-- 내부 함수. 토큰을 확인한다. 외부에서 직접 호출할 수 없다.
CREATE OR REPLACE FUNCTION group_access_rules_check_token(p_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF p_token IS NULL OR p_token = '' OR NOT EXISTS (
    SELECT 1
    FROM group_access_rules_admin r
    WHERE lower(btrim(r.token_hash)) = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION group_access_rules_check_token(text) FROM PUBLIC, anon, authenticated;

-- 내부 함수. 입력을 검증한다. 테이블 CHECK 와 같은 제한을 함수 단계에서 먼저 걸어 오류 코드를 22023 으로 맞춘다.
CREATE OR REPLACE FUNCTION group_access_rules_check_input(p_program_type text, p_grace_days integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF p_program_type IS NOT NULL AND p_program_type NOT IN ('CHALLENGE', 'LIVE') THEN
    RAISE EXCEPTION 'invalid program_type' USING ERRCODE = '22023';
  END IF;
  IF p_grace_days IS NULL OR p_grace_days < 0 OR p_grace_days > 365 THEN
    RAISE EXCEPTION 'invalid grace_days' USING ERRCODE = '22023';
  END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION group_access_rules_check_input(text, integer) FROM PUBLIC, anon, authenticated;

-- 1. 목록. 최신순으로 모든 행을 돌려준다.
CREATE OR REPLACE FUNCTION group_access_rules_list(p_token text)
RETURNS SETOF group_access_rules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  PERFORM group_access_rules_check_token(p_token);
  RETURN QUERY
    SELECT * FROM group_access_rules ORDER BY created_at DESC, id DESC;
END;
$fn$;

REVOKE ALL ON FUNCTION group_access_rules_list(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION group_access_rules_list(text) TO anon, authenticated;

-- 2. 등록. 저장된 행을 돌려준다.
CREATE OR REPLACE FUNCTION group_access_rules_add(
  p_token              text,
  p_program_type       text,
  p_program_id         bigint,
  p_program_title      text,
  p_program_start_date timestamptz,
  p_program_end_date   timestamptz,
  p_plan_types         text[],
  p_grace_days         integer,
  p_memo               text
)
RETURNS group_access_rules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_row group_access_rules;
BEGIN
  PERFORM group_access_rules_check_token(p_token);
  IF p_program_type IS NULL THEN
    RAISE EXCEPTION 'invalid program_type' USING ERRCODE = '22023';
  END IF;
  PERFORM group_access_rules_check_input(p_program_type, p_grace_days);

  INSERT INTO group_access_rules (
    program_type, program_id, program_title, program_start_date, program_end_date,
    plan_types, grace_days, memo
  )
  VALUES (
    p_program_type, p_program_id, COALESCE(p_program_title, ''), p_program_start_date, p_program_end_date,
    COALESCE(p_plan_types, '{}'), p_grace_days, p_memo
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$fn$;

REVOKE ALL ON FUNCTION group_access_rules_add(text, text, bigint, text, timestamptz, timestamptz, text[], integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION group_access_rules_add(text, text, bigint, text, timestamptz, timestamptz, text[], integer, text) TO anon, authenticated;

-- 3. 수정. 플랜·N·메모만 바꾼다. 프로그램은 바꾸지 않는다(다른 프로그램이면 규칙을 새로 만든다).
--    세 값을 모두 받아 그대로 덮어쓴다. 메모를 비우려면 p_memo 에 null 을 넘긴다.
CREATE OR REPLACE FUNCTION group_access_rules_update(
  p_token      text,
  p_id         bigint,
  p_plan_types text[],
  p_grace_days integer,
  p_memo       text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  PERFORM group_access_rules_check_token(p_token);
  PERFORM group_access_rules_check_input(NULL, p_grace_days);

  UPDATE group_access_rules
  SET plan_types = COALESCE(p_plan_types, '{}'),
      grace_days = p_grace_days,
      memo       = p_memo
  WHERE id = p_id;
END;
$fn$;

REVOKE ALL ON FUNCTION group_access_rules_update(text, bigint, text[], integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION group_access_rules_update(text, bigint, text[], integer, text) TO anon, authenticated;

-- 4. 삭제.
CREATE OR REPLACE FUNCTION group_access_rules_delete(p_token text, p_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  PERFORM group_access_rules_check_token(p_token);
  DELETE FROM group_access_rules WHERE id = p_id;
END;
$fn$;

REVOKE ALL ON FUNCTION group_access_rules_delete(text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION group_access_rules_delete(text, bigint) TO anon, authenticated;
