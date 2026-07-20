# 어드민 개편 — 별 소모 분석 + 연애 상담 지표 — 설계

**작성일**: 2026-07-20
**상태**: 브레인스토밍 완료 · 사용자 승인 (2026-07-20) → writing-plans
**배경**: W1 사이클 1~3에서 상품·종목·결제 구조가 크게 바뀌었으나(사주 상담 폐쇄·운세 리포트 재편·태그 v3·**연애 상담 신설**=패스/스킬 별 소모) 어드민이 미반영. 특히 광고까지 걸어 수요 테스트하는 **연애 상담(신상품) 성과를 어드민에서 볼 수 없음**.
**작업 큐**: `memory/w1-w7-work-queue.md` "3f 이후 사용자 추가 후속 ①".
**배포**: dev 개발 → prod 반영. 3e prod 일괄에 편입할지 별도 배포할지는 착수 시 결정(사용자는 시점을 "광고 이후"로 지정). **마이그레이션 없음(조회·집계만).**

---

## 0. 한 줄 요약

`star_transactions`(모든 별 소모/충전)를 종목·상품으로 분류하는 엔진을 만들어, ① 대시보드에 별 소모 매출·연애상담 핵심 KPI 요약 ② 애널리틱스에 별 소모 상품 분석 ③ 신규 `/admin/relationship` 메뉴에 연애 상담 리텐션 지표를 붙인다.

---

## 1. 진단 (현재 갭 3개)

**✅ 이미 반영됨**: `lib/fortune/types.ts`에 신규 상품 config(궁합 40·관계궁합 35·좋은날 35·2026사주 60·이번달 20·오늘 무료) 존재, 타로 리포트는 `active:false` 하위호환. `fortuneTypeFromTag`가 이를 읽어 **운세 리포트 상품 판정은 정상**.

**❌ 갭 1 — 연애 상담(우리 사이)이 어드민에 통째로 안 보임**: nav 12개에 메뉴 없음 / 패스 구매·갱신·연장·스킬 호출이 전부 별 소모(`star_transactions`)인데 집계 부재 / 스레드 리딩(`consultation_type='relationship'`)이 집계 타입에서 누락.

**❌ 갭 2 — 별 소모 상품이 매출 분석에서 누락**: 현재 `products` route가 `readings.stars_spent` + `payments`(현금)만 조회. 패스/연장/인챗 업셀(clarifier·extend)/일부 스킬이 `star_transactions`에만 있어 안 보이거나 뭉뚱그려짐.

**❌ 갭 3 — `consultation_type='relationship'` 타입 갭**: `aggregate.ReadingRow`가 `"saju"|"tarot"`만 → relationship row 분류 이상 (`app/admin/analytics/page.tsx`·`app/api/admin/analytics/products/route.ts`).

---

## 2. star_transactions source 전수 매핑 (조사 결과, 2026-07-20)

스키마: `type`('charge'|'spend'|'bonus'|'refund' — 실제 spend/charge만), `amount`(양수), `source`(VARCHAR50 NOT NULL), `payment_id`(charge 멱등), `reading_id`(FK→readings, spend 일부만). INSERT는 RPC 3개뿐(`spend_stars`·`charge_stars`·`purchase_relationship_pass`).

