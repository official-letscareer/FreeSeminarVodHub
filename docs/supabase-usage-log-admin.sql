-- VOD 이용 로그 어드민 조회용 SQL 함수. Supabase SQL Editor 에서 실행한다. 여러 번 실행해도 안전하다(멱등).
-- 먼저 docs/supabase-usage-log.sql 로 vod_usage_logs 테이블을 만들어 둬야 한다(vods 테이블도 필요하다).
--
-- 왜 함수인가
--   vod_usage_logs 는 RLS 가 켜져 있고 anon 에 INSERT 만 허용돼 공개 키(NEXT_PUBLIC_*)로는 읽을 수 없다.
--   어드민 화면(/admin/vod/usage)이 읽을 수 있도록, 아래 함수 3개가 집계 결과와 최근 목록만 돌려준다.
--   서비스 롤 키는 전 테이블의 RLS 를 우회해 유출 시 피해가 커서 앱에 두지 않는다. 대신 함수가 비밀 토큰을 확인한다.
--
-- 보안 모델
--   - 함수는 anon 에게 열려 있지만, 첫 줄에서 vod_usage_check_token 이 토큰을 확인한다.
--     토큰의 SHA-256 해시가 vod_usage_log_reader.token_hash 와 같아야 하고, 아니면 SQLSTATE 42501(forbidden) 오류가 난다.
--   - vod_usage_log_reader 는 RLS 를 켜고 정책을 만들지 않는다. anon 은 읽지도 쓰지도 못한다.
--   - 이 함수들은 집계와 최근 목록(최대 200건)만 돌려준다. 원본 전체를 내보내지 않는다.
--     user_agent 는 돌려주지 않는다. user_key 는 사용자 목록에서만, 구분용으로 돌려준다.
--   - 토큰은 서버 환경변수 USAGE_LOG_READ_TOKEN 에만 둔다. NEXT_PUBLIC_* 로 노출하지 않는다.
--
-- 남는 위험
--   - 공개 키를 아는 사람은 이 함수를 직접 호출해 토큰을 추측해 볼 수 있다. 호출 횟수 제한은 없고, 방어는 토큰의
--     길이(64자 16진수, 256비트)에만 의존한다. 아래 안내대로 openssl rand -hex 32 로 만든 토큰이면 현실적으로 추측할
--     수 없다. 짧거나 사람이 지은 토큰을 쓰면 이 방어가 무너진다.
--   - 토큰이 유출되면 누구나 집계와 최근 200건(사용자 이름 포함)을 읽을 수 있다. 의심되면 아래 절차로 바로 교체한다.
--   - 해시 비교는 상수 시간 비교가 아니다. 해시값만 비교하므로 타이밍으로 토큰을 알아내기는 현실적으로 어렵다.
--
-- 토큰 등록과 교체
--   1) 로컬 터미널에서 토큰을 만든다.        TOKEN=$(openssl rand -hex 32)
--   2) 같은 터미널에서 해시를 구한다.          printf '%s' "$TOKEN" | shasum -a 256
--      출력 앞의 64자 16진수가 해시다(뒤의 '-' 는 제외한다). 평문 토큰은 SQL Editor 에 붙여 넣지 않는다.
--   3) 서버 환경변수 USAGE_LOG_READ_TOKEN 에 1)의 토큰(평문)을 설정하고 재배포한다.
--   4) 아래 등록 SQL 의 주석을 풀고 <해시> 자리에 2)의 해시를 넣어 실행한다. 행은 하나만 유지한다.
--      교체할 때도 같은 SQL 을 다시 실행한다(기존 행을 지우고 새로 넣는다). 이전 토큰은 그 즉시 막힌다.
--
--   등록 SQL(주석을 풀어서 실행한다)
--     DELETE FROM vod_usage_log_reader;
--     INSERT INTO vod_usage_log_reader (token_hash) VALUES ('<해시>');
--
--   등록을 지우면(DELETE FROM vod_usage_log_reader;) 모든 호출이 42501 로 막힌다. 조회를 끄는 방법이다.
--
-- 반환 형태는 각 함수 앞의 주석을 본다. 시각은 timestamptz(ISO 8601)이고 날짜는 Asia/Seoul 기준이다.
-- 모든 집계는 video_leave 의 watched_sec 를 시청 시간으로 쓴다. 탭 강제 종료처럼 video_leave 가 없는 시청은 빠진다.

