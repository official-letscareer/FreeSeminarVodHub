# PRD: 챌린지 VOD 스트리밍 서비스

## 1. 프로젝트 개요

| 항목 | 내용 |
|------|------|
| **프로젝트명** | 챌린지 VOD 스트리밍 서비스 |
| **버전** | 1.1 |
| **작성일** | 2026-02-21 |
| **플랫폼** | Vercel (`vod.letscareer.co.kr`) + Next.js App Router |
| **데이터 저장** | Vercel KV (Redis) |
| **인증 방식** | 이름 + 전화번호 → 서버 검증 → 프론트 캐싱 |
| **Node 버전** | v24.12.0 |

---

## 2. 기술 스택

| 구분 | 기술 | 용도 |
|------|------|------|
| 프레임워크 | **Next.js 14+** (App Router) | 프론트엔드 + API Routes |
| 언어 | **TypeScript** | 타입 안정성 |
| 스타일링 | **Tailwind CSS** | UI 스타일링 |
| UI 컴포넌트 | **shadcn/ui** | 공통 컴포넌트 |
| 코드 품질 | **ESLint + Prettier** | 린팅 + 포매팅 |
| 데이터 저장 | **Vercel KV** | VOD 목록 관리 (무료 티어) |
| 배포 | **Vercel** (`vod.letscareer.co.kr`) | 호스팅 + 서버리스 함수 |
| 영상 플레이어 | **YouTube IFrame API** | VOD 재생 + 커스텀 컨트롤 |

---

## 3. 배경 및 목적

### 3.1 배경

- 챌린지 참여자 전용 교육 영상 콘텐츠 제공 필요
- 유튜브 비공개 링크 직접 공유 시 URL 유출 위험
- 별도 영상 서버 구축 없이 유튜브 인프라 활용

### 3.2 목적

- 챌린지 참여자만 VOD에 접근할 수 있는 검증 시스템 구축
- 유튜브 URL 복사 방지를 통한 콘텐츠 보호
- 관리자가 쉽게 VOD를 등록/삭제할 수 있는 관리 페이지 제공

---

## 4. 사용자 플로우

### 4.1 유저 플로우

| 단계 | 행동 | 시스템 처리 |
|------|------|-------------|
| 1 | 이름 + 전화번호 입력 | `POST /api/v1/user/verify-challenge` 호출 |
| 2 | 서버 검증 | 유저 존재 여부 + 챌린지 기간 확인 → `true` / `false` 응답 |
| 3 | 인증 상태 캐싱 | `true`면 sessionStorage에 저장, 브라우저 닫으면 만료 |
| 4 | VOD 목록 페이지 진입 | Vercel KV에서 VOD 목록 조회 후 표시 |
| 5 | VOD 클릭 → 재생 | 유튜브 iframe 임베딩 (복사 방지 적용) |

```
[로그인 페이지] → 이름 + 전화번호 입력
       ↓
[렛츠커리어 서버] → 유저 확인 + 챌린지 기간 확인
       ↓
   true / false
    ↓          ↓
[VOD 목록]   [접근 불가 안내]
    ↓
[VOD 클릭 → 재생 페이지]
```

### 4.2 관리자 플로우

| 단계 | 행동 | 시스템 처리 |
|------|------|-------------|
| 1 | 관리자 페이지 접속 (비밀번호 인증) | 환경변수 `ADMIN_PASSWORD` 검증 |
| 2 | VOD 추가 (제목 + 유튜브 URL) | `POST /api/admin/vod` → Vercel KV에 저장 |
| 3 | VOD 삭제 (URL 제거) | `DELETE /api/admin/vod/:id` → KV에서 삭제 → 영상 비공개 |
| 4 | VOD 순서 변경 | `PATCH /api/admin/vod/order` → KV 업데이트 |

```
[관리자 로그인] → 비밀번호 입력
       ↓
[VOD 관리 페이지]
  ├── [유튜브 URL 추가] → KV 저장 → 유저에게 공개
  ├── [URL 삭제] → KV 삭제 → 유저에게 비공개
  └── [순서 변경] → KV 업데이트
```

---

## 5. 기능 요구사항

### 5.1 인증 (유저 검증)

1. 이름 + 전화번호 입력
2. 렛츠커리어 서버에 `POST /api/v1/user/verify-challenge` 호출
3. 서버에서 유저 존재 + 챌린지 기간 확인 후 `true` / `false` 응답
4. `true` → sessionStorage에 인증 상태 캐싱 → VOD 페이지 접근 허용
5. `false` → "현재 참여 중인 챌린지가 없습니다" 메시지 표시
6. 브라우저 닫으면 세션 만료 → 다시 로그인 필요

### 5.2 VOD 목록 (유저)

1. 인증된 유저만 VOD 목록 페이지 접근 가능
2. Vercel KV에 저장된 VOD 목록을 `order` 순으로 표시
3. 각 VOD 카드에 제목 표시
4. VOD 클릭 시 재생 페이지로 이동

