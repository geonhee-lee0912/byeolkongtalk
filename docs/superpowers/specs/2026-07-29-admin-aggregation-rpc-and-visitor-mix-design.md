# 어드민 집계 RPC 전면 전환 + 방문자 구성(신규/연속/복귀) — design (2026-07-29)

**성격**: 설계. 선행 스펙 `2026-07-28-admin-aggregation-rpc-migration.md` 를 **대체하지 않고 개정·확장**한다.
**두 가지를 한 판에 묶는 이유**: 신규/재방문 판정은 "그 방문자가 **조회창 밖에서도** 처음인가"를 물어야 한다. 원본 행을 앱으로 끌어오지 않는 RPC 구조에서만 깨끗하게 계산되므로, 따로 만들면 두 번 쓴다.
**배포 규율**: 판정 창(day 0 = 2026-07-26)의 창 중간 예외 조항은 *"유저 비가시만 — 어드민 전용 · **마이그레이션 0** · 새 env 0 · 프롬프트 바이트 무변경"* 이다. 이 작업은 **마이그레이션이 있으므로 조항 문구에는 걸린다.**

**2026-07-29 사용자 결정: 이 작업에 한해 허용한다.** 근거 — ①`CREATE OR REPLACE FUNCTION` 만이고 **테이블·RLS·유저 데이터 변경 0** ②`REVOKE ... FROM PUBLIC` + `/api/admin/*` 만 호출 = **유저 표면 0**(권한은 §6 에서 anon 키로 실검증한다) ③"마이그레이션 0" 조항의 취지는 *유저에게 보이는 변화 차단*이고 읽기 전용 집계 함수 추가는 그 취지를 위반하지 않는다 ④`/admin/traffic` 의 cap 재발 예상 시점이 **2026-08-11**(일별 PV 실측 평균 637 기준)이라 d14 슬롯(8/9)까지 기다리면 여유가 이틀뿐이다.

⚠️ **이 예외는 이 스펙의 작업에만 적용된다.** 다음에 어드민 마이그레이션이 필요할 때 "전례가 있다"로 자동 연장하지 말 것 — 위 4개 근거를 그 작업에 대해 다시 확인해야 한다.

---

## 1. 선행 스펙 정정 3건

착수 전 인벤토리에서 선행 스펙의 전제 3개가 틀렸음을 확인했다.

### 1-1. 🔴 "테스트가 없다"는 오판 — 5개 있다

선행 스펙 §6 은 *"`lib/analytics/{traffic,aggregate}.ts` 에 테스트가 없다 → 리그레션 감지는 before/after 값 대조뿐"* 을 전제로 검증 프로토콜을 짰다. **틀렸다.**

```
lib/analytics/traffic.test.ts        14,161 bytes   (21 tests, 전부 통과 확인)
lib/analytics/aggregate.test.ts      12,852 bytes
lib/analytics/apiCost.test.ts         2,961 bytes
lib/analytics/pageview.test.ts        3,413 bytes
lib/analytics/route-labels.test.ts    2,497 bytes
```

오판 원인: `package.json` 에 `test` 스크립트가 없다(러너는 `node --import tsx --test`). 스크립트 부재를 테스트 부재로 읽은 것.

**결과**: 순수 함수를 **삭제하지 않는다**. RPC 결과의 대조 기준이면서 회귀 자산이다.

### 1-2. 🔴 §6-1 "어드민 15화면 스냅샷 = 정답지" 폐기

스펙 §6-1 은 착수 전 화면 스냅샷을 정답지로 삼으라 했다. 그런데 **화면 2개(`/admin/traffic`·`/admin/paywall`)는 이미 값이 틀려 있다**(스펙 §2 가 실측). 그 스냅샷을 정답지로 삼으면 **잘린 값을 정답으로 굳힌다** — 스펙 §6-2 가 스스로 경고한 함정에 §6-1 이 걸려 있다.

**대체**: 정답지를 raw SQL 로 만든다 (§6).

### 1-4. 🔴 인벤토리가 12파일만 봤다 — 어드민은 21화면 · 28라우트다

선행 스펙 §4 는 `.limit(100000)` 이 있는 **12파일**만 나열했고, 이 문서도 처음엔 그걸 그대로 받았다. 실제로는 **어드민 페이지 21개 · `/api/admin` 라우트 28개**다.

2026-07-29 미조사 9화면을 전수 확인한 결과 **2건이 안전하지 않았다**(§4 종류 E). 발견 경위가 중요하다 — 최초에 "`.limit(50~300)` 이니 cap 아래라 안전"으로 판정했는데, 그 기준 자체가 틀렸다. **`.limit()` 은 cap 을 막아주지만 그 위의 집계를 전수로 만들어주지 않는다.**

### 1-3. §4 인벤토리 보강 — 38곳은 한 종류가 아니다

스펙 §4 는 `.limit(100000)` 31곳 + `.limit()` 없음 ~7곳으로 셌지만, **성질이 다른 3종류가 섞여 있다**(§4). 한 규칙으로 밀면 2곳은 전환해도 문제가 남고, 2곳은 전환하면 유지비가 오른다.

또한 `.limit()` 조차 없는 곳이 스펙 추정보다 많다 — `/admin/relationship` I1~I4 전부 + `/admin/relationship-readings` 6쿼리 중 5개.

---

## 2. 신규 기능 — 방문자 구성(신규 / 연속 / 복귀)

### 2-1. 목적

**"리텐션이 생겼나"를 매일 상시로 판독한다.** W5(3주째 재방문 실유저 0)의 답이 나오고 있는지, 트랙B(캘린더·데일리) 판정의 근거가 되는지를 어드민 화면에서 바로 읽는다.

