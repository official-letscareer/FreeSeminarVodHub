-- 그룹 접근 규칙을 프로그램 번호로 직접 등록할 수 있게 한다. 이미 docs/group-access-rules.sql 을 실행한 DB 용이다.
-- Supabase SQL Editor 에서 사람이 직접 실행한다. 이 레포는 실행하지 않는다. 여러 번 실행해도 안전하다(멱등).
-- 새로 설치하는 DB 는 docs/group-access-rules.sql 에 이미 반영돼 있어 이 파일을 실행하지 않아도 된다.
--
-- 왜 필요한가
--   비공개 프로그램은 공개 프로그램 검색에 나오지 않아 시작일·종료일을 알 수 없다.
--   program_start_date, program_end_date 는 어드민 목록 표시용이고 판정에는 쓰지 않는다
--   (판정은 서버가 내려준 신청 내역의 날짜를 쓴다). 그래서 종류+번호+플랜+N 만으로 규칙을 만들고,
--   두 날짜는 NULL 로 둔다.
--
-- 함수는 바꾸지 않는다
--   group_access_rules_add 는 p_program_start_date, p_program_end_date 를 검사 없이 그대로 INSERT 하고,
--   group_access_rules_list 는 SELECT * 로 돌려준다. 컬럼이 NULL 을 받으면 두 함수 모두 그대로 동작한다.
--
-- 되돌리기
--   NULL 인 행이 있으면 NOT NULL 을 다시 걸 수 없다. 되돌리려면 그 규칙을 먼저 지운다.

ALTER TABLE group_access_rules
  ALTER COLUMN program_start_date DROP NOT NULL,
  ALTER COLUMN program_end_date DROP NOT NULL;
