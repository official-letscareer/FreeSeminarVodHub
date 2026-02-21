# Tasks: 챌린지 VOD 스트리밍 서비스

> PRD: `PRD_챌린지_VOD_스트리밍_서비스_v1.1.md`
> 생성일: 2026-02-21

---

### 관련 파일

**프로젝트 설정**
- `package.json` - 프로젝트 의존성 및 스크립트
- `tsconfig.json` - TypeScript 설정
- `tailwind.config.ts` - Tailwind CSS 설정
- `.eslintrc.json` - ESLint 설정
- `.prettierrc` - Prettier 설정
- `.env.local` - 환경변수 (로컬)
- `next.config.ts` - Next.js 설정

**타입 및 유틸**
- `src/lib/types.ts` - 공통 타입 정의 (VodItem, AuthSession 등)
- `src/lib/kv.ts` - Vercel KV 유틸 함수
- `src/lib/auth.ts` - 인증 유틸 함수 (목 모드 포함)
- `src/lib/constants.ts` - 상수 정의

**미들웨어**
- `src/middleware.ts` - 인증 미들웨어 (유저/관리자 라우트 보호)

**유저 인증**
- `src/app/login/page.tsx` - 로그인 페이지 (이름 + 전화번호)
- `src/app/api/auth/verify/route.ts` - 챌린지 검증 API 프록시

**유저 VOD**
- `src/app/vod/page.tsx` - VOD 목록 페이지
- `src/app/vod/[id]/page.tsx` - VOD 재생 페이지
- `src/app/api/vod/route.ts` - VOD 목록 조회 API
- `src/app/api/vod/[id]/route.ts` - VOD 단건 조회 API

**관리자**
- `src/app/admin/page.tsx` - 관리자 로그인 페이지
- `src/app/admin/vod/page.tsx` - VOD 관리 페이지
- `src/app/api/admin/auth/route.ts` - 관리자 인증 API
- `src/app/api/admin/vod/route.ts` - VOD CRUD API
- `src/app/api/admin/vod/order/route.ts` - VOD 순서 변경 API

**컴포넌트**
- `src/components/ui/` - shadcn/ui 컴포넌트
- `src/components/video-player.tsx` - 커스텀 유튜브 플레이어
- `src/components/vod-card.tsx` - VOD 카드 컴포넌트
- `src/components/copy-protection.tsx` - 복사 방지 래퍼 컴포넌트
- `src/components/custom-controls.tsx` - 커스텀 재생 컨트롤

**레이아웃**
- `src/app/layout.tsx` - 루트 레이아웃
- `src/app/page.tsx` - 루트 페이지 (로그인 리다이렉트)

**테스트**
- `__tests__/lib/auth.test.ts` - 인증 유틸 테스트
- `__tests__/lib/kv.test.ts` - KV 유틸 테스트
- `__tests__/api/auth.test.ts` - 인증 API 테스트
- `__tests__/api/vod.test.ts` - VOD API 테스트
- `__tests__/api/admin-vod.test.ts` - 관리자 VOD API 테스트
- `__tests__/components/video-player.test.tsx` - 플레이어 컴포넌트 테스트
- `__tests__/components/copy-protection.test.tsx` - 복사 방지 테스트

---

## 작업

