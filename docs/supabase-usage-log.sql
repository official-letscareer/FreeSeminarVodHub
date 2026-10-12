-- VOD 사이트 이용 로그 테이블. Supabase SQL Editor 에서 한 번 실행한다. 여러 번 실행해도 안전하다(멱등).
-- 이 테이블이 없어도 사이트는 정상 동작한다. 로그 저장만 실패하고(서버 로그에만 남음) 재생·목록에는 영향이 없다.
--
-- 저장하는 것: 어떤 영상을 언제 재생·일시정지·종료했는지, 어디까지 봤는지, 누적 시청 시간,
--              어떤 페이지를 열고 얼마나 머물렀는지, 이용권 활성화 안내 노출·결과.
-- 저장하지 않는 것: 전화번호 원문, IP 주소. 브라우저는 이름·전화번호·키를 서버로 보내지 않는다.
--
-- 식별(user_name, user_key)은 서버가 만든다.
--   SSO 로그인         : user_name = SSO 프로필 이름, user_key = HMAC-SHA256(서버 비밀키, 'sso:' + 이름) 앞 32자
--   이름+전화번호 등   : 로그인 성공 시 서버가 심은 서명 쿠키(vod_log_id)의 이름과 키. 서명 검증에 실패하면 NULL.
--                        user_key = HMAC-SHA256(서버 비밀키, 'phone:' + 이름 + ':' + 전화번호) 앞 32자
--   서버 비밀키(환경변수 USAGE_LOG_HASH_SECRET)가 없으면 user_name, user_key 모두 NULL 이다(세션 단위 익명 로그).
--   user_key 는 비밀키 없이는 되돌릴 수 없다. 비밀키가 유출되면 전화번호 후보(010 + 8자리)를 대입해
--   역산할 수 있으므로 비밀키는 서버 환경변수로만 두고 NEXT_PUBLIC_* 로 노출하지 않는다.
--
-- 접근 제어(중요): 이 테이블은 RLS 를 켜고 anon, authenticated 에 INSERT 만 허용한다. SELECT 정책이 없어서
-- 공개 키(NEXT_PUBLIC_*)로는 로그를 읽을 수 없다. 로그는 Supabase 대시보드(Table Editor, SQL Editor)에서 본다.
-- 기존 테이블(vods, allowed_users 등)이 RLS 를 꺼 둔 방식과 다르다. 이용자 이름이 들어가는 테이블이라 일부러 다르게 했다.
--
-- 남는 위험:
--   - 공개 키를 아는 사람은 형식에 맞는 가짜 로그를 넣을 수 있다. 아래 CHECK 제약은 값의 형식과
--     크기만 막는다. 로그는 분석용이며 감사 증적이 아니다.
--   - 식별 쿠키가 서명돼 있어 위조는 막지만, 쿠키를 훔치면 그 사용자로 기록될 수 있다.

CREATE TABLE IF NOT EXISTS vod_usage_logs (
  id           BIGSERIAL PRIMARY KEY,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),   -- 서버가 받은 시각
  occurred_at  TIMESTAMPTZ NOT NULL,                 -- 브라우저에서 이벤트가 발생한 시각
  session_id   TEXT        NOT NULL,                 -- 브라우저 탭 단위 임의 ID (sessionStorage)
  auth_method  TEXT        NOT NULL,                 -- 'sso' | 'verified'(이름+전화번호·예외·프리미엄 명단)
  user_name    TEXT,                                 -- SSO 프로필 이름 / 이름+전화번호 로그인 시 서버가 서명 쿠키에 담은 이름. 비밀키 미설정·서명 실패 시 verified 는 NULL
  user_key     TEXT,                                 -- 서버 비밀키 HMAC-SHA256 앞 32자. 비밀키 미설정·서명 실패 시 NULL
  event_type   TEXT        NOT NULL,                 -- page_view, video_play 등 (아래 목록)
  vod_id       BIGINT,                               -- vods.id
  youtube_id   TEXT,
  page_path    TEXT,                                 -- /vod, /vod/12
  position_sec NUMERIC(10, 1),                       -- 이벤트 시점의 재생 위치(초)
  duration_sec NUMERIC(10, 1),                       -- 영상 전체 길이(초)
  watched_sec  NUMERIC(10, 1),                       -- 이 화면에서 누적 실제 재생 시간(초). 되감기·건너뛰기는 포함하지 않는다
  detail       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  user_agent   TEXT
);

-- event_type 값
--   page_view            페이지를 열었다 (/vod, /vod/[id])
--   page_leave           페이지를 떠났다. detail.dwell_sec = 머문 시간
--   video_ready          플레이어가 준비됐다
--   video_play           재생을 시작했다
--   video_pause          일시정지했다
--   video_ended          끝까지 재생했다
--   video_seek           위치를 옮겼다. detail.from_sec, detail.to_sec, detail.method(skip|scrub)
--   video_rate_change    배속을 바꿨다. detail.rate
--   video_fullscreen     전체화면을 켜거나 껐다. detail.on
--   video_progress       재생 중 30초마다 남기는 진행 기록
--   video_leave          영상 화면을 떠났다(마지막 위치와 누적 시청 시간)
--   pass_prompt_shown    이용권 활성화 안내를 보여줬다
--   pass_activated       이용권을 활성화했다
--   pass_activate_failed 이용권 활성화에 실패했다. detail.status

