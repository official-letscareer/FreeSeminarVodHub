-- VOD 테이블
CREATE TABLE vods (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  youtube_id TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  published_at DATE,
  "order" INT NOT NULL DEFAULT 0,
  embed_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 기존 테이블에 컬럼 추가 시 (마이그레이션용)
-- ALTER TABLE vods ADD COLUMN IF NOT EXISTS published_at DATE;

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

-- 배너 테이블
CREATE TABLE banners (
  id BIGSERIAL PRIMARY KEY,
  image_url TEXT NOT NULL,
  link_url TEXT NOT NULL DEFAULT '',
  position TEXT NOT NULL DEFAULT 'both' CHECK (position IN ('list', 'player', 'both')),
  "order" INT NOT NULL DEFAULT 0,
  is_random BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 기존 테이블에 추가 시 (마이그레이션용)
-- CREATE TABLE IF NOT EXISTS banners ( ... );

-- RLS 비활성화 (API Routes에서 인증 처리)
ALTER TABLE vods DISABLE ROW LEVEL SECURITY;
ALTER TABLE allowed_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits DISABLE ROW LEVEL SECURITY;
ALTER TABLE banners DISABLE ROW LEVEL SECURITY;
