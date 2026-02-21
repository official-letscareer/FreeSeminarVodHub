export const SESSION_KEY = 'auth_session';
export const ADMIN_SESSION_KEY = 'admin_session';

export const KV_KEYS = {
  VOD_LIST: 'vod:list',
  VOD_COUNTER: 'vod:counter',
} as const;

export const RATE_LIMIT = {
  MAX_REQUESTS: 5,
  WINDOW_SECONDS: 60,
} as const;

export const ROUTES = {
  LOGIN: '/login',
  VOD: '/vod',
  ADMIN: '/admin',
  ADMIN_VOD: '/admin/vod',
} as const;