명시적으로 **목적이 아닌 것**: 봇 판별 · 광고 소재 품질 평가. (둘 다 이 분해로 곁눈질은 되지만 설계 목표에서 제외 — 목표를 늘리면 버킷이 늘고 한 줄로 안 읽힌다)

### 2-2. 정의

**식별자** = `page_views.anon_id`. NULL 인 행은 어느 버킷에도 세지 않고 PV 만 기여 — 현행 UV 규칙(`lib/analytics/traffic.ts` 헤더 주석) 그대로 승계.

**버킷** = **오전 10시 롤오버** (`adminKstDate`). SQL: `((created_at + interval '9 hours' - interval '10 hours')::date)`.
⚠️ `/admin/analytics` 트렌드와 연애 일일 턴의 KST 자정 기준과 **섞지 말 것**.

**분류** — 방문자 A 의 그 버킷 직전 방문 버킷(`prev`) 하나로 전부 갈린다:

| `prev` | 분류 | 뜻 |
|---|---|---|
| 없음 | **신규** | 기록상 이 버킷이 첫 방문 |
| `bucket - 1일` | **연속** | 어제도 왔고 오늘도 |
| `bucket - 2일` 이하 | **복귀** | 며칠 만에 돌아옴 |

배타적·완전 → **신규 + 연속 + 복귀 = 그 버킷 UV**. 카드 한 줄의 산술이 맞는다.
**재방문율 = (연속 + 복귀) / UV**, 소수 1자리 (`pct1` 관행).

### 2-3. 🔴 prev 계산은 조회창에 의존해선 안 된다

30일 창 안에서만 `prev` 를 계산하면 두 가지가 동시에 틀린다:

1. 창 밖에 첫 방문이 있던 방문자가 **신규로 오분류**
2. 가장 오래된 버킷의 연속/복귀 구분이 **전부 틀림**(그 앞 버킷이 창 밖)

그래서 `lag()` 를 **전체 테이블**에 돌린 뒤 창 필터를 나중에 건다. 원본 행을 앱으로 끌어올 수 없으므로 **이 지표는 RPC 로만 가능하다.**

```sql
create or replace function admin_traffic_visitor_mix(p_since timestamptz, p_exclude uuid[])
returns table (bucket date, uv bigint, new_uv bigint, streak_uv bigint, back_uv bigint)
language sql stable security definer as $$
  with v as (
    -- 창 무관. 봇·어드민 제외를 여기서도 동일 적용 (2-4 함정 1)
    select distinct
           anon_id,
           ((created_at + interval '9 hours' - interval '10 hours')::date) as bucket
    from page_views
    where anon_id is not null
      and is_bot = false
      and (user_id is null or user_id <> all(p_exclude))
  ), lagged as (
    select anon_id, bucket,
           lag(bucket) over (partition by anon_id order by bucket) as prev
    from v
  )
  select bucket,
         count(*)::bigint                                          as uv,
         count(*) filter (where prev is null)::bigint              as new_uv,
         count(*) filter (where prev = bucket - 1)::bigint         as streak_uv,
         count(*) filter (where prev < bucket - 1)::bigint         as back_uv
  from lagged
  where bucket >= ((p_since + interval '9 hours' - interval '10 hours')::date)
  group by bucket
  order by bucket;
$$;
```

`v` 가 `(anon_id, bucket)` distinct 이므로 `count(*)` = distinct 방문자 수 = 현행 `buildTrafficTrend` 의 `uv` 와 동일 정의.
비용: 전체 스캔이지만 `page_views` 는 현재 2,140행(만재 예상 22,000). `idx_page_views_anon(anon_id, created_at)` 존재. 무시할 수준.

### 2-4. 정의상 함정 4개 — 전부 의도적 결정

1. **봇·어드민 제외를 `prev` 계산에도 똑같이 걸어야 한다.**
   안 걸면 봇으로 오분류된 하루나 운영자로 돌아본 날이 그 `anon_id` 의 첫 방문이 되어, **실제 사람의 첫 방문이 영원히 "복귀"로 잡힌다.**
2. **좌측 절단** — `page_views` 첫 행은 **2026-07-25**(prod 실측). 그 이전 방문자는 기록이 없어 첫 등장일에 신규로 잡힌다. **7/25 는 정의상 신규 100%**(65/65 실측). 화면에 주석으로 명시.
   ⚠️ 선행 스펙 §3 은 비콘 배포를 "2026-07-20" 이라 적었는데 **틀렸다** — 그건 주 시작 버킷 라벨(월요일)이었고 배포일이 아니다. 마이그레이션 파일명도 `20260725000000_page_views.sql` 이다.
3. **쿠키 삭제·시크릿창·기기 변경 = 재방문 과소.** `anon_id` 가 새로 발급되어 신규로 세어진다. **방향이 보수적**이라("리텐션 생겼다" 오진이 아니라 놓치는 쪽) 목적에 안전.
4. **어드민 로그아웃 상태 PV 는 여전히 안 걸러진다** — `anon_id ↔ 어드민` 매핑이 없다. 현행 `traffic/route.ts:39-41` 이 이미 자인한 한계를 그대로 승계.

**기각된 식별 대안** (재논의 방지):
- `anon → user` 상향 접기(한 번이라도 로그인한 `anon_id` 를 그 `user_id` 로 병합): 폰↔PC 재방문을 잡지만 **UV 토탈이 현행 정의보다 작아져 기준 2개가 공존**한다. 카드 한 줄의 산술(`신규+재방문=UV`)이 깨지므로 기각.
- `user_id` 전용: 리텐션 분모로는 가장 가깝지만 트래픽 화면의 UV 와 다른 것을 재게 되어 같은 이유로 기각.