- [x] **1.0 프로젝트 초기 설정 및 기본 구조** (Push 단위)

    - [x] 1.1 Next.js 프로젝트 생성 및 기본 의존성 설치 (커밋 단위)
        - `npx create-next-app@latest` (TypeScript, Tailwind, App Router, ESLint 선택)
        - Node v24.12.0 확인 (`.nvmrc` 생성)
        - Prettier 설치 및 설정 (`.prettierrc`, ESLint 연동)
        - [x] 1.1.1 프로젝트 빌드 및 린트 정상 동작 확인
        - [x] 1.1.2 오류 수정 (필요 시)

    - [x] 1.2 shadcn/ui 초기 설정 및 공통 컴포넌트 추가 (커밋 단위)
        - `npx shadcn-ui@latest init`
        - 필요 컴포넌트 설치: Button, Input, Card, Skeleton, Alert, Dialog
        - [x] 1.2.1 컴포넌트 렌더링 확인
        - [x] 1.2.2 오류 수정 (필요 시)

    - [x] 1.3 프로젝트 폴더 구조 생성 및 타입 정의 (커밋 단위)
        - PRD 11번 프로젝트 구조에 따라 폴더 생성
        - `src/lib/types.ts` — `VodItem`, `AuthSession` 인터페이스 정의
        - `src/lib/constants.ts` — 상수 정의
        - [x] 1.3.1 TypeScript 타입 체크 통과 확인
        - [x] 1.3.2 오류 수정 (필요 시)

    - [x] 1.4 환경변수 설정 및 Vercel KV 연결 (커밋 단위)
        - `.env.local` 생성 (PRD 12번 환경변수 참고)
        - `@vercel/kv` 패키지 설치
        - `src/lib/kv.ts` — KV 연결 및 기본 CRUD 유틸 함수 작성
            - `getVodList()`, `addVod()`, `deleteVod()`, `updateVodOrder()`, `getNextId()`
        - [x] 1.4.1 테스트 코드 작성 (`__tests__/lib/kv.test.ts`)
        - [x] 1.4.2 테스트 실행 및 검증
        - [x] 1.4.3 오류 수정 (필요 시)

    - [x] 1.5 루트 레이아웃 및 리다이렉트 설정 (커밋 단위)
        - `src/app/layout.tsx` — 기본 레이아웃 (폰트, 메타데이터)
        - `src/app/page.tsx` — `/login`으로 리다이렉트
        - [x] 1.5.1 리다이렉트 동작 확인
        - [x] 1.5.2 오류 수정 (필요 시)

---

- [x] **2.0 유저 인증 (로그인 + 챌린지 검증)** (Push 단위)

    - [x] 2.1 인증 유틸 함수 작성 (커밋 단위)
        - `src/lib/auth.ts` 작성
            - `verifyChallenge(name, phoneNum)` — 서버 검증 호출 (목 모드 포함)
            - `getSession()` — sessionStorage에서 인증 상태 조회
            - `setSession(data)` — sessionStorage에 인증 상태 저장
            - `clearSession()` — 세션 삭제
            - `MOCK_MODE` 플래그 — 백엔드 완성 전 임시 통과용
        - [x] 2.1.1 테스트 코드 작성 (`__tests__/lib/auth.test.ts`)
        - [x] 2.1.2 테스트 실행 및 검증
        - [x] 2.1.3 오류 수정 (필요 시)

    - [x] 2.2 챌린지 검증 API 프록시 작성 (커밋 단위)
        - `src/app/api/auth/verify/route.ts`
            - `POST` — 이름 + 전화번호 받아서 렛츠커리어 서버로 프록시
            - 목 모드일 때는 서버 호출 없이 `{ isChallenge: true }` 반환
            - 입력값 검증 (이름 빈값, 전화번호 형식)
        - [x] 2.2.1 테스트 코드 작성 (`__tests__/api/auth.test.ts`)
        - [x] 2.2.2 테스트 실행 및 검증
        - [x] 2.2.3 오류 수정 (필요 시)

    - [x] 2.3 로그인 페이지 UI 구현 (커밋 단위)
        - `src/app/login/page.tsx`
            - 이름 입력 필드 (shadcn/ui Input)
            - 전화번호 입력 필드 (shadcn/ui Input)
            - 로그인 버튼 (shadcn/ui Button)
            - 로딩 상태 표시
            - 에러 메시지 표시 (shadcn/ui Alert)
            - 검증 성공 시 `/vod`로 리다이렉트
            - 모바일 반응형
        - [x] 2.3.1 UI 렌더링 및 폼 제출 동작 확인
        - [x] 2.3.2 오류 수정 (필요 시)

    - [x] 2.4 인증 미들웨어 구현 (커밋 단위)
        - `src/middleware.ts`
            - `/vod`, `/vod/[id]` 경로 접근 시 세션 확인
            - `/admin/vod` 경로 접근 시 관리자 세션 확인
            - 미인증 시 `/login` 또는 `/admin`으로 리다이렉트
        - **주의**: sessionStorage는 미들웨어(서버)에서 접근 불가 → 쿠키 기반 플래그 또는 클라이언트 사이드 가드로 처리
        - [x] 2.4.1 보호된 경로 접근 차단 확인
        - [x] 2.4.2 오류 수정 (필요 시)

---

