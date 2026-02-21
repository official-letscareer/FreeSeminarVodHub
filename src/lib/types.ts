export interface VodItem {
  id: number;
  title: string;
  youtubeId: string;
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

export interface AuthSession {
  name: string;
  phoneNum: string;
  isVerified: true;
  verifiedAt: string;
}
