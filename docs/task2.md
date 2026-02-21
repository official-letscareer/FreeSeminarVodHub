# Tasks: 챌린지 VOD 스트리밍 서비스 - 추가 기능

> 생성일: 2026-02-22

---

### 관련 파일

**관리자**
- `src/app/admin/vod/page.tsx` - 관리자 VOD + 예외유저 관리 페이지
- `src/app/api/admin/users/route.ts` - 예외 유저 CRUD API
- `src/app/api/admin/vod/route.ts` - VOD CRUD API

**유저**
- `src/app/vod/page.tsx` - VOD 목록 페이지
- `src/app/vod/[id]/page.tsx` - VOD 재생 페이지
- `src/app/login/page.tsx` - 로그인 페이지

**컴포넌트**
- `src/components/vod-card.tsx` - VOD 카드 컴포넌트
- `src/components/video-player.tsx` - 커스텀 유튜브 플레이어
- `src/components/copy-protection.tsx` - 복사 방지 래퍼

**라이브러리**
- `src/lib/kv.ts` - Supabase DB 유틸 함수
- `src/lib/types.ts` - 공통 타입 정의
- `supabase-schema.sql` - Supabase 테이블 스키마

**테스트**
- `__tests__/api/admin-vod.test.ts` - 관리자 API 테스트
- `__tests__/lib/kv.test.ts` - DB 유틸 테스트

---

## 작업

- [x] **1.0 예외접근 유저 관리 CSV 기능** (Push 단위)

    - [x] 1.1 CSV 템플릿 다운로드 기능 (커밋 단위)
        - `src/app/api/admin/users/csv-template/route.ts` 생성
            - `GET` — 헤더(이름, 전화번호) 포함한 빈 CSV 파일 반환
        - `src/app/admin/vod/page.tsx` 수정
            - "CSV 양식 다운로드" 버튼 추가
        - [x] 1.1.1 테스트 코드 작성 (`__tests__/api/admin-vod.test.ts`)
        - [x] 1.1.2 테스트 실행 및 검증

    - [x] 1.2 CSV 업로드 일괄 등록 기능 (커밋 단위)
        - `src/app/api/admin/users/csv-upload/route.ts` 생성
            - `POST` — multipart/form-data로 CSV 파일 수신 → 파싱 → DB 일괄 저장
            - 중복 유저 스킵 처리 (UNIQUE 제약 활용)
            - 결과 요약 응답 (추가된 수, 스킵된 수)
        - `src/app/admin/vod/page.tsx` 수정
            - CSV 파일 업로드 input + 업로드 버튼 추가
            - 업로드 결과 메시지 표시
        - [x] 1.2.1 테스트 코드 작성
        - [x] 1.2.2 테스트 실행 및 검증

    - [x] 1.3 예외 유저 리스트뷰 개선 (커밋 단위)
        - `src/app/admin/vod/page.tsx` 수정
            - 기존 리스트를 테이블 형태로 변경 (이름, 전화번호, 등록일 컬럼)
            - 날짜 포맷팅 (createdAt → "YYYY-MM-DD" 형태)
        - [x] 1.3.1 UI 렌더링 확인

    - [x] 1.4 예외 유저 체크박스 일괄 삭제 (커밋 단위)
        - `src/app/api/admin/users/route.ts` 수정
            - `DELETE` — body에 ids 배열로 복수 삭제 지원
        - `src/lib/kv.ts` 수정
            - `deleteAllowedUsers(ids: number[])` 함수 추가
        - `src/app/admin/vod/page.tsx` 수정
            - 각 행에 체크박스 추가
            - 전체 선택/해제 체크박스
            - "선택 삭제" 버튼 추가
        - [x] 1.4.1 테스트 코드 작성 (`__tests__/api/admin-vod.test.ts`)
        - [x] 1.4.2 테스트 실행 및 검증

---

- [x] **2.0 영상 썸네일 버그 수정** (Push 단위)

    - [x] 2.1 썸네일 로드 실패 원인 진단 및 수정 (커밋 단위)
        - `src/components/vod-card.tsx` 수정
            - `onError` 핸들러로 썸네일 로드 실패 시 대체 이미지 또는 기본 플레이스홀더 표시
            - `mqdefault.jpg` → `hqdefault.jpg` 순으로 폴백 시도
        - `src/app/admin/vod/page.tsx` 수정 (관리자 썸네일도 동일 처리)
        - [x] 2.1.1 썸네일 폴백 동작 확인

---

- [x] **3.0 영상 메타정보 관리 (제목/설명/제작일)** (Push 단위)

    - [x] 3.1 DB 스키마에 제작일(publishedAt) 컬럼 추가 (커밋 단위)
        - `supabase-schema.sql` 수정 — `published_at DATE` 컬럼 추가
        - `src/lib/types.ts` 수정 — `publishedAt: string | null` 필드 추가
        - `src/lib/kv.ts` 수정 — `toVodItem`, `addVod`, `updateVodMeta` 수정
        - [x] 3.1.1 빌드 및 타입 체크 확인

    - [x] 3.2 어드민 메타정보 입력/수정 UI (커밋 단위)
        - `src/app/api/admin/vod/route.ts` 수정 — POST/PATCH에 publishedAt 처리
        - `src/app/admin/vod/page.tsx` 수정 — 추가 폼 제작일 필드, 인라인 수정
        - [x] 3.2.1 테스트 코드 수정 (`__tests__/api/admin-vod.test.ts`)
        - [x] 3.2.2 테스트 실행 및 검증

    - [x] 3.3 프론트 VOD 목록에 제작일 표시 (커밋 단위)
        - `src/components/vod-card.tsx` 수정 — publishedAt 표시
        - [x] 3.3.1 UI 렌더링 확인

    - [x] 3.4 프론트 VOD 재생 화면에 제작일/설명 표시 (커밋 단위)
        - `src/app/vod/[id]/page.tsx` 수정 — publishedAt + description 표시
        - [x] 3.4.1 UI 렌더링 확인