- [ ] **3.0 관리자 페이지 (VOD CRUD)** (Push 단위)

    - [x] 3.1 관리자 인증 API 구현 (커밋 단위)
        - `src/app/api/admin/auth/route.ts`
            - `POST` — 비밀번호를 받아서 `ADMIN_PASSWORD` 환경변수와 비교
            - 일치하면 관리자 세션 쿠키 설정
        - [x] 3.1.1 테스트 코드 작성 (`__tests__/api/admin-vod.test.ts`)
        - [x] 3.1.2 테스트 실행 및 검증
        - [x] 3.1.3 오류 수정 (필요 시)

    - [x] 3.2 관리자 VOD CRUD API 구현 (커밋 단위)
        - `src/app/api/admin/vod/route.ts`
            - `GET` — Vercel KV에서 VOD 목록 조회
            - `POST` — VOD 추가 (제목 + 유튜브 URL → youtubeId 파싱 후 KV 저장)
            - `DELETE` — VOD 삭제 (KV에서 제거)
        - `src/app/api/admin/vod/order/route.ts`
            - `PATCH` — VOD 순서 변경 (order 값 업데이트)
        - 모든 엔드포인트에 관리자 세션 검증
        - [x] 3.2.1 테스트 코드 작성 (`__tests__/api/admin-vod.test.ts`에 추가)
        - [x] 3.2.2 테스트 실행 및 검증
        - [x] 3.2.3 오류 수정 (필요 시)

    - [x] 3.3 관리자 로그인 페이지 UI (커밋 단위)
        - `src/app/admin/page.tsx`
            - 비밀번호 입력 필드
            - 로그인 버튼
            - 에러 메시지 표시
            - 성공 시 `/admin/vod`로 리다이렉트
        - [x] 3.3.1 로그인 동작 확인
        - [x] 3.3.2 오류 수정 (필요 시)

    - [ ] 3.4 VOD 관리 페이지 UI 구현 (커밋 단위)
        - `src/app/admin/vod/page.tsx`
            - VOD 목록 표시 (제목, 유튜브 ID, 순서)
            - VOD 추가 폼 (제목 + 유튜브 URL 입력)
                - 유튜브 URL에서 자동으로 youtubeId 파싱
            - VOD 삭제 버튼 (확인 Dialog)
            - VOD 순서 변경 (위/아래 버튼 또는 번호 입력)
            - 실시간 미리보기 (유튜브 썸네일)
        - [ ] 3.4.1 CRUD 전체 동작 확인
        - [ ] 3.4.2 오류 수정 (필요 시)

---

- [ ] **4.0 유저 VOD 목록 + 재생 페이지** (Push 단위)

    - [ ] 4.1 VOD 조회 API 구현 (커밋 단위)
        - `src/app/api/vod/route.ts`
            - `GET` — Vercel KV에서 VOD 목록 조회 (order 순 정렬)
        - `src/app/api/vod/[id]/route.ts`
            - `GET` — VOD 단건 조회 (youtubeId 포함)
        - [ ] 4.1.1 테스트 코드 작성 (`__tests__/api/vod.test.ts`)
        - [ ] 4.1.2 테스트 실행 및 검증
        - [ ] 4.1.3 오류 수정 (필요 시)

    - [ ] 4.2 VOD 카드 컴포넌트 구현 (커밋 단위)
        - `src/components/vod-card.tsx`
            - 유튜브 썸네일 이미지 표시 (`img.youtube.com/vi/{youtubeId}/mqdefault.jpg`)
            - 제목 표시
            - 클릭 시 `/vod/[id]`로 이동
            - hover 효과
            - 모바일 반응형
        - [ ] 4.2.1 컴포넌트 렌더링 확인
        - [ ] 4.2.2 오류 수정 (필요 시)

    - [ ] 4.3 VOD 목록 페이지 구현 (커밋 단위)
        - `src/app/vod/page.tsx`
            - 인증 상태 확인 (미인증 시 `/login` 리다이렉트)
            - VOD 목록 API 호출
            - VOD 카드 그리드 배치
            - 로딩 상태 (shadcn/ui Skeleton)
            - 빈 목록 안내 메시지
            - 모바일 반응형 (1열 → 2열 → 3열)
        - [ ] 4.3.1 목록 표시 및 라우팅 확인
        - [ ] 4.3.2 오류 수정 (필요 시)

    - [ ] 4.4 유튜브 플레이어 컴포넌트 구현 (커밋 단위)
        - `src/components/video-player.tsx`
            - YouTube IFrame API 로드 및 초기화
            - youtubeId를 props로 받아서 영상 로드
            - 영상 로딩 상태 표시
            - 반응형 16:9 비율 유지
        - [ ] 4.4.1 테스트 코드 작성 (`__tests__/components/video-player.test.tsx`)
        - [ ] 4.4.2 테스트 실행 및 검증
        - [ ] 4.4.3 오류 수정 (필요 시)

    - [ ] 4.5 VOD 재생 페이지 구현 (커밋 단위)
        - `src/app/vod/[id]/page.tsx`
            - 인증 상태 확인
            - VOD 단건 API 호출
            - 유튜브 플레이어 컴포넌트 배치
            - 영상 제목 표시
            - 목록으로 돌아가기 버튼
            - 존재하지 않는 VOD 접근 시 에러 처리
        - [ ] 4.5.1 재생 페이지 동작 확인
        - [ ] 4.5.2 오류 수정 (필요 시)

