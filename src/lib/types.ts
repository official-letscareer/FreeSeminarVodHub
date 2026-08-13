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

export interface PremiumUser {
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

/**
 * 렛츠커리어 챌린지 참여자/옵션 필터 설정(LC-3208). 이름+전화번호 로그인·SSO 로그인
 * 둘 다 이 설정대로 통과 여부를 판단한다. 예외 유저(allowed_users) 우회는 이 설정과
 * 무관하게 그대로 유지된다 — 백엔드 호출 자체를 안 타기 때문이다.
 */
export interface AccessSettings {
  requireChallengeParticipation: boolean;
  requireChallengeOption: boolean;
  allowedOptionCodes: string[];
}