CREATE TABLE IF NOT EXISTS vod_usage_log_reader (
  token_hash TEXT        NOT NULL,   -- 토큰의 SHA-256 해시(소문자 16진수 64자)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 정책을 만들지 않는다. RLS 가 켜져 있으므로 anon, authenticated 는 읽지도 쓰지도 못한다.
-- SECURITY DEFINER 함수는 테이블 소유자로 실행돼 RLS 를 거치지 않는다.
ALTER TABLE vod_usage_log_reader ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE vod_usage_log_reader FROM PUBLIC, anon, authenticated;

-- 내부 함수. 토큰을 확인한다. 외부에서 직접 호출할 수 없다.
CREATE OR REPLACE FUNCTION vod_usage_check_token(p_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF p_token IS NULL OR p_token = '' OR NOT EXISTS (
    SELECT 1
    FROM vod_usage_log_reader r
    WHERE lower(btrim(r.token_hash)) = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION vod_usage_check_token(text) FROM PUBLIC, anon, authenticated;

-- 1. 요약
--   vod_usage_summary(p_token, p_days)   p_days 는 1~180 으로 보정한다. 기본 30.
--   {
--     "days": 보정된 기간(일),
--     "generated_at": 생성 시각,
--     "totals": {
--       "sessions":    방문 세션 수(모든 이벤트의 session_id distinct),
--       "viewers":     시청자 수(video_play 또는 video_leave 가 있는 행의 COALESCE(user_key, session_id) distinct),
--       "plays":       video_play 수,
--       "views":       video_leave 수(영상 화면을 열었다 떠난 횟수),
--       "watched_min": video_leave 의 watched_sec 합(분, 반올림)
--     },
--     "vods": [ 최대 50개, plays 내림차순. 영상이 삭제돼 vods 에 없으면 title 은 null
--       { "vod_id", "title", "plays", "viewers", "views", "ended",
--         "avg_watched_sec": video_leave 의 watched_sec 평균(초, 반올림, 없으면 null),
--         "total_watched_min": video_leave 의 watched_sec 합(분, 반올림),
--         "avg_exit_pct": video_leave 의 position_sec / duration_sec 평균 x 100(duration_sec > 0 인 것만, 없으면 null) }
--     ],
--     "daily": [ 최대 p_days 개, 최신순. date 는 Asia/Seoul 기준 YYYY-MM-DD
--       { "date", "sessions", "plays", "watched_min" }
--     ],
--     "pass": { "prompt_shown", "activated", "failed" }   이용권 활성화 안내 노출, 성공, 실패 이벤트 수
--   }
--   기간은 NOW() 에서 p_days 일을 뺀 시각부터다. 가장 오래된 날짜는 하루 전체가 아닐 수 있다.
CREATE OR REPLACE FUNCTION vod_usage_summary(p_token text, p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_days   integer;
  v_since  timestamptz;
  v_totals jsonb;
  v_vods   jsonb;
  v_daily  jsonb;
  v_pass   jsonb;
BEGIN
  PERFORM vod_usage_check_token(p_token);

  v_days  := LEAST(GREATEST(COALESCE(p_days, 30), 1), 180);
  v_since := NOW() - make_interval(days => v_days);

  SELECT jsonb_build_object(
           'sessions',    COUNT(DISTINCT l.session_id),
           'viewers',     COUNT(DISTINCT COALESCE(l.user_key, l.session_id))
                            FILTER (WHERE l.event_type IN ('video_play', 'video_leave')),
           'plays',       COUNT(*) FILTER (WHERE l.event_type = 'video_play'),
           'views',       COUNT(*) FILTER (WHERE l.event_type = 'video_leave'),
           'watched_min', COALESCE(ROUND(SUM(l.watched_sec) FILTER (WHERE l.event_type = 'video_leave') / 60), 0)
         )
  INTO v_totals
  FROM vod_usage_logs l
  WHERE l.occurred_at >= v_since;

  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'vod_id',            t.vod_id,
               'title',             t.title,
               'plays',             t.plays,
               'viewers',           t.viewers,
               'views',             t.views,
               'ended',             t.ended,
               'avg_watched_sec',   t.avg_watched_sec,
               'total_watched_min', t.total_watched_min,
               'avg_exit_pct',      t.avg_exit_pct
             )
             ORDER BY t.plays DESC, t.vod_id
           ),
           '[]'::jsonb
         )
  INTO v_vods
  FROM (
    SELECT l.vod_id,
           v.title,
           COUNT(*) FILTER (WHERE l.event_type = 'video_play') AS plays,
           COUNT(DISTINCT COALESCE(l.user_key, l.session_id))
             FILTER (WHERE l.event_type IN ('video_play', 'video_leave')) AS viewers,
           COUNT(*) FILTER (WHERE l.event_type = 'video_leave') AS views,
           COUNT(*) FILTER (WHERE l.event_type = 'video_ended') AS ended,
           ROUND(AVG(l.watched_sec) FILTER (WHERE l.event_type = 'video_leave')) AS avg_watched_sec,
           COALESCE(ROUND(SUM(l.watched_sec) FILTER (WHERE l.event_type = 'video_leave') / 60), 0) AS total_watched_min,
           ROUND(AVG(l.position_sec / NULLIF(l.duration_sec, 0))
             FILTER (WHERE l.event_type = 'video_leave' AND l.duration_sec > 0) * 100) AS avg_exit_pct
    FROM vod_usage_logs l
    LEFT JOIN vods v ON v.id = l.vod_id
    WHERE l.vod_id IS NOT NULL
      AND l.occurred_at >= v_since
    GROUP BY l.vod_id, v.title
    ORDER BY COUNT(*) FILTER (WHERE l.event_type = 'video_play') DESC, l.vod_id
    LIMIT 50
  ) t;

  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'date',        t.log_date,
               'sessions',    t.sessions,
               'plays',       t.plays,
               'watched_min', t.watched_min
             )
             ORDER BY t.log_date DESC
           ),
           '[]'::jsonb
         )
  INTO v_daily
  FROM (
    SELECT to_char(l.occurred_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') AS log_date,
           COUNT(DISTINCT l.session_id) AS sessions,
           COUNT(*) FILTER (WHERE l.event_type = 'video_play') AS plays,
           COALESCE(ROUND(SUM(l.watched_sec) FILTER (WHERE l.event_type = 'video_leave') / 60), 0) AS watched_min
    FROM vod_usage_logs l
    WHERE l.occurred_at >= v_since
    GROUP BY to_char(l.occurred_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD')
    ORDER BY log_date DESC
    LIMIT v_days
  ) t;

  SELECT jsonb_build_object(
           'prompt_shown', COUNT(*) FILTER (WHERE l.event_type = 'pass_prompt_shown'),
           'activated',    COUNT(*) FILTER (WHERE l.event_type = 'pass_activated'),
           'failed',       COUNT(*) FILTER (WHERE l.event_type = 'pass_activate_failed')
         )
  INTO v_pass
  FROM vod_usage_logs l
  WHERE l.occurred_at >= v_since;

  RETURN jsonb_build_object(
    'days',         v_days,
    'generated_at', NOW(),
    'totals',       v_totals,
    'vods',         v_vods,
    'daily',        v_daily,
    'pass',         v_pass
  );
END;
$fn$;

REVOKE ALL ON FUNCTION vod_usage_summary(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION vod_usage_summary(text, integer) TO anon, authenticated;

-- 2. 최근 이벤트
--   vod_usage_recent(p_token, p_limit)   p_limit 은 1~200 으로 보정한다. 기본 100.
--   {
--     "events": [ 최신순
--       { "occurred_at", "event_type", "vod_id", "vod_title"(vods 에 없으면 null), "page_path",
--         "position_sec", "duration_sec", "watched_sec", "user_name"(익명이면 null),
--         "auth_method", "session_id", "detail" }
--     ]
--   }
CREATE OR REPLACE FUNCTION vod_usage_recent(p_token text, p_limit integer DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_limit  integer;
  v_events jsonb;
BEGIN
  PERFORM vod_usage_check_token(p_token);

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 200);

  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'occurred_at',  t.occurred_at,
               'event_type',   t.event_type,
               'vod_id',       t.vod_id,
               'vod_title',    t.vod_title,
               'page_path',    t.page_path,
               'position_sec', t.position_sec,
               'duration_sec', t.duration_sec,
               'watched_sec',  t.watched_sec,
               'user_name',    t.user_name,
               'auth_method',  t.auth_method,
               'session_id',   t.session_id,
               'detail',       t.detail
             )
             ORDER BY t.occurred_at DESC, t.id DESC
           ),
           '[]'::jsonb
         )
  INTO v_events
  FROM (
    SELECT l.id, l.occurred_at, l.event_type, l.vod_id, v.title AS vod_title, l.page_path,
           l.position_sec, l.duration_sec, l.watched_sec, l.user_name, l.auth_method,
           l.session_id, l.detail
    FROM vod_usage_logs l
    LEFT JOIN vods v ON v.id = l.vod_id
    ORDER BY l.occurred_at DESC, l.id DESC
    LIMIT v_limit
  ) t;

  RETURN jsonb_build_object('events', v_events);
