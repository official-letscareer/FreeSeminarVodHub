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

### 5.5 VOD 이용권 판정 (LC-3438)

렛츠커리어 서버가 VOD 이용권을 도입하면서 시청 가능 여부를 `canWatchVod` 로 내려준다. 설정
`require_vod_pass`(어드민 화면의 "이용권 보유자만 접근 허용" 토글)가 켜져 있을 때만 이 값으로
접근을 판정한다. 기본값은 OFF 이므로 켜기 전에는 기존 판정(챌린지 참여자·옵션 필터)이 그대로 동작한다.

SSO 로그인 사용자의 판정은 다음과 같다(`src/lib/vodAccess.ts`).

| require_vod_pass | canWatchVod | 미활성 이용권 | 결과 |
|------------------|-------------|---------------|------|
| OFF | 무관 | 무관 | 기존 판정 |
| ON | true | 무관 | 통과 |
| ON | false | 있음 | 403 `VOD_PASS_INACTIVE`, 활성화 안내 모달 |
| ON | false | 없음 | 401, 로그인 화면 |
| ON | 필드 없음 | 무관 | 기존 판정으로 되돌아감(이용권을 모르는 구버전 서버) |

- 이용권 목록 조회가 실패하면 "미활성 이용권 없음" 과 같이 401 로 처리한다.
- 예외 유저(`allowed_users`)와 프리미엄 유저(`/api/auth/verify-membership`) 우회는 이 설정과 무관하게 유지된다.
- 설정은 `access_settings.require_vod_pass` 컬럼에 저장된다(`docs/supabase-schema.sql`). 이미 운영 중인
  Supabase 에는 같은 파일의 `ALTER TABLE` 문을 사람이 직접 실행해야 저장된다.

활성화 흐름은 다음과 같다.

1. `/vod`, `/vod/[id]` 가 `/api/vod` 계열에서 403 `VOD_PASS_INACTIVE` 를 받는다. 본문에는 활성화 대상
   이용권(`pass.applicationId`, `durationDays`, `expectedEndDate`)과 미활성 이용권 개수(`inactiveCount`)가 있다.
2. `/login` 으로 보내지 않고 활성화 안내 모달(`src/components/vod-pass-activation-dialog.tsx`)을 연다.
   카카오톡·슬랙으로 공유받은 `/vod/[id]` 직접 진입도 같다.
3. "사용하기" 는 `POST /api/vod/pass/activate`(본문 `{ applicationId }`)를 호출하고, 이 라우트가 렛츠커리어
   서버의 `POST /api/v1/vod-pass/{applicationId}/activate` 로 전달한다. 성공하면 목록 또는 같은 VOD 를 다시
   조회한다.
4. 409(기간 충돌, 환불 확인 중, 취소됨)이면 렛츠커리어 서버가 준 메시지를 모달 안에 보여주고 닫지 않는다.
5. "나중에" 는 목록 화면에서 "이용권을 활성화하면 시청할 수 있습니다" 빈 상태와 다시 열기 버튼을 보여주고,
   재생 화면에서는 `/vod` 로 돌아간다.

- 활성화 대상은 미활성 이용권 중 가장 먼저 구매한 것(`applicationId` 가 가장 작은 것)이다. 선택 화면은 없다.
- 활성화하면 이용 기간이 바로 시작되고 환불할 수 없다. 모달이 이를 고지한다.
- 예상 종료일은 지금(KST) + `durationDays` 로 계산한 값이다. 실제 종료 시각은 활성화 순간 렛츠커리어 서버가 정한다.
- SSO 팝업으로 방금 로그인한 비활성 이용권 보유자도 로그인된 것으로 본다(`src/app/login/page.tsx` 의
  `isAuthorized()` 가 403 `VOD_PASS_INACTIVE` 를 통과로 판정).
- 미들웨어(`src/middleware.ts`)는 쿠키 존재만 보므로 바꾸지 않았고, 링크 미리보기(`generateMetadata`)도 그대로다.

이름 + 전화번호 경로(`src/app/api/auth/verify/route.ts`)의 한계는 다음과 같다.

- JWT 가 없어 이용권을 조회하거나 활성화할 수 없다. `verify-challenge` 응답의 `canWatchVod` 만 받는다.
- 설정이 ON 이고 `canWatchVod` 가 내려오면 기존 필터 대신 그 값으로 판정한다. `false` 이면 응답
  `message` 로 "렛츠커리어 로그인으로 이용권을 확인해주세요." 를 안내한다. 미활성 이용권을 가졌는지는 알 수
  없으므로 이용권이 없다고 단정하지 않는다.