### 5.3 VOD 재생 (유저)

1. 유튜브 IFrame API를 사용한 영상 임베딩
2. **iframe 위에 투명 오버레이**를 배치하여 직접 클릭 방지
3. **커스텀 재생/일시정지/볼륨 컨트롤** 버튼 제공
4. **우클릭 차단** (`oncontextmenu` 비활성화)
5. 텍스트 선택 및 드래그 방지
6. 개발자도구 단축키 차단 (Ctrl+U, Ctrl+Shift+I, F12)

### 5.4 관리자 페이지

1. 환경변수 기반 관리자 비밀번호 인증
2. **VOD 추가**: 제목 + 유튜브 URL 입력 → Vercel KV에 저장
3. **VOD 삭제**: URL 제거 시 유저에게 영상 비공개 처리
4. VOD 순서 변경
5. VOD 목록 실시간 미리보기

---

## 6. API 설계

### 6.1 외부 API (렛츠커리어 서버 — 신규 요청)

| Method | Endpoint | 설명 |
|--------|----------|------|
| `POST` | `/api/v1/user/verify-challenge` | 이름 + 전화번호로 유저 확인 + 챌린지 기간 검증 |

**요청:**
```json
{
  "name": "홍길동",
  "phoneNum": "01012345678"
}
```

**응답 (성공 — 챌린지 기간):**
```json
{
  "status": 200,
  "data": { "isChallenge": true }
}
```

**응답 (실패 — 유저 없음 또는 챌린지 아님):**
```json
{
  "status": 200,
  "data": { "isChallenge": false }
}
```

### 6.2 내부 API (Next.js API Routes)

| Method | Endpoint | 설명 | 인증 |
|--------|----------|------|------|
| `POST` | `/api/auth/verify` | 렛츠커리어 검증 API 프록시 | 없음 |
| `GET` | `/api/vod` | VOD 목록 조회 | 세션 |
| `GET` | `/api/vod/:id` | VOD 단건 조회 | 세션 |
| `POST` | `/api/admin/auth` | 관리자 비밀번호 인증 | 없음 |
| `GET` | `/api/admin/vod` | [관리자] VOD 목록 조회 | Admin |
| `POST` | `/api/admin/vod` | [관리자] VOD 추가 | Admin |
| `DELETE` | `/api/admin/vod/:id` | [관리자] VOD 삭제 | Admin |
| `PATCH` | `/api/admin/vod/order` | [관리자] VOD 순서 변경 | Admin |

---

## 7. 데이터 구조 (Vercel KV)

### 7.1 KV 키 구조

| Key | Value | 설명 |
|-----|-------|------|
| `vod:list` | `VodItem[]` (JSON) | 전체 VOD 목록 |
| `vod:counter` | `number` | VOD ID auto-increment |

### 7.2 VOD 객체 타입

```typescript
interface VodItem {
  id: number;
  title: string;
  youtubeId: string;  // 유튜브 영상 ID (예: "dQw4w9WgXcQ")
  order: number;
  createdAt: string;  // ISO 8601
}
```

### 7.3 예시 데이터

```json
[
  {
    "id": 1,
    "title": "챌린지 1일차 - 자기소개서 작성법",
    "youtubeId": "dQw4w9WgXcQ",
    "order": 1,
    "createdAt": "2026-02-21T09:00:00Z"
  },
  {
    "id": 2,
    "title": "챌린지 2일차 - 포트폴리오 구성",
    "youtubeId": "abc123xyz",
    "order": 2,
    "createdAt": "2026-02-22T09:00:00Z"
  }
]
```

---

## 8. 인증 상태 캐싱

### 8.1 방식

```
sessionStorage에 저장 → 브라우저 닫으면 자동 만료
```

### 8.2 저장 데이터

```typescript
interface AuthSession {
  name: string;
  phoneNum: string;
  isVerified: true;
  verifiedAt: string;  // ISO 8601
}
```

### 8.3 검증 흐름

```
페이지 접근 시:
1. sessionStorage에 인증 데이터 있는지 확인
2. 있으면 → VOD 페이지 표시
3. 없으면 → 로그인 페이지로 리다이렉트
```

---

## 9. URL 복사 방지 전략

### 9.1 적용 방법

| 방지 방법 | 구현 방식 |
|-----------|-----------|
| **우클릭 방지** | `oncontextmenu` 이벤트 차단 |
| **투명 오버레이** | iframe 위에 `absolute position` 투명 div 배치 |
| **커스텀 컨트롤** | YouTube IFrame API로 재생/일시정지/볼륨 버튼 직접 구현 |
| **드래그 방지** | `user-select: none`, `-webkit-user-drag: none` |
| **키보드 단축키 차단** | Ctrl+U, Ctrl+Shift+I, F12 등 개발자도구 단축키 차단 |

### 9.2 구현 구조

