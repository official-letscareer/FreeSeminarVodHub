export interface VodItem {
  id: number;
  title: string;
  youtubeId: string;
  description: string;
  publishedAt: string | null;
  order: number;
  embedEnabled: boolean;
  createdAt: string;
}

export interface AllowedUser {
  id: number;
  name: string;
  phoneNum: string;
  createdAt: string;
}

export interface Banner {
  id: number;
  imageUrl: string;
  linkUrl: string;
  position: 'list' | 'player' | 'both';
  order: number;
  isRandom: boolean;
  createdAt: string;
}

export interface AuthSession {
  name: string;
  phoneNum: string;
  isVerified: true;
  verifiedAt: string;
}