- `canWatchVod` 가 `true` 여도 `verify-challenge` 가 챌린지 참여(`isChallenge`)를 `false` 로 내려주면 이
  경로로는 통과하지 못한다. 이 경우 렛츠커리어 로그인을 써야 한다.
- `auth_verified` 쿠키는 이용권 종료를 반영하지 못한다. 설정이 ON 이면 쿠키 수명을 24시간으로 줄이고,
  OFF 이거나 예외 유저이면 기존대로 1년이다.

새 환경변수는 없다. 이용권 조회·활성화 호출도 기존 `LETSCAREER_API_URL` 을 쓴다.

### 5.6 이용 로그 (LC-3438)

사용자가 VOD 사이트에서 무엇을 했는지(어떤 영상을 재생했는지, 재생하다 멈췄는지, 어디까지 봤는지,
페이지만 이동했는지)를 Supabase `vod_usage_logs` 테이블에 남긴다. 테이블 정의는
`docs/supabase-usage-log.sql` 이다. 이 레포가 실행하지 않으며, 사람이 Supabase SQL Editor 에서 한 번
실행한다. 테이블이 없어도 사이트는 정상 동작한다. 로그 저장만 실패하고 서버 로그에 남는다.

저장하는 항목은 다음과 같다.

| 항목 | 컬럼 | 비고 |
|------|------|------|
| 이벤트 종류 | `event_type` | 아래 이벤트 표 |
| 발생 시각, 수신 시각 | `occurred_at`, `created_at` | 발생 시각이 서버 시각 기준 -24시간 ~ +1시간을 벗어나면 서버 시각으로 대체 |
| 탭 단위 세션 | `session_id` | sessionStorage 의 난수. 탭을 닫으면 사라진다 |
| 인증 방식 | `auth_method` | `sso` 또는 `verified`(이름+전화번호, 예외 유저, 프리미엄 명단) |
| 이름 | `user_name` | SSO 프로필 이름 또는 이름+전화번호 로그인에 입력한 이름 |
| 사용자 키 | `user_key` | SSO 는 SHA-256(`sso:` + 이름), 이름+전화번호는 SHA-256(`이름:전화번호`) |
| 영상 | `vod_id`, `youtube_id` | |
| 페이지 | `page_path` | 쿼리 스트링을 뺀 경로(`/vod`, `/vod/12`) |
| 재생 위치, 영상 길이, 누적 시청 시간 | `position_sec`, `duration_sec`, `watched_sec` | 소수 첫째 자리, 초 단위 |
| 이벤트별 부가 값 | `detail` | JSONB |
| 브라우저 | `user_agent` | 200자까지 |

저장하지 않는 항목은 다음과 같다.

- 전화번호 원문. 이름+전화번호 로그인은 브라우저가 SHA-256 해시만 만들어 보낸다. `crypto.subtle` 을 쓸
  수 없는 환경(HTTPS 가 아닌 주소 등)에서는 `user_key` 가 비고 이름만 남는다.
- IP 주소.
- 이용권 자격 판정 결과와 접근 거부 사유.

누적 시청 시간(`watched_sec`)은 재생 상태로 있었던 실제 경과 시간의 합이다. 재생 위치의 차이로 계산하지
않으므로 건너뛰기와 되감기는 들어가지 않고, 버퍼링 시간도 세지 않는다.

이벤트는 다음과 같다. 이 목록 밖의 값은 서버가 거절한다.

| event_type | 발생 시점 | detail |
|------------|-----------|--------|
| `page_view` | `/vod` 를 열었을 때, `/vod/[id]` 에서 영상이 로드됐을 때 | 없음 |
| `page_leave` | 페이지를 떠나거나 탭을 닫을 때 | `dwell_sec`(머문 시간) |
| `video_ready` | YouTube 플레이어가 준비됐을 때 | 없음 |
| `video_play` | 재생을 시작했을 때. 버퍼링 뒤 자동 재개는 세지 않는다 | 없음 |
| `video_pause` | 일시정지했을 때 | 없음 |
| `video_ended` | 끝까지 재생했을 때 | 없음 |
| `video_seek` | 10초 건너뛰기, 진행 바 이동. 진행 바를 끄는 동안은 하나로 묶어 마지막 위치만 남긴다 | `from_sec`, `to_sec`, `method`(`skip` 또는 `scrub`) |
| `video_rate_change` | 배속을 바꿨을 때 | `rate` |
| `video_fullscreen` | 전체화면을 켜거나 껐을 때 | `on` |
| `video_progress` | 재생 중 30초마다 | 없음 |
| `video_leave` | 영상 화면을 떠날 때. 마지막 위치와 누적 시청 시간 | 없음 |
| `pass_prompt_shown` | 이용권 활성화 안내 모달이 열렸을 때 | 없음 |
| `pass_activated` | 이용권 활성화에 성공했을 때 | 없음 |
| `pass_activate_failed` | 이용권 활성화에 실패했을 때 | `status`(HTTP 상태 코드, 응답을 받지 못했으면 0) |