---

- [x] **4.0 배너 시스템** (Push 단위)

    - [x] 4.1 DB 스키마 — banners 테이블 추가
        - `supabase-schema.sql` 수정 — banners 테이블 추가
        - `src/lib/types.ts` 수정 — Banner 인터페이스 추가
        - [x] 4.1.1 빌드 및 타입 체크 확인

    - [x] 4.2 배너 CRUD API 및 kv 함수
        - `src/app/api/admin/banners/route.ts` 생성 — GET/POST/DELETE/PATCH
        - `src/lib/kv.ts` — getBanners/addBanner/deleteBanner/updateBannerOrder 추가
        - [x] 4.2.1 빌드 확인

    - [x] 4.3 배너 조회 API (유저용)
        - `src/app/api/banners/route.ts` 생성 — position 필터링
        - [x] 4.3.1 빌드 확인

    - [x] 4.4 배너 캐러셀 컴포넌트
        - `src/components/banner-carousel.tsx` 생성
        - [x] 4.4.1 빌드 확인

    - [x] 4.5 어드민 배너 관리 UI
        - `src/app/admin/vod/page.tsx` 수정 — "배너 관리" 섹션 추가
        - 이미지 업로드 + link_url + position + isRandom 토글
            - 배너 목록 표시 (썸네일, 위치, 순서 변경, 삭제)
        - [ ] 4.5.1 CRUD 동작 확인
        - [ ] 4.5.2 오류 수정 (필요 시)

    - [ ] 4.6 VOD 목록/재생 페이지에 배너 표시 (커밋 단위)
        - `src/app/vod/page.tsx` 수정
            - 헤더 하단에 `<BannerCarousel position="list" />` 추가
        - `src/app/vod/[id]/page.tsx` 수정
            - 플레이어 하단에 `<BannerCarousel position="player" />` 추가
    - [x] 4.6 VOD 목록/재생 페이지에 배너 표시
        - `src/app/vod/page.tsx` — 헤더 하단 BannerCarousel position="list"
        - `src/app/vod/[id]/page.tsx` — 플레이어 하단 BannerCarousel position="player"
        - [x] 4.6.1 빌드 확인

---


---

- [ ] **5.0 전화번호 입력 포맷팅** (Push 단위)

    - [ ] 6.1 로그인 페이지 전화번호 자동 하이픈 삽입 (커밋 단위)
        - `src/app/login/page.tsx` 수정
            - 숫자 외 문자 입력 차단, 최대 11자리(숫자 기준)
            - 실시간 포맷팅: `010` → `010-`, `01012345678` → `010-1234-5678`
            - 입력값은 하이픈 포함 형태 (`010-1234-5678`)로 관리
            - `verifyChallenge` 호출 시 하이픈 포함 값 전달
        - [ ] 6.1.1 포맷팅 동작 확인 (입력, 백스페이스, 붙여넣기)
        - [ ] 6.1.2 오류 수정 (필요 시)

    - [ ] 6.2 예외 유저 추가 폼 전화번호 자동 하이픈 삽입 (커밋 단위)
        - `src/app/admin/vod/page.tsx` 수정
            - 예외 유저 추가 시 전화번호 입력도 동일한 포맷팅 적용
        - `src/app/api/admin/users/route.ts` 수정
            - 전화번호 검증 정규식: `/^010-\d{4}-\d{4}$/` (하이픈 포함)
        - `src/lib/kv.ts` 수정
            - `isAllowedUser()` 검증 시 하이픈 포함 형태와 매칭
        - [ ] 6.2.1 테스트 코드 작성 (`__tests__/api/admin-vod.test.ts`)
        - [ ] 6.2.2 테스트 실행 및 검증
        - [ ] 6.2.3 오류 수정 (필요 시)

---

- [ ] **6.0 영상 리스트뷰 / 썸네일뷰 전환** (Push 단위)

    - [ ] 7.1 리스트뷰 컴포넌트 구현 (커밋 단위)
        - `src/components/vod-list-item.tsx` 생성
            - 테이블 행 형태: 제목 / 제작일 / 설명 한 줄 표시
            - 클릭 시 `/vod/[id]`로 이동
            - 호버 효과
        - [ ] 7.1.1 컴포넌트 렌더링 확인
        - [ ] 7.1.2 오류 수정 (필요 시)

    - [ ] 7.2 VOD 목록 페이지에 뷰 전환 기능 추가 (커밋 단위)
        - `src/app/vod/page.tsx` 수정
            - 목록 상단에 그리드/리스트 아이콘 버튼 추가 (shadcn/ui ToggleGroup 또는 두 버튼)
            - 상태(`viewMode: 'grid' | 'list'`)로 현재 뷰 관리
            - `localStorage`에 뷰 설정 저장 (재방문 시 유지)
            - 썸네일뷰: 기존 `VodCard` 그리드
            - 리스트뷰: `VodListItem` 테이블
        - [ ] 7.2.1 뷰 전환 동작 확인
        - [ ] 7.2.2 오류 수정 (필요 시)
