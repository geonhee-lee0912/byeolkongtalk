# 어드민 집계 전면 RPC 전환 — spec (2026-07-28)

**성격**: 설계 + 인수인계. 실행은 별도 세션.
**동기**: Supabase `Max rows` cap 사고(2026-07-28)로 어드민 집계가 조용히 틀렸던 것을 발견. 개별 픽스 대신 **어드민 집계 전체를 SQL 집계(RPC)로 전환**하기로 결정.
**배포 제약 없음**: 어드민 전용 = 유저 퍼널 미접촉 → 판정 창(day 0 = 2026-07-26) 배포 슬롯 규율 밖.

---

## 1. 사고 요약 (왜 이걸 하는가)

`/admin` 과 `/admin/traffic` 의 오늘 UV 가 25 vs 2 로 어긋난 것에서 출발.

**원인**: Supabase 프로젝트의 `Max rows`(Data API 설정, 기본 1000)가 앱 코드의 `.limit(100000)` 을 덮어쓴다.
`.limit()` 은 **클라이언트 희망 상한**, `Max rows` 는 **서버 강제 상한**. 서버가 이긴다.

**왜 조용했나** — 이게 핵심:
- PostgREST 는 HTTP 200 + `Content-Range: 0-999/*` 로 응답
- supabase-js 는 이 헤더를 `error` 로 승격시키지 않음 → `data` 에 1,000행, `error` 는 `null`
- 앱은 "전부 받았다"고 착각. `.limit(100000)` 이 오히려 "대비했다"는 착각을 강화
- 쿼리에 `ORDER BY` 도 없어 **어느 1,000행이 오는지 미정의**

**중요**: cap 은 PostgREST(HTTP API) 레이어에만 걸린다. SQL Editor / `scripts/run-prod-query.mjs` 는 Postgres 직결이라 **무관**.

---

## 2. 실측 감사 결과 (2026-07-28, prod)

전체 행수(1차):

| 테이블/창 | 행수 |
|---|---|
| `messages` 전체 | 6,074 |
| `page_views` 30일 | 2,140 |
| `star_transactions` 전체 | 1,450 |
| `readings` 30일 = 84일 = 누적 | 732 |
| `users` 30일 = 누적 | 630 · `star_balances` 630 |
| `payments` 누적 73 · completed 30일 72 · `relationships` 29 |

실제 결과셋(2차, `in(...)` 필터 반영):

| 쿼리 | 결과셋 | 판정 |
|---|---|---|
| `paywall` `[END]`감지 messages | **3,090** | 🔴 1,000만 수신 (67.6% 유실) |
| `traffic` page_views 30일 | **2,140** | 🔴 1,000만 수신 (53.3% 유실) |
| paywall 미전환 유저 readings | 719 | 🟢 |
| 대시보드 최근2일 소비자 원장 | 125 | 🟢 |
| relationship 전체 스레드 messages | 112 | 🟢 |
| 그 외 전부 | <1,000 | 🟢 |

**결론 — 실제로 틀렸던 화면은 2개뿐**:
1. `/admin/traffic` UV·PV (라우트별·유입별·로그인전후 포함)
2. `/admin/paywall` 상담 완료 퍼널 — 완료율이 **~21% 로 표시됐으나 실제 63.7%** (3배 왜곡)

**오염되지 않은 것**:
- `/admin/analytics` 4개 라우트 전부 (cohorts users 84일 = 630 < 1000)
- `/admin` 대시보드 KPI·매출·무료별 귀속 (page_views 2일 = 897 로 턱걸이 통과)
- `/admin/relationship*`
- **판정·스펙 문서 전부** — `specs/2026-07-26-unviewed-results-findings.md` 등은 `run-prod-query.mjs`(raw SQL) 소스라 cap 무관. 종료 356 / 열람 288 / 미열람 68 **유효**.

**교차검증 (cap 상향 후, 30일 창)**: 상담 시작 628 → 완료 400(63.7%) → 열람 320(80.0%) → 미열람 80건(20.0%).
미열람률 20.0% 가 스펙의 19.1% 와 일치 → 화면과 raw SQL 근거가 같은 현실을 가리킴을 확인.

