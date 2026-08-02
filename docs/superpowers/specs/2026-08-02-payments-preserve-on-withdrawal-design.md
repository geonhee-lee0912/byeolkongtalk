# 탈퇴 유저 매출 보존 (payments 익명화) — 설계

- 날짜: 2026-08-02
- 상태: 설계 승인 (구현 대기)
- 관련 함정: AGENTS.md "`users(id)` 참조 FK" · "NULL 3값 논리" · "카나리아로 실물 검증"

## 문제

회원 탈퇴 시 그 유저의 결제 기록(`payments`)이 **물리적으로 삭제**되어 어드민 매출 지표에서 영구히 사라진다. 실제 정산된 돈(토스)은 그대로인데 내부 지표만 과소 집계된다.

### 실측 (2026-08-02 KST, prod)

- 토스 PG 실제 결제: **12,700원** (취소 0건)
- 살아있는 `payments` completed: **6,800원** (5건), refunded 0건
- 오늘 탈퇴: **2건** (마지막 17:01 KST)
- 차액 **5,900원** = 오늘 결제 후 탈퇴한 유저의 결제행이 증발한 금액

"아까 12,000원이었는데 다시 6,800원이 됐다"는 관측의 정체 = 매출 조회 사이에 유저가 탈퇴하면서 그 결제행이 사라진 것.

## 근본 원인

1. `payments.user_id` FK 가 `ON DELETE CASCADE` — [20260608000000_payments.sql:7](../../../supabase/migrations/20260608000000_payments.sql)
2. 탈퇴 라우트가 `users` 행을 DELETE — [app/api/auth/withdraw/route.ts:109](../../../app/api/auth/withdraw/route.ts)
3. 매출 RPC 는 살아있는 `payments` 만 SUM — [admin_dashboard_revenue](../../../supabase/migrations/20260731020000_admin_paywall_aggregates.sql)

→ 매출에서 돈이 빠지는 경로는 **환불(status 변경)** 과 **탈퇴(행 삭제)** 둘뿐. 이번은 환불 0건이므로 탈퇴가 원인으로 확정.

## 목표 / 성공 기준

- 유저가 탈퇴해도 그 결제 금액이 어드민 **총 매출**(대시보드·트렌드·상품)에서 사라지지 않는다.
- 탈퇴 유저의 **개인정보는 계속 삭제**된다(결제행은 익명으로만 보존).
- 신규 결제·기존 흐름은 무변.

## 설계

### 1. 스키마 (신규 마이그레이션)

`payments.user_id` 를 nullable 로 바꾸고 FK 를 `SET NULL` 로 전환.

```sql
ALTER TABLE payments ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE payments DROP CONSTRAINT payments_user_id_fkey;  -- 실제 이름 정보스키마로 확인
ALTER TABLE payments ADD CONSTRAINT payments_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
```

- 탈퇴 시 결제행은 남고 `user_id` 만 NULL — 금액·시각·`pg_tid`·패키지 전부 보존.
- 개인정보 관점: `user_id` 만 끊으면 개인 식별 불가. 전자상거래법 거래기록 보관과도 부합.
- 기존 인덱스 `idx_payments_user(user_id, created_at)` 는 그대로 유효(NULL 도 인덱싱됨).

### 2. 매출 SUM 3곳 — NULL 포함 (핵심)

**익명화만으로는 매출이 살아나지 않는다.** 매출 SUM 들이 `user_id <> ALL(p_exclude)` 를 쓰는데, SQL 3값 논리에서 `NULL <> ALL(...)` 은 `false` 가 아니라 **`NULL`** 이라 그 행이 WHERE 에서 탈락한다. 반드시 세트로 고친다:

필터를 `(user_id IS NULL OR user_id <> ALL(p_exclude))` 로 교체:

- `admin_dashboard_revenue` — [20260731020000:142](../../../supabase/migrations/20260731020000_admin_paywall_aggregates.sql) (대시보드 오늘/어제/누적)
- `admin_analytics_trend` — [20260731010000:53](../../../supabase/migrations/20260731010000_admin_analytics_aggregates.sql) (트렌드 일별 매출)
- `admin_product_breakdown` package 갈래 — [20260731010000:119](../../../supabase/migrations/20260731010000_admin_analytics_aggregates.sql) (패키지별 매출)

RPC 는 `CREATE OR REPLACE` 로 갱신(같은 마이그레이션 파일). 시그니처 불변이므로 REVOKE/GRANT 재실행 불필요하나, 관례상 함께 둔다.

### 3. 결제자 판별 지점 — 의도적으로 안 건드림

- `admin_funnel`([176](../../../supabase/migrations/20260731010000_admin_analytics_aggregates.sql))·`admin_cohorts`([237](../../../supabase/migrations/20260731010000_admin_analytics_aggregates.sql)): `payments.user_id = users.id` 조인이라 익명(NULL) 결제는 자동 제외된다. 소재·코호트는 "살아있는 가입자에게 귀속되는 매출"이 정의이므로 이게 옳다.
- **의도된 불일치**: 총 매출(2번)은 탈퇴분 포함, 소재별·코호트 매출은 살아있는 유저분만. 두 값이 다를 수 있음을 인지할 것.
- `admin_paywall_aggregates` 의 `DISTINCT p.user_id`([29](../../../supabase/migrations/20260731020000_admin_paywall_aggregates.sql))에 `AND p.user_id IS NOT NULL` 추가 — 익명 NULL 이 "결제 유저"로 집계되지 않게.

### 4. 결제 화면 NULL 방어

- [app/admin/payments/page.tsx:74](../../../app/admin/payments/page.tsx) `p.user_id.slice(0,8)` 는 NULL 이면 크래시 → NULL 이면 `(탈퇴)` 표시.
- 같은 파일의 `star_balances` 조회 대상(`userIds`)에서 NULL 제외.

### 5. 표시 정책 — 단순 합산 (YAGNI)

매출 숫자만 정확해진다. "탈퇴분 별도 표기"는 넣지 않는다 — 익명화로 매출이 더는 줄지 않아 '왜 줄었지' 혼란 자체가 사라지기 때문. 필요하면 후속.

## 범위 밖 / 한계

- **과거 소실분은 복구 불가** — 이미 하드 삭제되어 DB 에 없다. 이번 수정은 앞으로 발생분만. (토스 정산 대사로 과거 보정은 별도 작업.)
- 별 잔액/거래(`star_transactions`·`star_balances`)는 탈퇴 시 계속 삭제 — 매출 집계는 `payments` 만 쓰므로 무관.

## 검증

매출 RPC 는 자동 계약 테스트가 없다. **카나리아**로 dev 에서 실물 확인:

1. 임시 유저 생성 → `payments` 에 completed 결제행 INSERT
2. `admin_dashboard_revenue` / `admin_analytics_trend` 가 그 금액을 포함하는지 확인 (기준값 A)
3. 그 유저 DELETE (`users`)
4. `payments` 행이 `user_id=NULL` 로 **남아있는지** 확인 (CASCADE 아님을 증명)
5. 매출 RPC 3개가 여전히 그 금액을 포함하는지 확인 (= 기준값 A 유지 → 수정 성공)
6. `admin_funnel`/`admin_cohorts` 는 그 금액을 **제외**하는지, paywall 결제자 수에 NULL 이 안 끼는지 확인
7. 결제 화면이 NULL user_id 행에서 크래시 없이 `(탈퇴)` 로 렌더되는지

## 영향받는 파일

- 신규: `supabase/migrations/<ts>_payments_preserve_on_withdrawal.sql` (스키마 + 매출 RPC 3개 `CREATE OR REPLACE` + paywall DISTINCT 가드)
- 수정: `app/admin/payments/page.tsx` (NULL 방어)
- 무변경(확인만): `app/api/payment/confirm/route.ts`(신규 결제는 항상 user_id 있음), `admin_funnel`/`admin_cohorts`
