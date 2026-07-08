# 특정 유저 대상 1회성 안내 팝업 — 설계 스펙 (2026-07-09)

## 목적

어드민이 특정 유저에게 보내는 1회성 안내 팝업. 주 용도는 **CS/보상 안내**
(예: 결제 장애 사과 + 보상 별 지급 안내). 보상 별 지급 자체는 기존 어드민
별 조정 기능으로 별도 수행하고, 팝업은 **순수 텍스트 안내만** 담당한다.

## 결정 사항

- 용도: CS/보상 안내 (자유 텍스트)
- 별 지급 연동: 없음 — 지급은 기존 어드민 기능, 팝업은 안내만
- 1회성 기준: **유저가 "확인" 버튼을 눌러야 소멸** (acknowledged_at 기록).
  안 읽고 이탈하면 다음 진입 때 다시 노출 — 전달 보장
- 노출 시점: 로그인 상태로 사이트 진입 시(첫 페이지 로드) 1회 체크.
  `/login`, `/admin` 라우트에선 노출 안 함

## 구조

### 1. DB — `user_popups` 마이그레이션

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK → users | ON DELETE CASCADE (탈퇴 시 자동 정리) |
| title | text | |
| body | text | |
| created_by | uuid | 작성 어드민 |
| created_at | timestamptz | |
| acknowledged_at | timestamptz null | null = 미확인 |

- 유저당 여러 건 허용. 노출은 **오래된 미확인 건부터 1개씩**
- 부분 인덱스: `(user_id) WHERE acknowledged_at IS NULL`
- RLS: service_role 전용 (기존 어드민 테이블 패턴)

### 2. 어드민 — `/admin/users/[id]` 상세에 "팝업 메시지" 섹션

- 제목 + 내용 입력 → 보내기 (`POST /api/admin/users/[id]/popups`)
- 보낸 팝업 이력 목록 (확인 시각 표시)
- 미확인 팝업 **회수(삭제)** 버튼 (`DELETE /api/admin/popups/[id]`) — 오발송 대응
- `admin_actions` 감사 로그 기록 (기존 패턴)
- 인증: `requireAdmin`

### 3. 유저 노출 — AppShell 통합

- AppShell 마운트 시 1회 `GET /api/me/popups` → 미확인 중 가장 오래된 1건
- 있으면 포털 모달 (기존 `ContinuationModal` 패턴 — 헤더/탭/풋터 덮는 별콩이 톤 카드)
- "확인했어" 버튼 → `POST /api/me/popups/[id]/ack` → acknowledged_at 기록 → 닫힘
- ack 는 멱등 (이미 확인된 건 200) — 중복 클릭/다중 기기 안전

### 4. 보안/엣지

- 조회·ack 는 세션 userId 본인 소유 팝업만
- 탈퇴 시 CASCADE 삭제, star_transactions 같은 audit 성격 아님
- 어드민 라우트는 requireAdmin + admin_actions 기록

## 구현 규모

마이그레이션 1 + API 3 (어드민 작성/회수, 유저 조회+ack) + 모달 1 + 어드민 폼 1
— 한 사이클(커밋 2~3개) 분량.

## 상태

기획 승인 대기 → 구현 착수는 사용자 지시 시.