END;
$fn$;

REVOKE ALL ON FUNCTION vod_usage_recent(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION vod_usage_recent(text, integer) TO anon, authenticated;

-- 3. 사용자별 이용 요약
--   vod_usage_users(p_token, p_days, p_limit)   p_days 는 1~180(기본 30), p_limit 는 1~200(기본 100)으로 보정한다.
--   {
--     "users": [ watched_min 내림차순. 익명(user_name, user_key 모두 null)은 하나로 묶인다
--       { "user_name", "user_key", "views"(video_leave 수), "vods"(본 영상 수, distinct vod_id),
--         "watched_min"(video_leave 의 watched_sec 합, 분), "last_seen"(마지막 이벤트 시각) }
--     ]
--   }
CREATE OR REPLACE FUNCTION vod_usage_users(
  p_token text,
  p_days  integer DEFAULT 30,
  p_limit integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_days  integer;
  v_limit integer;
  v_since timestamptz;
  v_users jsonb;
BEGIN
  PERFORM vod_usage_check_token(p_token);

  v_days  := LEAST(GREATEST(COALESCE(p_days, 30), 1), 180);
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 200);
  v_since := NOW() - make_interval(days => v_days);

  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'user_name',   t.user_name,
               'user_key',    t.user_key,
               'views',       t.views,
               'vods',        t.vods,
               'watched_min', t.watched_min,
               'last_seen',   t.last_seen
             )
             ORDER BY t.watched_min DESC, t.last_seen DESC
           ),
           '[]'::jsonb
         )
  INTO v_users
  FROM (
    SELECT l.user_name,
           l.user_key,
           COUNT(*) FILTER (WHERE l.event_type = 'video_leave') AS views,
           COUNT(DISTINCT l.vod_id) FILTER (WHERE l.event_type = 'video_leave') AS vods,
           COALESCE(ROUND(SUM(l.watched_sec) FILTER (WHERE l.event_type = 'video_leave') / 60), 0) AS watched_min,
           MAX(l.occurred_at) AS last_seen
    FROM vod_usage_logs l
    WHERE l.occurred_at >= v_since
    GROUP BY l.user_name, l.user_key
    ORDER BY watched_min DESC, last_seen DESC
    LIMIT v_limit
  ) t;

  RETURN jsonb_build_object('users', v_users);
END;
$fn$;

REVOKE ALL ON FUNCTION vod_usage_users(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION vod_usage_users(text, integer, integer) TO anon, authenticated;
