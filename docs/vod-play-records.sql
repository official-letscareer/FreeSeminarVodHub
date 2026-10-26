-- VOD 재생 기록 테이블과 기록·조회 함수 (LC-3507). Supabase SQL Editor 에서 사람이 직접 실행한다.
-- 이 레포는 실행하지 않는다. 여러 번 실행해도 안전하다(멱등).
--
-- 무엇에 쓰나
--   렛츠커리어 VOD 이용권 환불 판정. "이용권 기간 중 재생 기록이 없으면 100% 환불, 있으면 환불 불가"다.
--   렛츠커리어 서버가 허브의 /api/internal/play-records 를 불러 이 기록을 본다.
--
-- 무엇을 재생으로 보나
--   허브 서버가 SSO 사용자에게 영상 재생 정보(GET /api/vod/{id})를 내려준 시점. 브라우저가 보내는 사용 로그
--   (vod_usage_logs)는 전송을 막을 수 있고 사용자 구분이 이름 해시라 쓰지 않는다.
--   user_id 는 렛츠커리어 사용자 번호(SSO 프로필의 userId)다. 이름+전화번호 로그인은 기록하지 않는다.
--
-- 보안 모델 (docs/group-access-rules.sql 과 같다)
--   - vod_play_records, vod_play_records_admin 은 RLS 를 켜고 정책을 만들지 않는다. anon 은 읽지도 쓰지도 못한다.
--   - 아래 함수 2개로만 접근한다. 함수는 첫 줄에서 토큰을 확인한다. 토큰의 SHA-256 해시가
--     vod_play_records_admin.token_hash 와 같아야 하고, 아니면 SQLSTATE 42501 오류가 난다.
--   - 토큰은 허브 서버 환경변수 VOD_PLAY_RECORD_TOKEN 에만 둔다. NEXT_PUBLIC_* 로 노출하지 않는다.
--
-- 남는 위험
--   - 토큰이 유출되면 가짜 재생 기록을 넣어 남의 환불을 막을 수 있다. 의심되면 아래 절차로 바로 교체한다.
--   - 허브가 기록에 실패해도 영상은 내려준다(시청을 막지 않는다). 그동안 본 영상은 기록되지 않는다.
--
-- 토큰 등록과 교체
--   1) 로컬 터미널에서 토큰을 만든다.        TOKEN=$(openssl rand -hex 32)
--   2) 같은 터미널에서 해시를 구한다.          printf '%s' "$TOKEN" | shasum -a 256
--      출력 앞의 64자 16진수가 해시다. 평문 토큰은 SQL Editor 에 붙여 넣지 않는다.
--   3) 허브 서버 환경변수 VOD_PLAY_RECORD_TOKEN 에 1)의 토큰(평문)을 설정하고 재배포한다.
--   4) 이 파일 맨 아래 INSERT 의 <TOKEN_SHA256> 을 2)의 해시로 바꿔 실행한다. 교체할 때도 같은 INSERT 를 다시 실행한다.

CREATE TABLE IF NOT EXISTS vod_play_records (
  id         BIGSERIAL   PRIMARY KEY,
  user_id    BIGINT      NOT NULL CHECK (user_id > 0),
  vod_id     BIGINT      NOT NULL CHECK (vod_id > 0),
  played_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vod_play_records_user_played ON vod_play_records (user_id, played_at);

CREATE TABLE IF NOT EXISTS vod_play_records_admin (
  id         SMALLINT    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  token_hash TEXT        NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE vod_play_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE vod_play_records_admin ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE vod_play_records FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE vod_play_records_id_seq FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE vod_play_records_admin FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION vod_play_records_check_token(p_token TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_token IS NULL OR p_token = '' OR NOT EXISTS (
    SELECT 1
    FROM vod_play_records_admin r
    WHERE lower(btrim(r.token_hash)) = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION vod_play_record_add(p_token TEXT, p_user_id BIGINT, p_vod_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM vod_play_records_check_token(p_token);
  IF p_user_id IS NULL OR p_user_id <= 0 OR p_vod_id IS NULL OR p_vod_id <= 0 THEN
    RAISE EXCEPTION 'invalid argument' USING ERRCODE = '22023';
  END IF;
  INSERT INTO vod_play_records (user_id, vod_id) VALUES (p_user_id, p_vod_id);
END;
$$;

-- p_since 이후 재생 시각을 오래된 순으로 돌려준다. 환불 판정은 "있는지"만 보므로 최대 1000건으로 자른다.
CREATE OR REPLACE FUNCTION vod_play_records_since(p_token TEXT, p_user_id BIGINT, p_since TIMESTAMPTZ)
RETURNS TABLE (played_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM vod_play_records_check_token(p_token);
  IF p_user_id IS NULL OR p_user_id <= 0 OR p_since IS NULL THEN
    RAISE EXCEPTION 'invalid argument' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
    SELECT r.played_at FROM vod_play_records r
    WHERE r.user_id = p_user_id AND r.played_at >= p_since
    ORDER BY r.played_at
    LIMIT 1000;
END;
$$;

REVOKE ALL ON FUNCTION vod_play_records_check_token(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION vod_play_record_add(TEXT, BIGINT, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION vod_play_record_add(TEXT, BIGINT, BIGINT) TO anon, authenticated;
REVOKE ALL ON FUNCTION vod_play_records_since(TEXT, BIGINT, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION vod_play_records_since(TEXT, BIGINT, TIMESTAMPTZ) TO anon, authenticated;

-- 토큰 해시 등록(교체 시에도 다시 실행). <TOKEN_SHA256> 을 바꾼 뒤 실행한다.
-- INSERT INTO vod_play_records_admin (id, token_hash) VALUES (1, '<TOKEN_SHA256>')
--   ON CONFLICT (id) DO UPDATE SET token_hash = EXCLUDED.token_hash, updated_at = NOW();