| source | 의미 | spend/charge | reading_id | 정의 |
|---|---|---|---|---|
| `saju_reading` | 사주 대화 리딩(신규·이어가기) | spend | O | `api/readings/route.ts`·`readings/continue` |
| `tarot_reading` | 타로 대화 리딩(+연애상담 타로 스킬 섞임) | spend | O | `api/consultations/tarot/route.ts` |
| `clarifier` | 타로 추가질문(인챗 업셀) | spend | O | `consultations/tarot/clarifier` |
| `extend` | 대화 턴 연장(사주/타로 공통 업셀) | spend | O | `api/readings/[id]/extend` |
| `fortune_<type>` | 운세 리포트 11종(+연애상담 궁합 스킬 섞임) | spend | **X(NULL)** | `api/fortune/create` |
| `rel_skill_verdict` | 연애상담 싸움 판정 스킬 | spend | O | `api/relationship/verdict` |
| `rel_extend` | 연애상담 스레드 턴 연장 | spend | O(nullable) | `api/relationship/extend` |
| `relationship_pass` | 연애상담 패스 구매/연장 | spend | X | `purchase_relationship_pass` RPC / `api/relationship/pass` |
| `admin_adjust` | 어드민 수동 차감/충전 | spend/charge | X | `api/admin/users/[id]/stars/adjust` |
| `reading` | 레거시 generic | spend | 선택 | `lib/stars.ts` |
| `pg` | 토스 별 충전 | charge | X(payment_id O) | `api/payment/confirm` |
| `welcome_bonus` | 신규가입 환영 별 | charge | X | `api/auth/kakao` |
| `first_charge_bonus` | 첫 충전 보너스 | charge | X | `api/payment/confirm` |
| `fortune_refund_<type>` | 운세 실패 자동 환불 | charge | X | `api/fortune/create` |

⚠️ **분류 함정**:
- `tarot_reading`에 순수 타로 + **연애상담 타로 스킬**(체크인·속마음)이 섞임 → `readings.relationship_id`/`skill_key`로만 구분.
- `fortune_compat`에 독립 궁합 + **연애상담 '우리 궁합' 스킬**이 섞임 → 동일.
- `fortune_<type>` spend는 **reading_id NULL**(조인 불가) → source 접미사로만 상품 식별.
- `clarifier`/`extend`는 사주/타로 미구분(공통 업셀).

---

## 3. 별 소모 분류 규칙 (분류 엔진의 핵심)

`star_transactions` 각 spend 행을 아래 우선순위로 (종목, 상품)에 매핑:

1. **`reading_id` 있음** → `readings` 조인:
   - `relationship_id` 또는 `skill_key` 존재 → **연애상담** (skill_key로 스킬 종류)
   - `emotion_tag LIKE 'fortune:%'` → **운세 리포트** (`fortuneTypeFromTag`)
   - else `consultation_type` = `saju`/`tarot` → **사주/타로 대화 상담** (emotion_tag=태그)
2. **`reading_id` NULL + source `fortune_<type>`** → **운세 리포트**(source 파싱). ⚠️ 연애상담 '우리 궁합' 스킬도 `fortune_compat`+reading_id NULL로 기록돼 독립 궁합 리포트와 **star_transactions에서 구분 불가** → compat 리포트로 집계됨(소폭 과다계상 감수). 정밀 분리는 후속(§7). 반면 체크인·속마음 스킬은 `tarot_reading`+reading_id+`relationship_id`라 규칙 1에서 연애상담으로 정상 분류, 판정 스킬은 `rel_skill_verdict` source로 정상 분류됨.
3. **source `relationship_pass`/`rel_extend`/`rel_skill_verdict`** → **연애상담**(패스/연장/판정)
4. **source `clarifier`/`extend`** → **인챗 업셀**(별도 분류; 종목은 reading 조인으로 사주/타로 보강 가능, 미보강 시 '업셀'로 묶음)
5. **source `pg`/`welcome_bonus`/`first_charge_bonus`/`fortune_refund_*`/`admin_adjust`** → **상품 아님**(충전·보너스·조정 — 매출 분석에서 별도 처리, 상품 breakdown 제외)

→ `lib/analytics/aggregate.ts`에 순수 함수 `buildStarSpendBreakdown(transactions, readingsById)` 신설. 서버(route)가 star_transactions + 관련 readings를 조회해 매핑 테이블로 전달. 순수 함수 = node:test 유닛 커버.

---

## 4. 설계

### A. 별 소모 분류 엔진 (공통 기반)
- `lib/analytics/aggregate.ts`:
  - `ReadingRow.consultation_type` 타입에 `"relationship"` 추가 (갭 3 해소) + `relationship_id`/`skill_key` 필드.
  - `StarTxRow` 타입 + `buildStarSpendBreakdown(...)`: §3 규칙으로 (종목→상품) 집계 = {건수, 별합계, 유니크 유저}.