-- 입력 형식 제약. 이미 테이블이 있어도 다시 실행해 갱신할 수 있다(DROP 후 ADD).
-- NULL 은 길이·범위 검사를 통과한다(NULL 허용 컬럼).
ALTER TABLE vod_usage_logs DROP CONSTRAINT IF EXISTS vod_usage_logs_chk_event_type;
ALTER TABLE vod_usage_logs ADD CONSTRAINT vod_usage_logs_chk_event_type CHECK (event_type IN (
  'page_view', 'page_leave', 'video_ready', 'video_play', 'video_pause', 'video_ended', 'video_seek',
  'video_rate_change', 'video_fullscreen', 'video_progress', 'video_leave',
  'pass_prompt_shown', 'pass_activated', 'pass_activate_failed'
));

ALTER TABLE vod_usage_logs DROP CONSTRAINT IF EXISTS vod_usage_logs_chk_auth_method;
ALTER TABLE vod_usage_logs ADD CONSTRAINT vod_usage_logs_chk_auth_method
  CHECK (auth_method IN ('sso', 'verified'));

ALTER TABLE vod_usage_logs DROP CONSTRAINT IF EXISTS vod_usage_logs_chk_lengths;
ALTER TABLE vod_usage_logs ADD CONSTRAINT vod_usage_logs_chk_lengths CHECK (
  char_length(session_id) BETWEEN 1 AND 64
  AND char_length(user_name) <= 100
  AND char_length(user_key) <= 64
  AND char_length(youtube_id) <= 20
  AND char_length(page_path) <= 200
  AND char_length(user_agent) <= 200
);

ALTER TABLE vod_usage_logs DROP CONSTRAINT IF EXISTS vod_usage_logs_chk_numbers;
ALTER TABLE vod_usage_logs ADD CONSTRAINT vod_usage_logs_chk_numbers CHECK (
  (vod_id IS NULL OR vod_id > 0)
  AND (position_sec IS NULL OR position_sec BETWEEN 0 AND 86400)
  AND (duration_sec IS NULL OR duration_sec BETWEEN 0 AND 86400)
  AND (watched_sec IS NULL OR watched_sec BETWEEN 0 AND 86400)
);

ALTER TABLE vod_usage_logs DROP CONSTRAINT IF EXISTS vod_usage_logs_chk_detail;
ALTER TABLE vod_usage_logs ADD CONSTRAINT vod_usage_logs_chk_detail
  CHECK (jsonb_typeof(detail) = 'object' AND pg_column_size(detail) <= 2048);

CREATE INDEX IF NOT EXISTS idx_vod_usage_logs_occurred ON vod_usage_logs (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_vod_usage_logs_vod_event ON vod_usage_logs (vod_id, event_type);
CREATE INDEX IF NOT EXISTS idx_vod_usage_logs_session ON vod_usage_logs (session_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_vod_usage_logs_user ON vod_usage_logs (user_key);

ALTER TABLE vod_usage_logs ENABLE ROW LEVEL SECURITY;

-- anon 은 INSERT 만 가능하다. 이미 같은 이름의 정책이 있으면 지우고 다시 만든다.
-- 공개 키를 아는 사람은 형식에 맞는 가짜 로그를 넣을 수 있다. 로그는 분석용이며 감사 증적이 아니다.
-- (서비스 롤 키로 서버에서만 쓰게 하면 막을 수 있지만, 그 키는 전 테이블의 RLS 를 우회하므로 앱에 두지 않기로 했다.)
DROP POLICY IF EXISTS vod_usage_logs_insert_only ON vod_usage_logs;
CREATE POLICY vod_usage_logs_insert_only ON vod_usage_logs
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- ───────────── 아래는 조회 예시. 대시보드 SQL Editor 에서 필요할 때 실행한다 ─────────────

-- 영상별 재생 횟수, 시청자 수, 평균 누적 시청 시간
-- SELECT vod_id,
--        COUNT(*) FILTER (WHERE event_type = 'video_play')                 AS 재생_이벤트,
--        COUNT(DISTINCT COALESCE(user_key, session_id))                    AS 시청자,
--        ROUND(AVG(watched_sec) FILTER (WHERE event_type = 'video_leave'), 0) AS 평균_시청초
-- FROM vod_usage_logs
-- WHERE vod_id IS NOT NULL
-- GROUP BY vod_id ORDER BY 재생_이벤트 DESC;

-- 한 사용자 세션의 시간순 흐름
-- SELECT occurred_at, event_type, vod_id, position_sec, watched_sec, detail
-- FROM vod_usage_logs WHERE session_id = '여기에-세션ID' ORDER BY occurred_at;

-- 180일 지난 로그 정리(주기적으로 직접 실행)
-- DELETE FROM vod_usage_logs WHERE occurred_at < NOW() - INTERVAL '180 days';