---

## 3. 성장 추세 — 왜 미룰 수 없나

`page_views` 주간 (비콘은 2026-07-20 배포. 그 이전 행 0 = **30일 창이 아직 안 찼다**):

| 주 | PV | UV | 일평균 |
|---|---|---|---|
| 2026-07-20 (7일 완전) | 1,095 | 140 | 156 |
| 2026-07-27 (2일치) | 1,045 | 83 | **522** |
| 어제 하루 (대시보드) | 732 | 54 | **732** |

현재 속도로 30일 창 만재 시 **15,000~22,000 PV**.

- `Max rows` = 10,000 이면 → **만재 시 초과**. `(10,000 − 2,140) / 600 ≈ 13일` → **2026-08-10 경 재발**
- 성장이 가팔라지면 8월 초

⚠️ **PV/UV 가 7.8 → 13.6 으로 튀었는데 가입은 안 늘었다**(어제 31, 30일 평균 ~21). 미탐 봇 또는 광고 랜딩 반복 조회 가능성 — 별건이지만 트래픽 해석 전에 확인 필요.

---

## 4. 전환 대상 인벤토리

`.limit(100000)` **31곳** + `.limit()` 없이 cap 노출 **~7곳**:

| 파일 | 라인 | 비고 |
|---|---|---|
| `app/api/admin/traffic/route.ts` | 47 | 🔴 최우선. 4개 집계 |
| `app/admin/paywall/page.tsx` | 32·45·60·74·88 | 🔴 88이 `[END]` 감지 |
| `app/admin/page.tsx` | 48·72·95·125 | 대시보드. 125=page_views |
| `app/api/admin/analytics/trends/route.ts` | 26·27·28 | |
| `app/api/admin/analytics/products/route.ts` | 26·31·47·72 | **53은 `.limit()` 없음** |
| `app/api/admin/analytics/funnel/route.ts` | 28·31·43·46·48 | |
| `app/api/admin/analytics/cohorts/route.ts` | 24·31·34 | 84일 창 |
| `app/api/admin/stats/route.ts` | 27 | ⚠️ 대시보드와 중복 집계 — 통합 검토 |
| `app/admin/relationship/page.tsx` | 44 | **28~37은 `.limit()` 없음** |
| `app/admin/relationship-readings/page.tsx` | 57 | **37~46은 `.limit()` 없음** |
| `app/admin/ads/page.tsx` | 14·15 | |
| `app/admin/popups/page.tsx` | 28 | |

다음에 천장에 닿을 순서 (10,000 기준): `analytics` readings 30일 13.7배 → `paywall` star_balances 15.9배(**누적 유저 수와 1:1**) → `cohorts` users 84일 15.9배.

---

## 5. 설계

### 원칙
> **어드민 집계는 원본 행을 앱으로 끌어오지 않는다.** 집계는 Postgres 에서, 앱은 결과만 받는다.

행수가 데이터량과 무관하게 고정되므로 cap 개념 자체가 소멸한다 (일별 추세 = 항상 30행, PV 100배여도 30행).
부수 효과: 응답 빨라짐 + `Max rows` 를 다시 낮게(=anon 스크래핑 노출 최소) 되돌릴 수 있음.

### 재현해야 할 규칙 4가지 (드리프트 주의)

1. **오전 10시 롤오버** — `lib/admin-time.ts` `adminKstDate`. SQL: `((created_at + interval '9 hours' - interval '10 hours')::date)`
   ⚠️ `/admin/analytics` 트렌드와 연애 일일 턴은 **KST 자정** 기준. 섞지 말 것 (`admin-time.ts` 주석 표 참조)
2. **봇 제외** — `is_bot = false`. 단 `buildBotShare` 는 봇 포함 전체가 분모
3. **어드민 제외** — `page_views` 는 비로그인 행 `user_id IS NULL`. `NOT IN` 단독 사용 시 SQL 3값 논리로 비로그인 행이 전멸.
   SQL: `(user_id is null or user_id <> all(p_exclude))`