- 조회 route가 `star_transactions`(기간) + 그 `reading_id`들의 `readings`를 조인 조회.

### B. `/admin` 대시보드 — 요약 KPI 추가 (`app/admin/page.tsx`)
현재(오늘/7일/전체 × 신규가입·리딩·현금매출) 유지 + 추가 섹션:
- **별 소모 매출**: 총 소모 별 + 종목별 4분류(사주 대화/타로 대화/운세 리포트/연애상담) — 기간별.
- **연애상담 핵심 3종**: 활성 패스 수(현재 `expires_at > now`) · 기간 내 패스 구매 수 · 스킬 호출 수.
- (현금 매출은 payments, 별 소모는 star_transactions — 두 축 라벨 명확히.)

### C. `/admin/analytics` — 별 소모 상품 개편 (`app/admin/analytics/page.tsx` + products route)
- 기존 상품 breakdown(counsel/fortune/packages)에 **별 소모 상품 표** 추가/개편:
  - 종목 → 상품별 표: 소모 건수 · 별 합계 · 유니크 유저.
  - **현금(충전 패키지)** 과 **별 소모(상품)** 두 축 분리 표시.
  - **인챗 업셀(clarifier/extend)** 별도 라인(전환 통로 관찰용).
- products route: readings+payments 조회에 **star_transactions + reading 조인** 추가. relationship 타입 포함.

### D. `/admin/relationship` — 신규 메뉴 (연애 상담 상세) ⭐
- nav(`app/admin/layout.tsx`)에 항목 추가(예: 💞 연애 상담).
- 신규 화면 `app/admin/relationship/page.tsx` + 필요 시 API `app/api/admin/relationship/route.ts`.
- 데이터: `relationships`(관계 파일) · `relationship_passes`(패스) · `star_transactions`(rel_* source) · `readings`(relationship 스레드/스킬).
- **지표(리텐션 중심, 승인)**:
  - 관계 등록 수 · 활성 스레드 수
  - 패스: 종류별(1일/3일/7일) 구매 · **갱신(재구매)** · 연장 횟수 · 패스 매출(별)
  - 스킬 호출 (체크인/속마음/궁합/판정 4종별)
  - 리텐션: 복귀율 · 스레드 지속(평균 턴·일수) · 소프트캡 도달 · 5별 연장 빈도
  - **대화 흐름 (페이월 스타일)** — 연애 상담은 [END] 없는 지속 스레드라 "끝/텀" 정의가 사주·타로와 다름:
    - 방문 세션 흐름: 방문당 평균 턴 · **소프트캡(20턴/일) 도달률**(오늘 대화 소진) · 5별 연장 도달률
    - 텀/간격: 재방문 간격 분포 · **체크인 후 복귀 텀** · 마지막 방문 후 경과(이탈 리스트)
    - 패스 활용: 구매→첫 사용 텀 · **패스 기간 실사용률**(사용일/총일) · 만료 vs 갱신

### E. 어드민 메뉴 위계 (접이식 그룹) — `app/admin/layout.tsx`
현재 13개 flat nav를 **홈 + 접이식 그룹 4개**로 재구성:
- 🏠 **대시보드** = 홈 (최상단 단독, 그룹 밖)
- 📈 **분석·성과**: 애널리틱스 · 연애 상담 · 페이월 · 광고 지출
- 👥 **운영·고객**: 사용자 · 리딩/상담 · 결제/정산 · 문의 · 운세 환불
- 🚨 **모니터링**: 민감 알림 · 에러 로그
- 📢 **콘텐츠**: 공지 팝업

- **접이식**: 그룹 헤더 클릭 → 소메뉴 펼침/접힘. **현재 경로가 속한 그룹은 기본 펼침**.
- 미처리 뱃지(문의·민감·에러/warn)는 소메뉴에 유지 + **접힌 그룹 헤더에 합계 뱃지** 표시(펼치지 않아도 인지).
- 구현: 뱃지 데이터는 서버(layout) 조회 유지 → nav를 **client 컴포넌트로 분리**(`components/admin/AdminNav.tsx`)해 펼침 토글 상태 관리(현재 pathname으로 초기 펼침 판정).