### 2-5. 표현

`components/admin/Stat.tsx` 의 `children` 은 값과 **같은 줄**(flex items-baseline)에 들어가 `Delta` 자리다. 서브라인은 아래 줄이 필요하므로 **`Stat` 에 `sub?: ReactNode` prop 을 추가**한다. 공유 컴포넌트에 두는 이유는 그 파일 헤더 주석이 명시한 바와 같다 — 화면마다 복제하면 표기가 조용히 갈린다.

**A. `/admin` 메인 대시보드** — UV 카드에 축약 한 줄만:

```
┌─────────────────────────┐
│ UV                      │
│ 54   +28.6% (어제 42)   │
│ 신규 41 · 재방문 13     │  ← sub
└─────────────────────────┘
```

카드 6개가 이미 빽빽하고, 아침에는 방향만 알면 된다. 연속/복귀 세부는 한 클릭 옆.

**B. `/admin/traffic`** — 두 곳:

```
오늘 (오전 10시 기준 · 어제 대비)
┌──────────────────────────────────────────┐  ┌──────────────┐
│ 오늘 UV                                  │  │ 오늘 PV      │
│ 54   +28.6% (어제 42)                    │  │ 732   ▲      │
│ 신규 41 · 연속 8 · 복귀 5 · 재방문 24.1% │  │              │
└──────────────────────────────────────────┘  └──────────────┘

── 일별 UV / PV ──         (기존 2선 차트 — 선을 추가하지 않는다)

── 방문자 구성 ──          (신규 섹션)
  [3선 차트 30일: 신규 #E8C26A · 연속 #6EE7B7 · 복귀 #B8A8D8]

  날짜     UV   신규  연속  복귀  재방문율     ← 최신순 14행
  07-29    54    41     8     5     24.1%
  07-28    48    40     6     2     16.7%
  …
```

**주석 3줄** (화면 하단):
- 차트는 30일 전체, 표는 최근 14일
- 2026-07-25 이전 방문 기록이 없어(비콘 배포일) 수집 초기 며칠은 신규가 과대 집계됨
- 쿠키 삭제·시크릿창·기기 변경은 재방문을 신규로 세므로 재방문은 과소 추정

**결정 근거**:
- 기존 UV·PV 차트에 선을 **추가하지 않는다** — 4선이면 UV↔PV 대비를 읽던 원래 용도가 죽는다.
- 표는 **최신순**. 기존 표들은 순위순이지만 이건 날짜 표라 최신이 위가 맞다.
- 표를 14일로 자르는 이유: 30일 추세는 차트가 담당하고, 30행 표는 스크롤이 길어 아침 판독을 방해한다.

---

## 3. 원칙 (선행 스펙 §5 승계)

> **어드민 집계는 원본 행을 앱으로 끌어오지 않는다.** 집계는 Postgres 에서, 앱은 결과만 받는다.

행수가 데이터량과 무관하게 고정되므로 `Max rows` cap 개념 자체가 소멸한다. 부수 효과: 응답 빨라짐 + cap 을 낮게 되돌려 anon 스크래핑 노출 최소화.

**재현해야 할 규칙 4가지** (선행 스펙 §5 그대로 — 드리프트 주의):

1. **오전 10시 롤오버** `((created_at + interval '9 hours' - interval '10 hours')::date)` vs **KST 자정** `((created_at + interval '9 hours')::date)`. 화면별 기준은 `lib/admin-time.ts` 주석 표가 정본. **섞지 말 것.**
2. **봇 제외** `is_bot = false`. 단 `buildBotShare` 는 봇 포함 전체가 분모 — 유일한 예외.
3. **어드민 제외** `page_views` 는 비로그인 행이 `user_id IS NULL` 이라 `NOT IN` 단독은 SQL 3값 논리로 비로그인 행을 전멸시킨다. → `(user_id is null or user_id <> all(p_exclude))`.
4. **first-touch 귀속** `anon_id` 의 가장 이른 `landing_variant`/`utm_content` 로 그 방문자의 **모든 행**을 귀속. `{{...}}` 리터럴은 `(매크로 미치환)` 버킷으로 접기.

**`lib/admin.ts` 시그니처 변경**: `adminExclusionList()` 는 PostgREST in-리스트 문자열 `"(uuid,uuid,…)"` 을 반환한다. RPC 는 `uuid[]` 배열 인자가 필요하다 → **배열 반환 함수를 병렬로 추가**한다(기존 함수는 미전환 화면이 계속 쓴다). 빈 화이트리스트에서 `<> all('{}')` 는 true 로 자연 동작하므로 RPC 측 null 분기는 불필요.

---

## 4. 🔴 38곳은 3종류다 — 종류별 처리 방침

이번 판의 가장 중요한 발견. 한 규칙으로 밀면 안 된다.

### 종류 A — 순수 집계, SQL 이 명백히 낫다 (~28곳, 전환 본체)

`analytics/trends` 3쿼리→1RPC · `traffic` 6집계 · `analytics/products` · `analytics/funnel` · `analytics/cohorts` · `paywall` KPI·상담 퍼널 · `relationship` 통계 · `ads` · `popups` · 대시보드 sum/count.

