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

/**
 * 렛츠커리어 챌린지 참여자/옵션 필터 설정(LC-3208). 이름+전화번호 로그인·SSO 로그인
 * 둘 다 이 설정대로 통과 여부를 판단한다. 예외 유저(allowed_users) 우회는 이 설정과
 * 무관하게 그대로 유지된다 — 백엔드 호출 자체를 안 타기 때문이다.
 */
export interface AccessSettings {
  requireChallengeParticipation: boolean;
  requireChallengeOption: boolean;
  allowedOptionCodes: string[];
  /**
   * VOD 이용권 게이트(LC-3438). 켜면 SSO 로그인 판정에서 위 두 필터 대신 렛커 서버가
   * 내려주는 `canWatchVod` 를 쓴다. 기본 OFF 라 배포만으로는 동작이 바뀌지 않는다.
   */
  requireVodPass: boolean;
}

/** 그룹 접근 규칙이 다루는 프로그램 종류. 진행 기간(startDate, endDate)이 있는 둘뿐이다. */
export type GroupAccessProgramType = 'CHALLENGE' | 'LIVE';

/**
 * 그룹 접근 규칙. 이 프로그램(플랜)을 신청한 사람 전체에게 종료일 + graceDays 일까지 VOD 접근을 연다.
 * programTitle·programStartDate·programEndDate 는 어드민 표시용이고, 판정에는 신청 내역의 날짜를 쓴다.
 * 번호로 직접 등록한 규칙은 날짜를 모르므로 programStartDate·programEndDate 가 null 이다.
 */
export interface GroupAccessRule {
  id: number;
  programType: GroupAccessProgramType;
  programId: number;
  programTitle: string;
  programStartDate: string | null;
  programEndDate: string | null;
  /** 비어 있으면 전체 플랜. */
  planTypes: string[];
  graceDays: number;
  memo: string | null;
  createdAt: string;
}

/**
 * 렛커 서버가 SSO 프로필 응답에 내려주는 사용자의 신청 한 건.
 * 날짜는 오프셋 없는 KST LocalDateTime 문자열 그대로 둔다(예: 2026-10-20T10:00:00).
 */
export interface ProgramApplication {
  programType: GroupAccessProgramType;
  programId: number;
  /** 챌린지 플랜. LIVE 이거나 플랜이 없는 챌린지 신청이면 null. */
  planType: string | null;
  startDate: string;
  endDate: string;
}