수집 흐름은 다음과 같다.

1. 브라우저(`src/lib/usageLog.ts`)가 이벤트를 큐에 쌓고, 5초 뒤 또는 20개가 되면
   `POST /api/vod/log` 로 보낸다. 탭이 숨겨지거나 페이지를 떠날 때는 `navigator.sendBeacon` 으로 즉시
   보낸다. 실패하면 조용히 버리고 다시 보내지 않는다. 재생과 화면 동작에는 영향이 없다.
2. 서버(`src/app/api/vod/log/route.ts`)가 `sanitizeUsageBatch`(`src/lib/usageLogEvents.ts`)로 본문을
   검증한다. 규칙을 어긴 이벤트는 버리고 나머지는 남긴다. 한 번에 이벤트 1~50개, `detail` 은 키 20개
   이내, 값은 문자열(100자 이내)·숫자·불리언·null 만 받는다.
3. 인증은 쿠키로 판단한다. 이용권 자격(`canWatchVod` 등)은 검사하지 않는다.
   - SSO 토큰 쿠키가 있으면 렛츠커리어 서버로 프로필을 확인해 그 이름을 쓴다. 클라이언트가 보낸 이름과
     키는 무시한다. 프로필을 받지 못하면 401 이다.
   - SSO 쿠키가 없고 `auth_verified=1` 이면 클라이언트가 보낸 이름과 키를 그대로 저장한다.
   - 둘 다 없으면 401 이다.
4. `kv.insertUsageLogs` 가 여러 행을 한 번에 insert 한다.

응답은 저장 성공 204, 본문 오류 400, 인증 없음 401, 저장소 오류나 테이블 없음 202(`{"ok":false}`)이다.
어떤 경우에도 500 을 내지 않는다.

이름+전화번호 로그인 사용자의 이름과 키는 브라우저가 보낸 값이라 위조될 수 있다. 이 경로는 서버가 이름을
확인할 수단이 없다. 분석용 참고 값으로만 본다.

`vod_usage_logs` 는 RLS 를 켜고 anon, authenticated 에 INSERT 만 허용한다(SELECT 정책이 없다). 이 사이트는
`NEXT_PUBLIC_*` 공개 키로 Supabase 에 접근하므로, SELECT 를 열면 브라우저에 실린 키만으로 이용자 이름이
들어 있는 로그를 읽을 수 있다. 기존 테이블이 RLS 를 꺼 둔 방식과 일부러 다르게 했다. 같은 이유로
`insertUsageLogs` 는 insert 뒤에 `.select()` 를 붙이지 않는다. 삽입한 행을 되읽으려는 요청은 SELECT 정책이
없어 실패한다.

로그 조회는 Supabase 대시보드(Table Editor, SQL Editor)에서 한다. 영상별 재생 횟수와 한 세션의 시간순
흐름을 보는 예시 쿼리는 `docs/supabase-usage-log.sql` 하단에 있다. 로그는 자동으로 지워지지 않으므로
180일이 지난 행은 주기적으로 직접 지운다.

```sql
DELETE FROM vod_usage_logs WHERE occurred_at < NOW() - INTERVAL '180 days';
```

한계는 다음과 같다.

- 탭을 강제 종료하거나 모바일에서 브라우저가 백그라운드 상태로 종료되면 마지막 이벤트(`page_leave`,
  `video_leave`)가 남지 않을 수 있다. 이 경우 마지막 `video_progress` 가 가장 가까운 기록이다.
- 광고 차단 확장 프로그램이 `/api/vod/log` 요청을 막으면 그 사용자의 로그는 남지 않는다.
- 렛츠커리어 로그인 사용자의 로그 배치마다 렛츠커리어 서버로 프로필 조회가 한 번 나간다. 배치는 최소 5초
  간격이다.

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
| `POST` | `/api/vod/pass/activate` | VOD 이용권 활성화 (LC-3438, 5.5) | SSO 토큰 |
| `POST` | `/api/vod/log` | VOD 이용 로그 수집 (LC-3438, 5.6) | SSO 토큰 또는 세션 |
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