특히 이득이 큰 3곳:
- **`paywall` `[END]` 감지**: `messages.content` 본문 3,090행을 앱으로 끌어와 `includes("[END]")` → `exists (… and content like '%[END]%')` 로 pushdown. **3,090행 → 1행.** 완료율 3배 왜곡의 진원지.
- **`analytics/funnel`**: `userIds` 수백~수천 개를 `.in()` URL 에 싣던 2단 조회가 조인으로 소멸. cap 뿐 아니라 **URL 길이 한계도 같이 사라진다.**
- **`traffic` ↔ 대시보드 `page_views`**: 동일 select·동일 필터·동일 순수 함수. `admin_traffic_trend(p_since, …)` **단일 RPC 로 완전 통합**(대시보드는 `days=2`).

### 종류 B — 애초에 집계가 아니라 "행 목록" (2곳)

`/admin/paywall` 미전환 유저 목록 · `/admin/relationship-readings` 스레드 목록.

반환 행수가 **본질적으로 데이터 비례**라 RPC 화해도 cap 문제가 남는다. 필요한 것은 **`ORDER BY` + `LIMIT/OFFSET` 페이지네이션 + `.in()` 2단 조회의 조인 재작성**.

⚠️ 둘 다 현재 **`ORDER BY` 없이 `.limit()`** 이다 → 잘리면 어느 행이 오는지 **미정의**. `relationship-readings` 는 6쿼리 중 5개가 `.limit()` 조차 없다.

**결정: 이번 판에 포함.** 전면 전환을 선언한 이상 "전환했지만 여전히 잘릴 수 있는 화면"을 남기면 원칙이 무의미해진다.

### 종류 C — 상태머신 · 15단 분기 (2곳)

- **`attributeFreeSpend`** (`aggregate.ts:434`) — 유저별 원장을 시간순으로 걸으며 `freePool`/`freeUsed` 러닝 상태 유지. `spend` 는 `min(amount, freePool)` 클램프, `fortune_refund*` 환불은 `min(amount, freeUsed)` 역복원. **클램프가 누적에 되먹임되므로 윈도우 함수로 표현 불가** → recursive CTE 또는 plpgsql 루프 필요.
- **`buildStarSpendBreakdown`** (`aggregate.ts:347`) — 15단 우선순위 사다리. `clarifier`/`extend` 는 `reading_id` 가 있어도 `source` 가 권위 · `rel_skill_*` 6종은 조인하면 "스레드 대화"로 뭉개져 `source` 로 종목 복원 · `NON_PRODUCT_SOURCES` 4개 + `fortune_refund*` prefix 제외 · 조인 실패 폴백은 `source` prefix 파싱.

**결정: 종류 C 도 SQL 로 완전 이관한다.** (2026-07-29 사용자 결정 — "임시방편 말고 다 고친다")

#### 왜 "분류는 앱, 집계만 SQL" 축약안을 기각했나 — 그 안이 조용히 틀린다

축약안은 SQL 이 원자 키(`source`, 조인된 `consultation_type`/`emotion_tag`/`skill_key`)까지만 group-by 하고, 앱이 사다리로 최종 그룹(`domain`, `product`)을 만드는 구조였다. 여기에 **결함이 있다**:

`buildStarSpendBreakdown` 은 그룹별 **`count(distinct user_id)`** 를 낸다. **distinct 는 축약 행을 합산할 수 없다.** 같은 유저가 두 축약 행에 걸쳐 있으면 더하는 순간 중복 계수다. distinct 를 정확히 내려면 **최종 그룹 키를 SQL 이 알아야 한다 = 분류가 SQL 에 있어야 한다.**

우회안 2개도 기각: `user_ids uuid[]` 를 축약 행에 실어 보내기(행수는 고정이지만 payload 가 유저 수 비례 — 원본을 안 끌어온다는 원칙의 편법 위반) · 앱이 최종 그룹을 정한 뒤 2차 RPC 로 그룹별 distinct 를 재조회(왕복 2회 + 두 조회 사이 정의 일치를 사람이 보장해야 함).

#### 이관 방식

- **`buildStarSpendBreakdown` 15단 사다리** → SQL 함수 하나로 **단일화**: `admin_star_product_key(p_source text, p_consultation_type text, p_emotion_tag text, p_skill_key text) returns record(domain text, product text)`. 집계 RPC 는 이 함수로 분류한 뒤 `group by domain, product` → `count`, `sum(amount)`, `count(distinct user_id)`. 분류가 한 함수에 모이므로 SQL 쪽 복제는 1곳이다.
- **`attributeFreeSpend` 상태머신** → **plpgsql 루프**로. recursive CTE 도 가능하지만(유저별 `row_number` 부여 후 상태 전파) `min()` 클램프 되먹임을 CTE 로 쓰면 읽을 수 없다. plpgsql 루프는 앱 로직을 **1:1로 이식**할 수 있어 이식 오류 위험이 훨씬 낮다. 성능은 원장 크기 비례지만 Postgres 안이라 앱 전송은 0.
- **`fortuneTypeFromTag`** → 유효 운세 타입 배열을 **RPC 인자 `p_fortune_types text[]`** 로 넘긴다. `like 'fortune:%'` 만 쓰면 `'fortune:오타'` 를 앱은 상담, SQL 은 운세로 분류해 **조용히 어긋난다.** 배열을 앱(`FORTUNE_CONFIG`)에서 주입하면 유효 키 목록의 단일 원천이 유지된다.
- **`canonicalCreative`** → 별칭 맵을 **RPC 인자 `p_aliases jsonb`** 로 넘긴다. 같은 이유(단일 원천 유지). 현재 맵에 실제 항목이 1개 있어(`"새 판매 광고 - 사본" → "tarot"`) 무시하면 값이 바뀐다.

#### 🔴 드리프트 대책 — 이게 종류 C 이관의 유일한 안전장치

