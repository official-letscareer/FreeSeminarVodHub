# FreeSeminarHub — 챌린지 VOD 스트리밍 서비스

챌린지 참여자 전용 VOD 스트리밍 플랫폼입니다.
이름 + 전화번호 인증으로 접근을 제한하고, 유튜브 영상을 안전하게 제공합니다.

---

## 기술 스택

| 구분 | 기술 | 역할 |
|------|------|------|
| 프레임워크 | **Next.js 16** (App Router) | 프론트엔드 + API 서버 |
| 언어 | **TypeScript** | 타입 안정성 |
| 스타일링 | **Tailwind CSS v4** | UI 스타일 |
| UI 컴포넌트 | **shadcn/ui** (Radix UI 기반) | 공통 컴포넌트 |
| 데이터 저장 | **Supabase** | VOD·유저·배너 데이터 관리 |
| 영상 플레이어 | **YouTube IFrame API** | 영상 재생 + 커스텀 컨트롤 |
| 배포 | **Vercel** | 서버리스 호스팅 |
| 코드 품질 | **ESLint + Prettier** | 린팅·포매팅 |
| 테스트 | **Jest + Testing Library** | 단위 테스트 |

---

## 시스템 아키텍처

```
┌──────────────────────────────────────────────────────────┐
│                       사용자 브라우저                      │
│   로그인 페이지 → VOD 목록 → VOD 재생 페이지               │
└───────────────────┬──────────────────────────────────────┘
                    │ HTTP (Next.js API Routes)
┌───────────────────▼──────────────────────────────────────┐
│                    Next.js 서버 (Vercel)                   │
│                                                          │
│  ┌─────────────────────┐   ┌──────────────────────────┐  │
│  │  /api/auth/verify   │   │  /api/vod (목록·단건)    │  │
│  │  (인증 프록시)       │   │  /api/admin/* (관리자)   │  │
│  └──────────┬──────────┘   └────────────┬─────────────┘  │
└─────────────┼────────────────────────────┼────────────────┘
              │                            │
    ┌─────────▼──────────┐    ┌────────────▼──────────────┐
    │  렛츠커리어 서버    │    │         Supabase          │
    │  (유저 챌린지 검증) │    │  (VOD / 유저 / 배너 DB)   │
    └────────────────────┘    └───────────────────────────┘
                                           │
                              ┌────────────▼──────────────┐
                              │  Supabase Storage         │
                              │  (배너 이미지 파일)        │
                              └───────────────────────────┘
```

### 인증 흐름

```
[이름 + 전화번호 입력]
        ↓
[Next.js /api/auth/verify]  ←→  [렛츠커리어 서버 검증]
        ↓
   true / false
    ↓          ↓
[VOD 목록]  [접근 불가 안내]
(sessionStorage 캐싱)
```

---

## 프로젝트 구조

```
FreeSeminarHub/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── layout.tsx                # 루트 레이아웃
│   │   ├── page.tsx                  # 루트 → /login 리다이렉트
│   │   ├── login/
│   │   │   └── page.tsx              # 로그인 (이름 + 전화번호)
│   │   ├── vod/
│   │   │   ├── page.tsx              # VOD 목록 (인증 필요)
│   │   │   └── [id]/
│   │   │       └── page.tsx          # VOD 재생 (인증 필요)
│   │   ├── admin/
│   │   │   ├── page.tsx              # 관리자 로그인
│   │   │   └── vod/
│   │   │       └── page.tsx          # VOD·유저·배너 관리
│   │   └── api/
│   │       ├── auth/
│   │       │   └── verify/route.ts   # 챌린지 검증 프록시
│   │       ├── vod/
│   │       │   ├── route.ts          # VOD 목록 조회
│   │       │   └── [id]/route.ts     # VOD 단건 조회
│   │       └── admin/
│   │           ├── auth/route.ts     # 관리자 인증
│   │           ├── vod/
│   │           │   ├── route.ts      # VOD CRUD
│   │           │   └── order/route.ts# VOD 순서 변경
│   │           ├── users/
│   │           │   ├── route.ts          # 예외 유저 CRUD
│   │           │   ├── csv-template/route.ts  # CSV 양식 다운로드
│   │           │   └── csv-upload/route.ts    # CSV 일괄 등록
│   │           └── banners/route.ts  # 배너 CRUD
│   ├── components/
│   │   ├── ui/                       # shadcn/ui 기본 컴포넌트
│   │   ├── banner-carousel.tsx       # 배너 슬라이드 컴포넌트
│   │   ├── copy-protection.tsx       # 복사 방지 래퍼
│   │   ├── custom-controls.tsx       # 영상 커스텀 컨트롤
│   │   ├── video-player.tsx          # 유튜브 플레이어
│   │   ├── vod-card.tsx              # VOD 카드 (그리드)
│   │   └── vod-list-item.tsx         # VOD 항목 (리스트)
│   ├── lib/
│   │   ├── auth.ts                   # 인증 유틸
│   │   ├── constants.ts              # 상수
│   │   ├── kv.ts                     # Vercel KV 유틸 (레거시)
│   │   ├── supabase.ts               # Supabase 클라이언트
│   │   ├── types.ts                  # 공통 타입 정의
│   │   ├── utils.ts                  # 공통 유틸
│   │   └── youtube.ts                # 유튜브 URL 파싱 유틸
│   └── middleware.ts                 # 인증 미들웨어 (라우트 보호)
├── docs/
│   ├── prd.md                        # 제품 요구사항 문서
│   ├── admin-guide.md                # 관리자 사용 설명서
│   └── supabase-schema.sql           # DB 스키마
├── __tests__/                        # Jest 테스트
├── public/                           # 정적 파일
├── next.config.ts
├── tailwind.config  (PostCSS 경유)
└── .env.local                        # 환경변수 (git 제외)
```

---

## 로컬 개발 환경 설정

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경변수 설정

`.env.local` 파일을 생성하고 아래 값을 채웁니다.

```env
# 렛츠커리어 API
LETSCAREER_API_URL=

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# 관리자 비밀번호
ADMIN_PASSWORD=
```

### 3. 개발 서버 실행

```bash
npm run dev
```

브라우저에서 `http://localhost:3000` 접속

---

## 주요 명령어

| 명령어 | 설명 |
|--------|------|
| `npm run dev` | 개발 서버 실행 |
| `npm run build` | 프로덕션 빌드 |
| `npm run start` | 프로덕션 서버 실행 |
| `npm run lint` | ESLint 검사 |
| `npm run format` | Prettier 포매팅 |
| `npm test` | 테스트 실행 |

---

## 주요 기능

- **챌린지 참여자 인증**: 이름 + 전화번호로 렛츠커리어 서버 검증, sessionStorage 캐싱
- **VOD 스트리밍**: 유튜브 IFrame API 기반 재생, 우클릭·드래그·개발자도구 단축키 차단
- **배너 캐러셀**: 목록/재생화면 위치별 배너 노출, 랜덤 순서 지원
- **관리자 페이지**: VOD CRUD·순서 변경·공개/비공개, 예외 유저 관리(CSV 일괄 등록), 배너 관리

---

## 문서

- [관리자 사용 설명서](docs/admin-guide.md)
- [제품 요구사항 문서 (PRD)](docs/prd.md)
