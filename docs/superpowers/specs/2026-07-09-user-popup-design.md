# 유저 대상 1회성 안내 팝업 (개별 + 전체 발송) — 설계 스펙 (2026-07-09)

## 목적

어드민이 유저에게 보내는 1회성 안내 팝업. 두 가지 발송 모드:

1. **개별 발송** — 특정 유저 1명 대상. 주 용도 CS/보상 안내
   (예: 결제 장애 사과 + 보상 별 지급 안내)
2. **전체 발송** — 로그인 유저 전원 대상 공지 (예: 점검 안내, 이벤트, 사과문)

보상 별 지급 자체는 기존 어드민 별 조정 기능으로 별도 수행하고, 팝업은
**순수 텍스트 안내만** 담당한다.

## 결정 사항

- 별 지급 연동: 없음 — 지급은 기존 어드민 기능, 팝업은 안내만
- 1회성 기준: **유저가 "확인" 버튼을 눌러야 그 유저에게서 소멸**.
  안 읽고 이탈하면 다음 진입 때 다시 노출 — 전달 보장
- 노출 시점: 로그인 상태로 사이트 진입 시(첫 페이지 로드) 1회 체크.
  `/login`, `/admin` 라우트에선 노출 안 함
- 전체 발송은 발송 이후 가입한 신규 유저에게도 노출됨 (회수 전까지).
  기간 한정이 필요하면 어드민이 회수로 종료 — 자동 만료(ends_at)는 YAGNI

## 구조

### 1. DB — 팝업/확인 분리 (전체 발송 대응)

**`popups`** — 팝업 본체 (전체 발송도 row 1개)

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | uuid PK | |
| target_user_id | uuid FK → users, **NULL 허용** | NULL = 전체 발송 / 값 있으면 개별 발송. ON DELETE CASCADE |
| title | text | |
| body | text | |
| created_by | uuid | 작성 어드민 |
| created_at | timestamptz | |

**`popup_acks`** — 유저별 확인 기록

| 컬럼 | 타입 | 비고 |
|---|---|---|
| popup_id | uuid FK → popups | ON DELETE CASCADE |
| user_id | uuid FK → users | ON DELETE CASCADE (탈퇴 시 자동 정리) |
| acknowledged_at | timestamptz | |
| PK | (popup_id, user_id) | ack 멱등 보장 |

- 노출 판정: `(target_user_id = 나 OR target_user_id IS NULL)` AND
  내 ack row 없음 → **오래된 것부터 1개씩**
- RLS: service_role 전용 (기존 어드민 테이블 패턴)

### 2. 어드민 UI — 발송 위치 2곳

**개별 발송** — `/admin/users/[id]` 상세에 "팝업 메시지" 섹션
- 제목 + 내용 입력 → 보내기 (`POST /api/admin/popups`, body 에 target_user_id)
- 해당 유저에게 보낸 이력 + 확인 시각 표시

**전체 발송** — 어드민 nav 에 "공지 팝업" 메뉴 (`/admin/popups`)
- 제목 + 내용 입력 → 전체 발송 (같은 POST, target_user_id 없이)
- 발송 목록: 각 건의 **확인 수 / 현재 유저 수** 카운트 표시
- 실수 방지: 전체 발송은 확인 다이얼로그 1회 ("전 유저에게 노출됩니다")

**공통**
- **회수(삭제)** 버튼 (`DELETE /api/admin/popups/[id]`) — 오발송 대응.
  삭제 시 acks 도 CASCADE. 회수하면 아직 안 본 유저에게도 더 이상 노출 안 됨
- `admin_actions` 감사 로그 기록 (발송/회수 모두, 기존 패턴)
- 인증: `requireAdmin`

### 3. 유저 노출 — AppShell 통합

- AppShell 마운트 시 1회 `GET /api/me/popups` → 노출 대상 중 가장 오래된 1건
- 있으면 포털 모달 (기존 `ContinuationModal` 패턴 — 헤더/탭/풋터 덮는 별콩이 톤 카드)
- "확인했어" 버튼 → `POST /api/me/popups/[id]/ack` → popup_acks INSERT → 닫힘
- ack 멱등: PK 충돌 시 200 (중복 클릭/다중 기기 안전)
- 여러 건 대기 중이어도 진입당 1건만 — 다음 진입 때 다음 건 노출 (팝업 연타 방지)

### 4. 보안/엣지

- 조회는 세션 userId 기준 본인 대상 팝업만, ack 도 본인 것만 INSERT
- 전체 발송 유저 수가 커져도 발송은 row 1개 — 부하 없음.
  확인율 카운트는 `popup_acks` count 로 계산
- 탈퇴 시 acks CASCADE 삭제. 재가입하면 전체 공지를 다시 볼 수 있음 (허용)

## 구현 규모

마이그레이션 1 (테이블 2) + API 3 (어드민 발송/회수, 유저 조회+ack)
+ 모달 1 + 어드민 화면 2 (유저 상세 섹션, 공지 팝업 페이지 + nav)
— 한 사이클 반(커밋 3~4개) 분량.

## 상태

기획 승인 대기 → 구현 착수는 사용자 지시 시.