드리프트는 두 곳에 로직이 있는 것 자체가 아니라 **두 곳이 갈렸을 때 아무도 모르는 것**이 문제다. 없애는 대신 **감지 가능하게** 만든다:

1. **대조 검증 스크립트** — `aggregate.test.ts` 의 분류 케이스 표를 SQL 함수에도 그대로 먹여 `(domain, product)` 가 일치하는지 검사한다. 순수 함수와 SQL 함수가 **같은 케이스 표를 공유**하므로, 한쪽만 고치면 그 자리에서 깨진다.
2. **순수 함수는 삭제하지 않는다** (§1-1) — 대조의 한쪽 축이다.
3. **AGENTS.md 코딩 규칙에 명시** — "새 `source`/운세 타입 추가 시 `aggregate.ts` 사다리와 `admin_star_product_key` 를 **함께** 고치고 대조 스크립트를 돌린다." 과거 `rel_skill_checkin` 을 놓친 이력이 있다.

### 🔴 종류 E — 상한 있는 조회 **위에서** 집계 (2026-07-29 추가)

**이 카테고리를 최초 작성 때 빠뜨렸다.** 종류 A~D 는 전부 *"원본 행을 **대량으로** 받는"* 것을 다뤘는데, **소량만 받으면서 그 위에서 집계하는** 화면이 있다. cap 에 걸리지 않으므로 안전해 보이지만 **집계가 틀린다** — cap 사고와 정확히 같은 병(부분집합 위의 집계를 전체인 척 표시)이다.

> ⚠️ **판정 기준 정정**: "cap(1000)에 걸리나" 는 틀린 기준이다.
> 올바른 기준은 두 조건 **모두** — ①반환 행수가 데이터량과 무관하게 유계인가 ②**그 위의 집계가 전수인가**.
> ①만 보면 종류 E 를 "안전"으로 오분류한다.

| # | 대상 | 문제 | 현재 상태 |
|---|---|---|---|
| E1 | `app/admin/errors/page.tsx:35-39` | `.limit(300)` 으로 받아 fingerprint 별 **`count` 를 앱에서 집계**(45~60행). 300 초과 시 `count` 가 "최근 300건 안에서의 횟수" 로 조용히 바뀐다 | `error_logs` 33행 → **지금은 정확. 구조적으로 미래에 틀린다** |
| E2 | `app/admin/errors/[key]/page.tsx:37-41` · `47-51` | **`.limit()` 이 아예 없다.** 한 fingerprint 의 전체 발생을 받아 `rows.length` 를 총 발생 횟수로 표시 | 🔴 **cap 직격 대기**. 고빈도 fingerprint 가 실재한다 — AGENTS.md 의 "설계된 정상 신호"(중복차단 warn · 카카오 -101 info)가 누적되면 1000 에서 영구 정지 |

**처리 방침**: 둘 다 SQL 집계로. E1 = `fingerprint` 별 `count(*)` + 최신 1건(`DISTINCT ON`) RPC → 반환 행수가 fingerprint 종수(유계·소수)로 고정. E2 = `count(*)` 와 `bool_or(resolved_at is null)` 를 SQL 로 받고 표시용 최근 20건만 `LIMIT 20` 으로 따로 받는다(현행 `rows.slice(0, 20)` 이 이미 20건만 쓴다 — 전체를 받을 이유가 없었다).

### 🟡 조건부 유계 — 장기 관찰

| 대상 | 무엇에 비례하나 | 현재 |
|---|---|---|
| `app/admin/users/page.tsx:51` `readings.in(25 users)` | **유저당 리딩 수** (페이지 25명 × 인당 리딩) | 746/642 = 1.16 → ~29행. 인당 40 리딩이면 cap |

**구조적으로 유계 확인 완료 (조치 불필요)**: `payments`·`inquiries`·`sensitive`·`fortune-refunds` 목록과 그 2차 `.in()` 조회(`admin_actions`·`star_balances`·`users`)는 전부 페이지 상한 × 소수 배수이고 **집계가 아니라 룩업**이다. `users`·`readings` 목록은 `range(PER_PAGE=25)` + `count:"exact"`(서버 count = cap 무관) 로 진짜 페이지네이션이다. `/api/admin/errors` `.limit(100)` 은 순수 목록(집계 없음).

### 종류 D — 이번 판에서 폐기 검토

`/api/admin/stats` 5쿼리가 **전부 `/admin/page.tsx` 와 중복**이다(가입 count · 리딩 count · 매출 sum · 미해결 에러 · 미검토 민감알림). 게다가 `today` 는 오전 10시 롤오버, `week` 는 KST 자정으로 **한 엔드포인트 안에서 기준을 혼용**한다.

전환 대상으로 삼기 전에 **소비처를 먼저 확인**한다. 소비처가 없으면 전환이 아니라 삭제가 답이다. (플랜의 조사 태스크로)

**이번 판에서 결론낸다** — 삭제 or 대시보드 RPC 재사용 + 날짜 기준 통일. 보류하지 않는다. "임시방편 말고 다 고친다"(§4 종류 C)와 같은 결정이다.

---

## 5. RPC 표면 — `/admin/traffic` (확정)

현행은 **쿼리 1개**로 원본 행을 전부 받아 순수 함수 6개가 나눠 집계한다. RPC 6개로 분해한다.