4. **first-touch 귀속** (`buildEntrySources`) — anon_id 의 가장 이른 `landing_variant`/`utm_content` 로 그 방문자의 **모든 행**을 귀속.
   `first_value(...) over (partition by anon_id order by created_at)` + `{{...}}` 리터럴은 `(매크로 미치환)` 버킷으로 접기

### 예시

```sql
create or replace function admin_traffic_trend(p_since timestamptz, p_exclude uuid[])
returns table (bucket date, uv bigint, pv bigint)
language sql stable security definer as $$
  select ((created_at + interval '9 hours' - interval '10 hours')::date),
         count(distinct anon_id), count(*)
  from page_views
  where created_at >= p_since
    and is_bot = false
    and (user_id is null or user_id <> all(p_exclude))
  group by 1 order by 1;
$$;
```

앱: `supa.rpc("admin_traffic_trend", { p_since, p_exclude })`. 게이트는 라우트의 `requireAdmin` 이 계속 담당(RPC 는 service_role 전용).

### 마이그레이션
`supabase/migrations/<timestamp>_admin_aggregates.sql`. dev push → Supabase dev 자동 적용 / main 머지 → prod 자동 적용. push 후 Workflow logs SUCCESS 확인.

---

## 6. 검증 프로토콜 (⚠️ 이게 유일한 안전장치)

**`lib/analytics/{traffic,aggregate}.ts` 에 테스트가 없다.** `package.json` 에 `test` 스크립트·러너 부재(테스트 파일은 `lib/continuation.test.ts`·`lib/acquisition.test.ts`·`qa/report.test.ts` 3개뿐). 따라서 리그레션 감지는 **before/after 값 대조뿐**.

1. **착수 전 스냅샷 필수** — 어드민 15화면 + `/api/admin/*` JSON 응답을 기록. 이게 정답지다.
2. ⚠️ **스냅샷은 값이 맞는 구간에서만 유효** — `Max rows` 가 결과셋보다 커야 한다. cap 에 걸린 상태에서 뜬 스냅샷은 **잘린 값을 정답으로 굳힌다**. 착수 전 §3 의 재발 시점(≈2026-08-10)을 반드시 확인.
3. RPC 전환 후 동일 창으로 재조회 → 값 일치 확인. 불일치는 전부 §5 규칙 4가지 중 하나의 드리프트로 의심.
4. 교차검증용 고정점: 상담 퍼널 **628 / 400 / 320** (30일, 어드민 미제외, 2026-07-28 기준)

---

## 7. 선행 조치 (B 착수 전)

- [ ] **`Max rows` 상향** — Data API 설정. B 의 정확성 전제조건(§6-2). 현재 `10,000` → `50,000` 권장
- [ ] B 완료 후 `Max rows` 를 낮은 값으로 원복 (RPC 는 cap 무관해지므로)
- [ ] AGENTS.md **코딩 규칙**에 §5 원칙 1줄 + **운영 함정**에 §1 3줄 추가

## 8. 드롭된 대안 (기록용)

- **A. 절단 감지** (`count:"exact"` 로 받아 `data.length < count` 면 warn) — B 전면 적용이 흡수. 점진 전환 시에만 유효
- **③-lite. paywall `.like("content","%[END]%")`** — 3,090행 → ~400행 + 본문 전송 제거. B가 이 쿼리를 재작성하므로 불필요. **단 B가 지연되면 1줄 이득으로 살아있음**
- **C. `.range()` 페이지네이션** — 천장은 없애지만 대량 행을 앱 메모리로 끌어오는 구조는 그대로 → 결국 B 필요

## 관련
- `docs/superpowers/specs/2026-07-26-unviewed-results-findings.md` (미열람 근거, cap 무관)
- `lib/admin-time.ts` (날짜 기준 표) · `lib/analytics/traffic.ts` (현행 집계 정본)
