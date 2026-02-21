-- VOD 테이블
CREATE TABLE vods (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  youtube_id TEXT NOT NULL,
  "order" INT NOT NULL DEFAULT 0,
  embed_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 예외 접근 유저 테이블
CREATE TABLE allowed_users (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone_num TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(name, phone_num)
);

-- Rate Limiting 테이블
CREATE TABLE rate_limits (
  id BIGSERIAL PRIMARY KEY,
  key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rate_limits_key_created ON rate_limits (key, created_at);

-- RLS 비활성화 (API Routes에서 인증 처리)
ALTER TABLE vods DISABLE ROW LEVEL SECURITY;
ALTER TABLE allowed_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits DISABLE ROW LEVEL SECURITY;