| RPC | 대체 대상 | 반환 행수 |
|---|---|---|
| `admin_traffic_trend(p_since, p_exclude)` | `buildTrafficTrend` | ≤ days (대시보드는 days=2 로 공용) |
| `admin_traffic_visitor_mix(p_since, p_exclude)` | **신규** (§2-3) | ≤ days |
| `admin_traffic_routes(p_since, p_exclude, p_today)` | `buildRouteRanking` + `mergeToday` | ≤ 20 |
| `admin_traffic_auth(p_since, p_exclude, p_today)` | `buildAuthSplit` + `mergeToday` | 정확히 2 |
| `admin_traffic_entry(p_since, p_exclude, p_today)` | `buildEntrySources` + `mergeToday` | 소재 종수 + 2 (**명시적 LIMIT 권장**) |
| `admin_traffic_bot(p_since, p_exclude)` | `buildBotShare` | 1 (봇 **포함** 분모 — `is_bot` 필터 없는 유일한 RPC) |

**앱에 남기는 것**: `pickTodayYesterday` · 날짜 축 0 채우기 · 라벨링(`routeLabel`·`SEGMENT_LABEL`) · 퍼센트 표시.

### 드리프트 위험이 집중된 2곳

**5-1. `admin_traffic_entry` 의 first-touch 귀속** — 규칙 3개가 겹쳐 가장 틀리기 쉽다.
- `landing_variant` 와 `utm_content` 를 **독립적으로** first-touch (같은 행일 필요 없음)
- `anon_id IS NULL` 행은 귀속 불가 → **자기 행 값으로 PV 만 기여, UV 미계상**
- `{{...}}` → `(매크로 미치환)`, 값 없음 → `(직접/오가닉)`, `(직접/오가닉)` 은 **정렬에서 맨 아래로**

⚠️ Postgres 에 `IGNORE NULLS` 가 없다 → `first_value` 대신 `(array_remove(array_agg(x order by created_at), null))[1]` 우회 필요.

⚠️ **"창 안 first-touch" 현행 동작을 그대로 유지한다.** 현행은 조회창 안에서만 첫 값을 본다. 여기서 "창 밖까지 보도록 개선"하면 before/after 대조가 깨져 **검증 자체가 불가능해진다.** 개선은 별건.

**5-2. `mergeToday` 를 SQL 로 접기** — `count(*) filter (where bucket = p_today)` 로 **1패스가 되어 오히려 쉽다.** 단 현행 규칙 2개를 `order by` 에 그대로 옮겨야 한다:
- 행 구성·순서는 **기간 기준 유지** (오늘 값으로 재정렬 금지 — 순위가 매 시간 흔들리면 이탈 지점을 못 읽는다)
- "오늘만 활동하고 기간 상위 20 밖인 라우트는 표에 안 나온다"는 현행 동작 유지

### 나머지 화면의 RPC 표면

행수 성질만 확정하고 구체 시그니처는 플랜 단계에서 화면별로 정한다.

| RPC 후보 | 반환 행수 | 데이터량 독립 |
|---|---|---|
| `admin_trends` (analytics/trends 3쿼리) | = days | ✅ |
| `admin_cohorts` | **정확히 12** (WEEKS 상수) | ✅ |
| `admin_paywall_consult_funnel` | 1 (started/ended/viewed) | ✅ **3,090행 → 1행** |
| `admin_paywall_kpi` | 1 | ✅ |
| `admin_relationship_stats` | 고정 (status/skill/kind 전부 enum) | ✅ |
| `admin_rel_passes` | ≤ 3 (day1/day3/day7) | ✅ |
| `admin_popups` | ≤ 100 (목록 + ack count 를 같은 행에) | ✅ |
| `admin_star_spend` (사다리 SQL 이관) | `(domain, product)` 조합 수 | ⚠️ `emotion_tag` 카디널리티 비례 |
| `admin_free_spend_attribution` (plpgsql 루프) | 유저 수 또는 1행 요약 | ⚠️ 소비자 수 비례 (실측 125) |
| `admin_product_breakdown` | counsel 만 카디널리티 비례 | ⚠️ |
| `admin_funnel` | distinct 소재 + 2 | ⚠️ |
| `admin_traffic_entry` | 소재 종수 + 2 | ⚠️ |
| paywall 미전환 목록 / relationship-readings | 데이터 비례 | ❌ **종류 B — 페이지네이션** |

⚠️ 표시가 있는 4개는 데이터량과는 무관하지만 **상한이 없다**(소재·감정태그 카디널리티 비례, 실무상 수십 규모). **명시적 `LIMIT` 을 걸어 상한을 고정한다.**

🔴 **왜 이게 타협 불가인가**: **RPC 결과도 PostgREST 를 지나므로 `Max rows` cap 이 그대로 적용된다.** "RPC 로 바꾸면 cap 이 사라진다"는 것은 **반환 행수가 고정될 때만** 참이다. 카디널리티 비례 RPC 에 상한을 안 박으면 "RPC 로 바꿨는데 또 조용히 잘리는" 같은 사고가 재발한다.

그리고 상한을 박는 것만으로는 부족하다 — 2026-07-28 사고의 본질은 "잘렸다"가 아니라 **"잘린 걸 아무도 몰랐다"** 였다. 따라서 **상한 도달 시 화면에 경고를 띄우는 것이 상한과 한 쌍**이다(`entry.truncated` 플래그 방식).

### `buildCohorts` 의 비표준 규칙 2개 (보존 필수)

1. 주차 인덱스가 **코호트 주 시작이 아니라 개인 가입 시각 기준** `floor(days/7)` — 같은 코호트 안에서 유저별 오프셋이 다르다.
2. 리텐션 `d1/d7/d30` 이 **"가입 후 N일 이후 활동" 누적 정의**(≥ 조건, 고전적 D1 윈도우 아님) → `d1 ⊇ d7 ⊇ d30`.

표준 코호트 SQL 템플릿을 그대로 쓰면 **둘 다 틀린다.**

