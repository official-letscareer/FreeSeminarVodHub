-- VOD 이용 로그: 특정 사용자의 이벤트를 시간순으로 돌려주는 함수(LC-3438, 어드민 "유저 검색").
-- Supabase SQL Editor 에서 실행한다. 여러 번 실행해도 안전하다(멱등).
--
-- 먼저 docs/supabase-usage-log.sql 과 docs/supabase-usage-log-admin.sql 이 실행돼 있어야 한다
-- (vod_usage_logs 테이블, vod_usage_check_token 함수, 토큰 해시 등록).
--
--   vod_usage_user_events(p_token, p_name, p_user_key, p_days, p_limit)
--     p_name      이름. 부분 일치(대소문자 무시). 비우면 쓰지 않는다.
--     p_user_key  이용자 키(HMAC). 정확히 일치. 값이 있으면 p_name 은 무시한다.
--                 전화번호는 저장하지 않으므로 서버가 이름+전화번호로 키를 만들어 넘긴다.
--     p_days      1~180(기본 30)
--     p_limit     1~2000(기본 1000). 넘으면 가장 최근 p_limit 건만 돌려주고 truncated 가 true 다.
--   {
--     "truncated": boolean,
--     "events": [ occurred_at 오름차순
--       { "occurred_at", "session_id", "auth_method", "user_name", "user_key", "event_type",
--         "vod_id", "vod_title", "page_path", "position_sec", "duration_sec", "watched_sec", "detail" }
--     ]
--   }
--   p_name 과 p_user_key 가 모두 비어 있으면 빈 목록이다. user_agent 는 돌려주지 않는다.

CREATE OR REPLACE FUNCTION vod_usage_user_events(
  p_token    text,
  p_name     text    DEFAULT NULL,
  p_user_key text    DEFAULT NULL,
  p_days     integer DEFAULT 30,
  p_limit    integer DEFAULT 1000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_days   integer;
  v_limit  integer;
  v_since  timestamptz;
  v_name   text;
  v_key    text;
  v_events jsonb;
  v_count  integer;
BEGIN
  PERFORM vod_usage_check_token(p_token);

  v_days  := LEAST(GREATEST(COALESCE(p_days, 30), 1), 180);
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 1000), 1), 2000);
  v_since := NOW() - make_interval(days => v_days);
  v_name  := NULLIF(btrim(COALESCE(p_name, '')), '');
  v_key   := NULLIF(btrim(COALESCE(p_user_key, '')), '');

  IF v_name IS NULL AND v_key IS NULL THEN
    RETURN jsonb_build_object('truncated', false, 'events', '[]'::jsonb);
  END IF;

  SELECT COUNT(*)
  INTO v_count
  FROM vod_usage_logs l
  WHERE l.occurred_at >= v_since
    AND (
      (v_key IS NOT NULL AND l.user_key = v_key)
      OR (v_key IS NULL AND l.user_name ILIKE '%' ||
          replace(replace(replace(v_name, '\', '\\'), '%', '\%'), '_', '\_') || '%')
    );

  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'occurred_at',  t.occurred_at,
             'session_id',   t.session_id,
             'auth_method',  t.auth_method,
             'user_name',    t.user_name,
             'user_key',     t.user_key,
             'event_type',   t.event_type,
             'vod_id',       t.vod_id,
             'vod_title',    t.vod_title,
             'page_path',    t.page_path,
             'position_sec', t.position_sec,
             'duration_sec', t.duration_sec,
             'watched_sec',  t.watched_sec,
             'detail',       t.detail
           ) ORDER BY t.occurred_at ASC
         ), '[]'::jsonb)
  INTO v_events
  FROM (
    SELECT l.*, v.title AS vod_title
    FROM vod_usage_logs l
    LEFT JOIN vods v ON v.id = l.vod_id
    WHERE l.occurred_at >= v_since
      AND (
        (v_key IS NOT NULL AND l.user_key = v_key)
        OR (v_key IS NULL AND l.user_name ILIKE '%' ||
            replace(replace(replace(v_name, '\', '\\'), '%', '\%'), '_', '\_') || '%')
      )
    ORDER BY l.occurred_at DESC
    LIMIT v_limit
  ) t;

  RETURN jsonb_build_object('truncated', v_count > v_limit, 'events', v_events);
END;
$fn$;

REVOKE ALL ON FUNCTION vod_usage_user_events(text, text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION vod_usage_user_events(text, text, text, integer, integer) TO anon, authenticated;