```
┌─────────────────────────────────┐
│      투명 오버레이 (z-10)        │  ← 클릭 이벤트 가로챔
├─────────────────────────────────┤
│                                 │
│      YouTube iframe (z-0)       │  ← 실제 영상
│                                 │
├─────────────────────────────────┤
│  ▶ 재생  ⏸ 일시정지  🔊 볼륨    │  ← 커스텀 컨트롤 (z-20)
└─────────────────────────────────┘
```

### 9.3 한계점

- 개발자 도구를 통한 iframe src 확인은 완전 차단 불가
- 네트워크 탭에서 요청 URL 확인 가능
- **목표**: 일반 유저 수준의 복사 방지

---

## 10. 페이지 구조

```
/
├── /login              → 로그인 페이지 (이름 + 전화번호)
├── /vod                → VOD 목록 페이지 (인증 필요)
├── /vod/[id]           → VOD 재생 페이지 (인증 필요)
├── /admin              → 관리자 로그인
└── /admin/vod          → VOD 관리 페이지 (관리자 인증 필요)
```

---

## 11. 프로젝트 구조

```
src/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                    → 로그인 리다이렉트
│   ├── login/
│   │   └── page.tsx                → 로그인 (이름 + 전화번호)
│   ├── vod/
│   │   ├── page.tsx                → VOD 목록
│   │   └── [id]/
│   │       └── page.tsx            → VOD 재생
│   ├── admin/
│   │   ├── page.tsx                → 관리자 로그인
│   │   └── vod/
│   │       └── page.tsx            → VOD 관리
│   └── api/
│       ├── auth/
│       │   └── verify/route.ts     → 챌린지 검증 프록시
│       ├── vod/
│       │   ├── route.ts            → VOD 목록 조회
│       │   └── [id]/route.ts       → VOD 단건 조회
│       └── admin/
│           ├── auth/route.ts       → 관리자 인증
│           └── vod/
│               ├── route.ts        → VOD CRUD
│               └── order/route.ts  → 순서 변경
├── components/
│   ├── ui/                         → shadcn/ui 컴포넌트
│   ├── video-player.tsx            → 커스텀 유튜브 플레이어
│   ├── vod-card.tsx                → VOD 카드
│   └── copy-protection.tsx         → 복사 방지 래퍼
├── lib/
│   ├── kv.ts                       → Vercel KV 유틸
│   ├── auth.ts                     → 인증 유틸
│   └── types.ts                    → 타입 정의
└── middleware.ts                    → 인증 미들웨어
```

---

## 12. 환경변수

```env
# 렛츠커리어 API
LETSCAREER_API_URL=https://api.letscareer.co.kr

# Vercel KV (자동 설정)
KV_REST_API_URL=
KV_REST_API_TOKEN=
KV_REST_API_READ_ONLY_TOKEN=

# 관리자
ADMIN_PASSWORD=
```

---

## 13. 비기능 요구사항

### 13.1 보안

- 관리자 비밀번호는 환경변수(`ADMIN_PASSWORD`)로 관리
- VOD API 호출 시 세션 상태 확인
- 유튜브 ID는 서버사이드에서만 조합 (클라이언트에 전체 URL 노출 최소화)

### 13.2 성능

- Vercel KV 캐싱으로 VOD 목록 조회 최적화
- Vercel Edge Network 활용

### 13.3 UX

- 모바일 반응형 지원 (Tailwind CSS)
- 로딩 상태 표시 (shadcn/ui Skeleton)
- 에러 상태에 대한 명확한 안내 메시지 (shadcn/ui Alert)

---

## 14. Vercel KV 무료 티어 제한

| 항목 | 제한 |
|------|------|
| 저장 용량 | 30MB |
| 일일 요청 | 30,000건 |
| 월간 요청 | 150,000건 |

> VOD 목록 데이터는 수 KB 수준이므로 무료 티어로 충분합니다.

---

## 15. 마일스톤


- [ ] 프로젝트 초기 설정 (Next.js + TypeScript + Tailwind + shadcn/ui + ESLint + Prettier)
- [ ] 로그인 (이름 + 전화번호) + 챌린지 검증 연동
- [ ] VOD 목록 / 재생 페이지
- [ ] 관리자 VOD CRUD
- [ ] URL 복사 방지 적용



## 16. 리스크 및 대응

| 리스크 | 영향 | 대응 |
|--------|------|------|
| 유튜브 URL 완전 차단 불가 | 중 | 일반 유저 수준 차단 + 유튜브 비공개 설정 병행 |
| 렛츠커리어 서버 장애 | 높 | 에러 안내 + 재시도 로직 |
| Vercel KV 무료 티어 초과 | 낮 | VOD 데이터 경량 (수 KB), 초과 가능성 극히 낮음 |
| 이름+전화번호 무작위 입력 시도 | 낮 | Rate limiting 적용 (분당 5회 제한) |