### `buildRelationshipFlow` 주의

`lag(created_at)` 6시간 갭 세션 분리 + `(thread, KST날짜)` 별 턴수 ≥ 20 카운트. 윈도우 함수로 가능하지만 **버킷이 KST 자정**(다른 화면은 오전 10시)이라는 점을 반드시 유지.

---

## 6. 검증 프로토콜 — raw SQL 정답지

선행 스펙 §6-1(화면 스냅샷)을 폐기하고 대체한다.

`scripts/run-prod-query.mjs` 는 Postgres 직결이라 `Max rows` cap 이 **구조적으로 무관하다**(선행 스펙 §1 이 확인). 이게 프로토콜의 토대다.

1. **기대값 생성** — 각 지표를 `run-prod-query.mjs` 로 SQL 직접 계산해 prod 실제값을 뽑는다. **이것이 정답지.** cap 오염 차단 + 이미 틀린 값을 굳힐 위험 0.
2. **현행 화면 대조** — 같은 지표를 현행 어드민에서 읽어 1과 비교. 어긋나는 곳이 나오면 **인벤토리가 놓친 cap 피해 화면**이다(선행 스펙 §2 의 "2화면뿐"은 7/28 기준 행수 추정이고 성장 중이므로 그새 넘은 것이 있을 수 있다).
3. **RPC 적용 후 대조** — 앱 응답 == 1의 기대값. 불일치는 전부 §3 규칙 4가지 중 하나의 드리프트로 의심.
4. **순수 함수 테스트 유지** — `node --import tsx --test lib/analytics/*.test.ts` 가 계속 통과해야 한다. 순수 함수를 지우지 않는 이유(§1-1).
5. **종류 C 대조 검증** — `aggregate.test.ts` 의 분류 케이스 표를 SQL 함수(`admin_star_product_key`)에도 먹여 `(domain, product)` 일치 확인 (§4 종류 C 드리프트 대책 1). 이게 종류 C 이관의 유일한 안전장치다.
6. **고정점 교차검증** — 상담 퍼널 **628 / 400 / 320** (30일, 어드민 미제외, 2026-07-28 기준). 창이 밀렸으니 절대값은 달라지지만 **완료율 63.7% · 열람률 80%** 근방은 유지돼야 한다.

**⚠️ 착수 전 첫 확인 항목**: `SUPABASE_PAT` 이 있어야 이 프로토콜이 성립한다. (2026-07-29 사용자가 전달 — **파일에 쓰지 않고 셸 env 로만 사용**. `.env.local` 은 dev 리소스용이고 커밋 사고 방지)

### 마이그레이션 · 커밋

- `supabase/migrations/<timestamp>_admin_aggregates.sql` **한 파일**에 함수 전량. 함수는 `create or replace` 라 재적용 안전.
- dev push → Supabase dev 자동 적용 → 검증 → main 머지. **push 후 main Workflow logs SUCCESS 확인.**
- 커밋은 **화면 단위로 분할**. 어드민 전용이라 배포 슬롯 제약은 없지만, 값이 틀어졌을 때 어느 화면 전환에서 깨졌는지 `git bisect` 가 가능해야 한다.

---

## 7. 부수 발견 버그 5건 — 전부 수정 (별도 커밋)

전환 중 발견. **고치면 값이 의도적으로 달라져 §6 의 before/after 대조가 깨진다** → RPC 전환(값 보존)을 끝낸 뒤 **별도 커밋**으로.

| # | 버그 | 영향 | 판정 지표 영향 |
|---|---|---|---|
| 1 | `/admin/paywall` H2(`payments`)만 어드민 제외 누락. H1(`star_balances`)은 적용 | 결제 전환율 분자/분모 비대칭 | 🔴 완료율 판정 |
| 2 | `/api/admin/stats` `today`=오전10시 / `week`=KST자정 **혼용** | 한 엔드포인트에서 "오늘"과 "주간"이 다른 기준 | 🟡 §4 종류 D 조사 결과에 따라 **삭제로 해소 or 기준 통일** — 어느 쪽이든 이번 판에서 끝낸다 |
| 3 | `/admin/traffic` 만 `canonicalCreative` 미적용 (funnel·paywall·ads 는 적용) | **같은 소재가 화면마다 다른 키로 뜬다** | 🔴 소재별 비교축 |
| 4 | `/admin/relationship-readings` 어드민 제외 전무 (`isAdminUserId` 는 배지 표시용) | `/admin/relationship` 총합과 원리적 불일치 | 🟢 |
| 5 | `/admin/popups` 확인율 분모(`users` count)에 운영자 포함 | 확인율 미세 과소 | 🟢 |
| 6 | `/admin` **탈퇴율 분자/분모 비대칭** — `account_withdrawals` 에는 `user_id` 가 없어(`kakao_id_hash` 만) 어드민 제외를 못 걸는데 분모(신규 가입)는 제외를 건다 | **탈퇴율이 구조적으로 과대**. 코드 주석(`app/admin/page.tsx:208-210`)이 이미 자인 | 🟡 탈퇴율은 판정 보조 지표 |

**#6 은 2026-07-29 추가** — 인벤토리가 잡았는데 최초 작성 시 빠뜨렸다. 수정 방향은 둘 중 하나이고 **결정이 필요하다**: ①`account_withdrawals` 에 어드민 판별 수단을 추가(운영자 `kakao_id_hash` 를 알아야 함) ②분모에서도 어드민 제외를 빼서 **양쪽을 미제외로 대칭화**. ②가 마이그레이션 0 이라 싸지만 분모가 오염된다. 표본이 커지면 ①의 이득이 작아지므로 **②를 기본으로 하고 화면에 한계를 한 줄 명시**하는 쪽을 권한다.