---

## 5. 데이터 소스 / 조회

- `star_transactions`: 기간 필터 + 어드민 제외(`adminExclusionList`). 대량 대비 `.limit(100000)` 관례 유지. (규모 커지면 SUM RPC — 현재 범위 밖.)
- `readings`: star_transactions의 reading_id 집합으로 조인 조회(consultation_type·emotion_tag·relationship_id·skill_key·saju_product).
- `relationships`·`relationship_passes`: D 메뉴용.
- 모든 집계는 어드민 활동 제외 리스트 적용(기존 관례).

---

## 6. 파일 변경 요약

| 파일 | 변경 |
|---|---|
| `lib/analytics/aggregate.ts` | ReadingRow에 relationship 타입+필드, `buildStarSpendBreakdown`·연애상담 집계 함수 신설 |
| `lib/analytics/aggregate.test.ts` | 신규 함수 유닛(분류 함정 케이스 포함) |
| `app/api/admin/analytics/products/route.ts` | star_transactions+readings 조인 조회 |
| `app/admin/page.tsx` | 별 소모 매출 + 연애상담 KPI 섹션 |
| `app/admin/analytics/page.tsx` | 별 소모 상품 표 |
| `app/admin/layout.tsx` | nav 접이식 그룹 재구성(홈+4그룹) + 뱃지 서버 조회 전달 |
| `components/admin/AdminNav.tsx` | 신규 — 접이식 그룹 nav (client, 펼침 토글·현재 경로 자동 펼침) |
| `app/admin/relationship/page.tsx` | 신규 화면(연애 상담 지표 + 대화 흐름) |
| `app/api/admin/relationship/route.ts` | 신규 API(필요 시) |

**마이그레이션 없음** (전부 조회/집계).

---

## 7. 미확정 / 리스크

- `clarifier`/`extend` 업셀의 종목 보강(reading 조인으로 사주/타로 구분)까지 할지 vs '업셀' 단일 라인 — 구현 시 간단한 쪽부터(단일 라인) 시작, 필요 시 보강.
- star_transactions + readings 2단 조회의 성능(현 규모 수천 행 → 무해). SUM RPC 전환은 범위 밖.
- D 메뉴 API를 별도로 둘지, page.tsx 서버 컴포넌트에서 직접 조회할지(대시보드 page.tsx 선례처럼 직접) — 구현 시 대시보드 패턴 따름.
- **연애상담 '우리 궁합' 스킬 별 소모**가 `fortune_compat`(reading_id NULL)로 기록돼 독립 compat 리포트와 star_transactions에서 구분 불가 → compat 리포트에 합산(과다계상). 정밀 분리는 fortune create가 연애상담 컨텍스트를 star tx source/메타에 싣는 후속 필요 — 이 사이클 범위 밖(D 메뉴는 `relationships`/`relationship_passes` 직접 조회라 이 한계와 무관하게 궁합 스킬 호출 수는 별도 집계 가능).
- **F 대화 흐름의 '방문/세션' 정의**(연속 대화를 몇 시간 갭으로 끊을지)는 구현 시 확정 — `messages`·`readings` `created_at` 기반. 재방문 간격/복귀 텀도 동일 소스.
- 배포 타이밍(3e 편입 vs 별도) — 사용자 결정.

---

## 8. 성공 기준

- 대시보드에서 별 소모 매출(종목별) + 연애상담 활성 패스·구매·스킬이 한눈에.
- 애널리틱스에서 패스/스킬/업셀 포함 전 상품 별 소모가 종목별로 분류돼 보임.
- `/admin/relationship`에서 패스 갱신율·복귀율 등 신상품 리텐션 확인 가능.
- `buildStarSpendBreakdown` 유닛(분류 함정 케이스) PASS · `npm run build` 그린.