---

- [ ] **5.0 URL 복사 방지 + 마무리** (Push 단위)

    - [ ] 5.1 복사 방지 래퍼 컴포넌트 구현 (커밋 단위)
        - `src/components/copy-protection.tsx`
            - 우클릭 차단 (`oncontextmenu` 이벤트 차단)
            - 텍스트 선택 방지 (`user-select: none`)
            - 드래그 방지 (`-webkit-user-drag: none`)
            - 키보드 단축키 차단 (Ctrl+U, Ctrl+Shift+I, F12)
        - [ ] 5.1.1 테스트 코드 작성 (`__tests__/components/copy-protection.test.tsx`)
        - [ ] 5.1.2 테스트 실행 및 검증
        - [ ] 5.1.3 오류 수정 (필요 시)

    - [ ] 5.2 투명 오버레이 + 커스텀 컨트롤 구현 (커밋 단위)
        - `src/components/custom-controls.tsx`
            - iframe 위에 투명 div 오버레이 배치 (absolute, z-10)
            - 커스텀 재생/일시정지 버튼
            - 커스텀 볼륨 조절
            - 커스텀 프로그레스 바 (현재 재생 위치)
            - 전체화면 버튼
            - YouTube IFrame API와 연동
        - `src/components/video-player.tsx` 수정
            - 복사 방지 래퍼 + 커스텀 컨트롤 통합
        - [ ] 5.2.1 오버레이 및 컨트롤 동작 확인
        - [ ] 5.2.2 오류 수정 (필요 시)

    - [ ] 5.3 VOD 재생 페이지에 복사 방지 적용 (커밋 단위)
        - `src/app/vod/[id]/page.tsx` 수정
            - `<CopyProtection>` 래퍼로 페이지 전체 감싸기
            - 플레이어에 투명 오버레이 + 커스텀 컨트롤 적용
        - [ ] 5.3.1 우클릭, 드래그, 단축키 차단 동작 확인
        - [ ] 5.3.2 모바일에서 동작 확인
        - [ ] 5.3.3 오류 수정 (필요 시)

    - [ ] 5.4 Rate Limiting 적용 (커밋 단위)
        - `src/app/api/auth/verify/route.ts` 수정
            - Vercel KV 기반 Rate Limiting (분당 5회 제한)
            - IP 또는 전화번호 기준 제한
            - 제한 초과 시 429 응답
        - [ ] 5.4.1 Rate Limiting 동작 확인
        - [ ] 5.4.2 오류 수정 (필요 시)

    - [ ] 5.5 최종 점검 및 배포 준비 (커밋 단위)
        - 전체 빌드 확인 (`npm run build`)
        - 린트 통과 확인 (`npm run lint`)
        - 환경변수 정리 (Vercel 대시보드에 설정)
        - `vod.letscareer.co.kr` 도메인 연결 확인
        - 모바일/데스크톱 크로스 브라우저 테스트
        - 목 모드 해제 준비 (백엔드 API 연동 전환 플래그)
        - [ ] 5.5.1 전체 플로우 E2E 확인 (로그인 → VOD 목록 → 재생)
        - [ ] 5.5.2 관리자 플로우 E2E 확인 (로그인 → 추가 → 삭제)
        - [ ] 5.5.3 오류 수정 (필요 시)