**추가 관찰 (버그 아님, 미완성)**: `/admin/analytics` 상품 화면의 별 소모 `freeStars` 가 **항상 0** 이다 — 대시보드만 `freeById`(`attributeFreeSpend` 결과)를 넘기고 products 는 넘기지 않는다. 종류 C 이관 때 같이 정리할지 결정할 것.

**#1·#3 은 판정 지표의 정의를 바꾼다.** 그래도 고치는 이유: **지금 값이 이미 틀렸으므로 틀린 값으로 시계열 연속성을 지키는 건 의미가 없다.**

**안전장치**: §6-1 raw SQL 기대값을 만들 때 **수정 전/후 정의 양쪽으로 뽑아 이 문서에 기록**한다. 그러면 d7·d14 판정에서 어느 정의로든 d4 와 비교할 수 있고, "이 날 정의가 바뀌었다"가 문서로 남는다.

**기타 관찰** (버그 아님, 정리 후보): `analytics/products` 의 `saju_product` 는 select 하지만 집계에 미사용(dead column) · `payments.status` 를 SQL 에서 안 걸고 앱에서 거르는 곳 2개(E2·F4) — 불필요한 전송.

---

## 8. 착수 순서 — d4 판정과의 충돌 해소

🔴 **작업 큐 d4 항목에 "`/admin/traffic` 오늘 열로 판독"이 명시돼 있고 d4 = 2026-07-30(내일)이다.** 전환 도중 화면이 흔들리면 판독을 못 한다.

**해법이 §6-1 과 같은 작업이다.** d4 판독을 화면이 아니라 raw SQL 로 뽑는다:
- 오늘 raw SQL 지표 집합을 만들면 ①내일 d4 판독 확보 ②전환 검증 기대값 생성이 **한 번에 끝난다**
- 게다가 현행 `/admin/traffic` UV 는 **53% 유실 상태**라 화면으로 판독하면 그 자체가 오염된 판독이다 — 어느 쪽이든 raw SQL 로 가야 한다

**순서**:

1. `SUPABASE_PAT` 로 `run-prod-query.mjs` 동작 확인 (안 되면 여기서 중단 — 프로토콜이 성립하지 않는다)
2. **raw SQL 지표 집합 작성 → d4 판독 산출물 + 전환 기대값 정답지** (§6-1, §7 의 전/후 정의 양쪽)
3. 현행 화면 대조로 cap 피해 화면 재확인 (§6-2)
4. 마이그레이션 작성 → dev 적용 → 화면별 전환 (종류 A → B → C → **E** 순)
5. 종류 C 대조 검증 스크립트 작성 → 통과 확인 (§4 드리프트 대책)
6. 종류 D 소비처 조사 → 기준 통일 or 삭제 (**이번 판에서 결론낸다**)
7. 부수 버그 5건 별도 커밋 (§7)
8. main 머지 + Workflow logs SUCCESS 확인
9. **[사용자] `Max rows` 를 낮은 값으로 원복** (RPC 는 cap 무관해지고 anon 스크래핑 노출도 줄어든다). **이 원복이 전면 전환 완료의 실질 증거다** — 상향(50,000)은 임시방편이었고, 낮은 값으로 되돌려도 어드민이 정상 동작하면 cap 의존이 사라졌음이 실증된다.
10. AGENTS.md 갱신 — 코딩 규칙에 §3 원칙 + 종류 C 드리프트 경고(새 `source` 추가 시 두 곳 + 대조 스크립트), 운영 함정에 종류 B(`ORDER BY` 없는 목록 쿼리) 주의

---

## 9. 기각·보류 기록 (재논의 방지)

- **식별자 대안 2개** — anon→user 상향 접기 / user_id 전용. 기각 근거는 §2-4.
- **재방문 세분화 대안 2개** — 2분할만 / 방문일수 분후표. 3분할(신규·연속·복귀) 채택. "매일 붙는 사람"과 "가끔 돌아오는 사람"은 상품 함의가 다르다(캘린더 vs 재상담).
- **기존 UV·PV 차트에 선 추가** — 4선이면 원래 용도가 죽는다. 별 차트로 분리.
- **first-touch 를 창 밖까지 보도록 개선** — before/after 대조가 깨진다. 별건.
- **종류 C "분류는 앱, 집계만 SQL" 축약안** — 기각. `count(distinct user_id)` 를 축약 행에서 합산할 수 없어(같은 유저가 여러 축약 행에 걸치면 중복 계수) **조용히 틀린 숫자를 만든다.** 우회 2개(행에 `user_ids[]` 실기 / 2차 RPC 재조회)도 각각 원칙 편법 위반·정의 이중관리라 기각. → SQL 완전 이관 + 대조 검증(§4).
- 선행 스펙 §8 의 드롭 대안(절단 감지 / `③-lite` / `.range()`)은 그대로 유효 — 전면 전환이 흡수.

## 관련

- 선행: `docs/superpowers/specs/2026-07-28-admin-aggregation-rpc-migration.md` (사고 요약 §1 · 실측 감사 §2 · 성장 추세 §3 은 이 문서가 대체하지 않는다)
- `docs/superpowers/specs/2026-07-26-unviewed-results-findings.md` (미열람 근거, raw SQL 소스라 cap 무관)
- `lib/admin-time.ts` (날짜 기준 표) · `lib/analytics/traffic.ts` (트래픽 집계 정본) · `lib/analytics/aggregate.ts` (그 외 집계 정본)
