export interface VodItem {
  id: number;
  title: string;
  youtubeId: string;
  order: number;
  createdAt: string;
}

export interface AuthSession {
  name: string;
  phoneNum: string;
  isVerified: true;
  verifiedAt: string;
}
