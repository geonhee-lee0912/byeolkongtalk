# 손익 스파인 통합 분석 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 별콩톡의 월 순손익을 확정하고, 손실이 새는 지점을 금액이 붙은 액션 우선순위표로 만든다. 동시에 다음 분석부터 쓸 페이지뷰 계측을 심는다.

**Architecture:** 두 트랙이 병행한다. **트랙 A(분석)** 는 prod Management API 쿼리 → 순수 함수 원가 배분 → 관계 스레드 정독 → findings 문서로 이어지는 순차 파이프라인이고, 비콘 데이터 없이 완주한다(사용자 지시). **트랙 B(비콘)** 는 `page_views` 테이블 + `/api/pv` + 클라 비콘으로, 트랙 A와 독립이라 언제 끼워도 된다. 분석 트랙에서는 TDD의 자리를 **데이터 항등식 검산**이 대신한다 — 각 태스크는 검산 스텝을 포함하고 검산이 깨지면 다음 태스크로 넘어가지 않는다. 순수 계산 로직(원가 배분)과 비콘 코드는 정식 `node:test` TDD.

**Tech Stack:** Supabase Management API (`scripts/run-prod-query.mjs`) · PostgreSQL · TypeScript + `node --import tsx --test` · Next.js 16 App Router (route handler + client component) · Supabase 마이그레이션 (GitHub sync 자동 적용)

**설계 스펙:** [docs/superpowers/specs/2026-07-25-pnl-spine-analysis-design.md](../specs/2026-07-25-pnl-spine-analysis-design.md)

---

## 공통 사전 지식 (모든 태스크)

**제외 6명 필터** — 모든 쿼리에 반드시 넣는다. 빠지면 매출·전환율이 오염된다.

```sql
with ex as (select unnest(array['9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0']) c)
-- 이후 where left(user_id::text,8) not in (select c from ex)
```

**창 정의**: 창 A = 누적(2026-05-25~07-25) · 창 B = `created_at >= '2026-07-20'` · 창 C = `created_at >= '2026-07-22'`

**확정 입력값**: Claude API $75.6 (Sonnet $72.8 + Haiku $2.8, 7/1~7/25) · Supabase $51.98/월 · Vercel $20/월 · 도메인 $0.87/월 · 토스 3.7% + 월 ₩9,167 · Meta 광고 ₩175,142 (7/8~7/25, 16일) · 환율 ₩1,400/USD · 힉스필드 제외

**셸 상태는 호출 간 유지되지 않는다** — 환경변수는 매 명령에 인라인으로 넣어야 한다.

**스크래치패드** (쿼리 결과 저장용):
```
C:/Users/c/AppData/Local/Temp/claude/C--Users-c-Desktop-vibe-project-byeolkong-talk/d1204945-d11c-487b-a20e-56fb325b1602/scratchpad
```

**⚠️ PAT는 절대 커밋하지 않는다.** 스크래치패드 파일에 두고 매 명령에서 읽어 쓴다.

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| `scripts/analysis-2026-07-25.sql` (신규) | 이번 분석의 전 쿼리 원장. 재현용 — 실행한 쿼리를 순서대로 누적 기록 |
| `lib/analytics/apiCost.ts` (신규) | API 원가 배분 순수 함수. 리딩별 비용 점수 계산 + 콘솔 총액 스케일링 |
| `lib/analytics/apiCost.test.ts` (신규) | 위 함수의 단위 테스트 |
| `scripts/api-cost-allocate.ts` (신규) | 쿼리 결과 JSON을 받아 배분 실행 + 3 시나리오 민감도 출력하는 CLI |
| `docs/superpowers/specs/2026-07-25-pnl-spine-findings.md` (신규) | 최종 리포트 |
| `lib/analytics/pageview.ts` (신규) | 봇 판정 · path 정규화 순수 함수 |
| `lib/analytics/pageview.test.ts` (신규) | 위 함수의 단위 테스트 |
| `supabase/migrations/20260725000000_page_views.sql` (신규) | `page_views` 테이블 + 인덱스 + RLS |
| `app/api/pv/route.ts` (신규) | 비콘 수신. 서버에서 httpOnly 쿠키 읽어 anon/user 귀속 |
| `components/analytics/PageViewBeacon.tsx` (신규) | 라우트 이동 감지 → `sendBeacon` |
| `app/layout.tsx` (수정, 104행 근처) | 비콘 마운트 |
| `app/privacy/page.tsx` (수정, 제8조) | "접속 페이지 기록" 한 줄 |

---

# 트랙 A — 분석

## Task A0: PAT 보관 + 쿼리 원장 파일 생성

**Files:**
- Create: `scripts/analysis-2026-07-25.sql`
- Create (커밋 금지): `<스크래치패드>/pat.txt`

- [ ] **Step 1: PAT를 스크래치패드에 저장**

⚠️ **PAT 값을 이 문서나 어떤 커밋 대상 파일에도 적지 마라.** 사용자가 제공한 값을 스크래치패드 파일에만 넣는다(스크래치패드는 리포 밖이라 git 추적 대상이 아니다).

```bash
SCRATCH="C:/Users/c/AppData/Local/Temp/claude/C--Users-c-Desktop-vibe-project-byeolkong-talk/d1204945-d11c-487b-a20e-56fb325b1602/scratchpad"
mkdir -p "$SCRATCH"
# 사용자가 준 PAT 를 아래 <PAT> 자리에 넣어 실행 (이 파일에 값을 남기지 않는다)
printf '%s' '<PAT>' > "$SCRATCH/pat.txt"
wc -c "$SCRATCH/pat.txt"
```

Expected: `44 .../pat.txt` 처럼 바이트 수만 확인. 이후 모든 쿼리는 `SUPABASE_PAT=$(cat "$SCRATCH/pat.txt")` 로 읽는다.

- [ ] **Step 2: 쿼리 원장 파일 생성**

`scripts/analysis-2026-07-25.sql`:

```sql
-- 손익 스파인 통합 분석 (2026-07-25) 쿼리 원장
-- 실행: SUPABASE_PAT=$(cat <스크래치패드>/pat.txt) node scripts/run-prod-query.mjs --sql "<아래 쿼리 하나>"
-- 제외 6명: 9ff43266 b9e5dd5a 7f83a4d7 a3bcc2c7 3d648ebe d8fdcdd0 (관리자 1 + 지인 1 + 내부테스트 4)
-- 창 A 누적(05-25~07-25) / 창 B 07-20~ / 창 C 07-22~
-- ⚠️ 쿼리는 read_only=true 로 실행된다 (run-prod-query.mjs)

-- ============ Q0. 모수 (검산 기준선) ============
-- 기대값 (2026-07-25 실측): u_all=525 u_since20=198 u_since22=138
--                          pay_all=52 rev_all=107900 pay20=27 rev20=54800
--                          r_all=594 r_since20=234 rel_cnt=15 pass_cnt=1
with ex as (select unnest(array['9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0']) c)
select
 (select count(*) from users u where left(u.id::text,8) not in (select c from ex)) u_all,
 (select count(*) from users u where left(u.id::text,8) not in (select c from ex) and u.created_at >= '2026-07-20') u_since20,
 (select count(*) from users u where left(u.id::text,8) not in (select c from ex) and u.created_at >= '2026-07-22') u_since22,
 (select count(*) from payments p where p.status='completed' and left(p.user_id::text,8) not in (select c from ex)) pay_all,
 (select coalesce(sum(p.amount_won),0) from payments p where p.status='completed' and left(p.user_id::text,8) not in (select c from ex)) rev_all,
 (select count(*) from payments p where p.status='completed' and p.created_at >= '2026-07-20' and left(p.user_id::text,8) not in (select c from ex)) pay20,
 (select coalesce(sum(p.amount_won),0) from payments p where p.status='completed' and p.created_at >= '2026-07-20' and left(p.user_id::text,8) not in (select c from ex)) rev20,
 (select count(*) from readings r where left(r.user_id::text,8) not in (select c from ex)) r_all,
 (select count(*) from readings r where left(r.user_id::text,8) not in (select c from ex) and r.created_at >= '2026-07-20') r_since20,
 (select count(*) from relationships rl where left(rl.user_id::text,8) not in (select c from ex)) rel_cnt,
 (select count(*) from relationship_passes rp where left(rp.user_id::text,8) not in (select c from ex)) pass_cnt;
```

- [ ] **Step 3: Q0 재실행해 검산**

```bash
SCRATCH="C:/Users/c/AppData/Local/Temp/claude/C--Users-c-Desktop-vibe-project-byeolkong-talk/d1204945-d11c-487b-a20e-56fb325b1602/scratchpad"
SUPABASE_PAT=$(cat "$SCRATCH/pat.txt") node scripts/run-prod-query.mjs --sql "$(sed -n '/Q0. 모수/,$p' scripts/analysis-2026-07-25.sql | grep -v '^--')" > "$SCRATCH/q0.json"
cat "$SCRATCH/q0.json"
```

Expected: `u_all` 이 525 이상(그 사이 신규 가입 가능), `pay_all` 52 이상, `rel_cnt` 15 이상, `pass_cnt` 1 이상. **숫자가 줄어들면 필터·조인이 잘못된 것** — 멈추고 원인 규명.

- [ ] **Step 4: 커밋**

```bash
git add scripts/analysis-2026-07-25.sql
git commit -m "chore(analysis): 손익 분석 쿼리 원장 생성 + Q0 모수 기준선"
```

---

## Task A1: 블록 1-a — 매출·결제 구조

**Files:**
- Modify: `scripts/analysis-2026-07-25.sql` (Q1~Q5 추가)

- [ ] **Step 1: Q1 패키지 분포 · ARPPU 실행**

```bash
SCRATCH="C:/Users/c/AppData/Local/Temp/claude/C--Users-c-Desktop-vibe-project-byeolkong-talk/d1204945-d11c-487b-a20e-56fb325b1602/scratchpad"
SUPABASE_PAT=$(cat "$SCRATCH/pat.txt") node scripts/run-prod-query.mjs --sql "
with ex as (select unnest(array['9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0']) c),
p as (select * from payments where status='completed' and left(user_id::text,8) not in (select c from ex))
select case when created_at >= '2026-07-22' then 'C(07-22~)'
            when created_at >= '2026-07-20' then 'B(07-20~21)'
            else 'pre(~07-19)' end win,
       package_type, count(*) n, sum(amount_won) won, sum(stars_given) stars
from p group by 1,2 order by 1, won desc" > "$SCRATCH/q1.json"
cat "$SCRATCH/q1.json"
```

- [ ] **Step 2: Q2 유저별 결제 횟수 · 재구매율 실행**

```bash
SCRATCH="C:/Users/c/AppData/Local/Temp/claude/C--Users-c-Desktop-vibe-project-byeolkong-talk/d1204945-d11c-487b-a20e-56fb325b1602/scratchpad"
SUPABASE_PAT=$(cat "$SCRATCH/pat.txt") node scripts/run-prod-query.mjs --sql "
with ex as (select unnest(array['9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0']) c),
p as (select * from payments where status='completed' and left(user_id::text,8) not in (select c from ex)),
per_user as (select user_id, count(*) cnt, sum(amount_won) won, min(created_at) first_at from p group by 1)
select cnt pay_count, count(*) users, sum(won) won_sum, round(avg(won)) avg_won_per_user
from per_user group by 1 order by 1" > "$SCRATCH/q2.json"
cat "$SCRATCH/q2.json"
```

- [ ] **Step 3: Q3 첫 결제 소요시간 + 결제 직전 잔액 실행**

```bash
SCRATCH="C:/Users/c/AppData/Local/Temp/claude/C--Users-c-Desktop-vibe-project-byeolkong-talk/d1204945-d11c-487b-a20e-56fb325b1602/scratchpad"
SUPABASE_PAT=$(cat "$SCRATCH/pat.txt") node scripts/run-prod-query.mjs --sql "
with ex as (select unnest(array['9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0']) c),
p as (select * from payments where status='completed' and left(user_id::text,8) not in (select c from ex)),
fp as (select user_id, min(created_at) t from p group by 1),
j as (
  select fp.user_id, fp.t, u.created_at signup,
         extract(epoch from (fp.t - u.created_at))/60 min_to_pay,
         (select st.balance_after from star_transactions st
           where st.user_id = fp.user_id and st.created_at < fp.t
           order by st.created_at desc limit 1) bal_before,
         (select coalesce(sum(st.amount),0) from star_transactions st
           where st.user_id = fp.user_id and st.type='spend' and st.created_at < fp.t) spent_before,
         (u.created_at >= '2026-07-22') is_welcome20
  from fp join users u on u.id = fp.user_id
)
select is_welcome20, count(*) n,
       round(percentile_cont(0.5) within group (order by min_to_pay)::numeric,1) med_min_to_pay,
       round(avg(bal_before)::numeric,1) avg_bal_before,
       count(*) filter (where spent_before = 0) zero_spend_before,
       round(avg(spent_before)::numeric,1) avg_spent_before
from j group by 1 order by 1" > "$SCRATCH/q3.json"
cat "$SCRATCH/q3.json"
```

Expected 형태: `is_welcome20=false` 행의 `med_min_to_pay` 가 baseline 6분 근처. 웰컴 20 코호트(`true`)와 비교해 갭 결제 구조 유지 여부 판단.

- [ ] **Step 4: Q4 주차 코호트 LTV 실행**

```bash
SCRATCH="C:/Users/c/AppData/Local/Temp/claude/C--Users-c-Desktop-vibe-project-byeolkong-talk/d1204945-d11c-487b-a20e-56fb325b1602/scratchpad"
SUPABASE_PAT=$(cat "$SCRATCH/pat.txt") node scripts/run-prod-query.mjs --sql "
with ex as (select unnest(array['9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0']) c),
u as (select id, date_trunc('week', created_at)::date wk from users where left(id::text,8) not in (select c from ex)),
p as (select user_id, sum(amount_won) won, count(*) n from payments
      where status='completed' and left(user_id::text,8) not in (select c from ex) group by 1)
select u.wk, count(*) signups, count(p.user_id) payers,
       coalesce(sum(p.won),0) revenue,
       round(coalesce(sum(p.won),0)::numeric / count(*),1) ltv_per_signup,
       round(100.0 * count(p.user_id) / count(*),1) cvr_pct
from u left join p on p.user_id = u.id group by 1 order by 1" > "$SCRATCH/q4.json"
cat "$SCRATCH/q4.json"
```

Expected: `ltv_per_signup` 추세가 baseline(07-06주 ₩102 → 07-13주 ₩143)과 이어짐.

- [ ] **Step 5: Q5 결제 마찰(상태 분포) 실행**

```bash
SCRATCH="C:/Users/c/AppData/Local/Temp/claude/C--Users-c-Desktop-vibe-project-byeolkong-talk/d1204945-d11c-487b-a20e-56fb325b1602/scratchpad"
SUPABASE_PAT=$(cat "$SCRATCH/pat.txt") node scripts/run-prod-query.mjs --sql "
with ex as (select unnest(array['9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0']) c)
select status, count(*) n, coalesce(sum(amount_won),0) won, min(created_at)::date f, max(created_at)::date l
from payments where left(user_id::text,8) not in (select c from ex)
group by 1 order by n desc" > "$SCRATCH/q5.json"
cat "$SCRATCH/q5.json"
```

Expected: `completed` 52+ 와 그 외 상태. baseline 은 미완료 0건이었으므로 **0이 아니면 새 손실 발견** — findings 에 기록.

- [ ] **Step 6: 검산 — 매출 항등식**

`$SCRATCH/q1.json` 의 `won` 합계와 `$SCRATCH/q2.json` 의 `won_sum` 합계와 Q0 의 `rev_all` 이 **셋 다 같아야** 한다.

```bash
SCRATCH="C:/Users/c/AppData/Local/Temp/claude/C--Users-c-Desktop-vibe-project-byeolkong-talk/d1204945-d11c-487b-a20e-56fb325b1602/scratchpad"
node -e '
const s=process.argv[1];
const j=f=>JSON.parse(require("fs").readFileSync(s+"/"+f,"utf8"));
const q0=j("q0.json")[0], q1=j("q1.json"), q2=j("q2.json");
const s1=q1.reduce((a,r)=>a+Number(r.won),0), s2=q2.reduce((a,r)=>a+Number(r.won_sum),0);
console.log({rev_all:Number(q0.rev_all), q1_sum:s1, q2_sum:s2, ok:Number(q0.rev_all)===s1 && s1===s2});
' "$SCRATCH"
```

Expected: `ok: true`. **false 면 멈추고** 필터 차이(창 경계·status)를 찾는다.

- [ ] **Step 7: 쿼리를 원장에 추가하고 커밋**

Q1~Q5 를 `scripts/analysis-2026-07-25.sql` 끝에 `-- ============ Q1. ... ============` 헤더와 함께 붙인다.

```bash
git add scripts/analysis-2026-07-25.sql
git commit -m "chore(analysis): 블록1-a 매출·결제 구조 쿼리(Q1~Q5)"
```

---

## Task A2: 블록 1-b — 별 원장 항등식 + 선수금 부채

**Files:**
- Modify: `scripts/analysis-2026-07-25.sql` (Q6~Q8 추가)

- [ ] **Step 1: Q6 지급/소비 원장 요약 실행**

```bash
SCRATCH="C:/Users/c/AppData/Local/Temp/claude/C--Users-c-Desktop-vibe-project-byeolkong-talk/d1204945-d11c-487b-a20e-56fb325b1602/scratchpad"
SUPABASE_PAT=$(cat "$SCRATCH/pat.txt") node scripts/run-prod-query.mjs --sql "
with ex as (select unnest(array['9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0']) c)
select type, source, count(*) n, sum(amount) stars, min(created_at)::date f, max(created_at)::date l
from star_transactions where left(user_id::text,8) not in (select c from ex)
group by 1,2 order by 1, stars desc" > "$SCRATCH/q6.json"
cat "$SCRATCH/q6.json"
```

Expected (전체 기준 실측, 제외 반영 시 소폭 감소): 무료 지급 = `welcome_bonus` 14,760 + `first_charge_bonus` 738 + `admin_adjust` 575 + `fortune_refund_*` 80 ≈ **16,153별** vs 유상 `pg` **1,920별** → **무료가 지급의 89%**.

- [ ] **Step 2: Q7 유저별 FIFO 분해 + 항등식 위반 탐지 실행**

```bash
SCRATCH="C:/Users/c/AppData/Local/Temp/claude/C--Users-c-Desktop-vibe-project-byeolkong-talk/d1204945-d11c-487b-a20e-56fb325b1602/scratchpad"
SUPABASE_PAT=$(cat "$SCRATCH/pat.txt") node scripts/run-prod-query.mjs --sql "
with ex as (select unnest(array['9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0']) c),
agg as (
  select user_id,
    sum(case when type='charge' and source='pg' then amount else 0 end) p_paid,
    sum(case when type='charge' and source<>'pg' then amount else 0 end) f_free,
    sum(case when type='spend' then amount else 0 end) s_spend
  from star_transactions where left(user_id::text,8) not in (select c from ex) group by 1
),
j as (
  select a.*, b.balance,
         (a.f_free + a.p_paid - a.s_spend) calc_balance,
         greatest(0, a.f_free - a.s_spend) free_left
  from agg a join star_balances b on b.user_id = a.user_id
)
select count(*) users,
       count(*) filter (where balance <> calc_balance) identity_violations,
       sum(p_paid) paid_total, sum(f_free) free_total, sum(s_spend) spend_total,
       sum(balance) balance_total,
       sum(free_left) free_left_total,
       sum(balance - free_left) paid_left_total,
       sum(least(f_free, s_spend)) free_consumed,
       sum(greatest(0, s_spend - f_free)) paid_consumed
from j" > "$SCRATCH/q7.json"
cat "$SCRATCH/q7.json"
```

- [ ] **Step 3: 검산 — 원장 항등식 F + P − S = B**

Expected: `identity_violations` = **0**, 그리고 `paid_total + free_total - spend_total === balance_total`.

```bash
SCRATCH="C:/Users/c/AppData/Local/Temp/claude/C--Users-c-Desktop-vibe-project-byeolkong-talk/d1204945-d11c-487b-a20e-56fb325b1602/scratchpad"
node -e '
const r=JSON.parse(require("fs").readFileSync(process.argv[1]+"/q7.json","utf8"))[0];
const lhs=Number(r.paid_total)+Number(r.free_total)-Number(r.spend_total);
console.log({violations:Number(r.identity_violations), lhs, balance_total:Number(r.balance_total),
  ok: Number(r.identity_violations)===0 && lhs===Number(r.balance_total)});
' "$SCRATCH"
```

**`ok: false` 면 멈춘다.** 원인 후보: (a) `type` 에 'charge'/'spend' 외 값 존재 → Q6 결과로 확인 (b) `star_balances` 가 RPC 밖에서 직접 수정된 이력 (c) 제외 필터가 `star_balances` 조인에서 빠짐. 위반 유저를 뽑아 개별 확인:

```bash
SCRATCH="C:/Users/c/AppData/Local/Temp/claude/C--Users-c-Desktop-vibe-project-byeolkong-talk/d1204945-d11c-487b-a20e-56fb325b1602/scratchpad"
SUPABASE_PAT=$(cat "$SCRATCH/pat.txt") node scripts/run-prod-query.mjs --sql "
with agg as (
  select user_id,
    sum(case when type='charge' then amount else 0 end) charged,
    sum(case when type='spend' then amount else 0 end) spent
  from star_transactions group by 1)
select left(a.user_id::text,8) u, a.charged, a.spent, b.balance, b.total_earned, b.total_spent
from agg a join star_balances b on b.user_id=a.user_id
where b.balance <> a.charged - a.spent limit 20"
```

- [ ] **Step 4: Q8 별 잔액 분포 실행**

```bash
SCRATCH="C:/Users/c/AppData/Local/Temp/claude/C--Users-c-Desktop-vibe-project-byeolkong-talk/d1204945-d11c-487b-a20e-56fb325b1602/scratchpad"
SUPABASE_PAT=$(cat "$SCRATCH/pat.txt") node scripts/run-prod-query.mjs --sql "
with ex as (select unnest(array['9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0']) c),
b as (select sb.*, (select count(*) from payments p where p.user_id=sb.user_id and p.status='completed') pays
      from star_balances sb where left(sb.user_id::text,8) not in (select c from ex))
select case when balance = 0 then '0'
            when balance between 1 and 9 then '1-9'
            when balance between 10 and 19 then '10-19'
            when balance between 20 and 39 then '20-39'
            else '40+' end bucket,
       (pays > 0) is_payer, count(*) users, sum(balance) stars
from b group by 1,2 order by 2 desc, 1" > "$SCRATCH/q8.json"
cat "$SCRATCH/q8.json"
```

Expected: 비결제자(`is_payer=false`)의 `0`/`1-9` 버킷이 두꺼움(baseline 소진율 71%). 결제자 잔액 = 선수금 부채의 대부분.

- [ ] **Step 5: 원장에 추가하고 커밋**

```bash
git add scripts/analysis-2026-07-25.sql
git commit -m "chore(analysis): 블록1-b 별 원장 항등식·FIFO 선수금·잔액 분포(Q6~Q8)"
```

---

## Task A3: 원가 배분 순수 함수 (TDD)

**Files:**
- Create: `lib/analytics/apiCost.ts`
- Test: `lib/analytics/apiCost.test.ts`

배경: 종목별 컨텍스트 창이 다르다. 사주/타로 상담은 매 턴 **전체 히스토리**를 보내 입력이 초선형으로 커지고, 연애 상담 스레드는 **최근 24메시지 + rolling_summary**(`lib/relationship/memory.ts` `RECENT_MSGS = 24`)라 입력이 상한에 수렴한다. 같은 식으로 계산하면 스레드 원가를 크게 과대평가한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`lib/analytics/apiCost.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreReading, allocate, type Turn } from "./apiCost.ts";

function turns(n: number): Turn[] {
  return Array.from({ length: n }, (_, i) => ({
    role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
    chars: 300,
  }));
}

const base = { systemChars: 20_000, cacheHitRate: 0.6 };

test("full_history — 턴이 늘면 점수가 초선형으로 증가", () => {
  const a = scoreReading({ ...base, turns: turns(6), track: "full_history" });
  const b = scoreReading({ ...base, turns: turns(18), track: "full_history" });
  // 턴 3배인데 히스토리 누적 때문에 3배보다 훨씬 커야 한다
  assert.ok(b.score > a.score * 3, `초선형 아님: ${a.score} → ${b.score}`);
});

test("windowed — 창 상한 때문에 점수가 턴 수에 거의 선형", () => {
  const a = scoreReading({ ...base, turns: turns(30), track: "windowed", windowMsgs: 24, summaryChars: 1000 });
  const b = scoreReading({ ...base, turns: turns(60), track: "windowed", windowMsgs: 24, summaryChars: 1000 });
  assert.ok(b.score < a.score * 2.3, `선형 수렴 아님: ${a.score} → ${b.score}`);
  assert.ok(b.score > a.score * 1.7, `너무 평평함: ${a.score} → ${b.score}`);
});

test("캐시 히트율이 높으면 총 점수가 낮다", () => {
  const cold = scoreReading({ ...base, cacheHitRate: 0, turns: turns(10), track: "full_history" });
  const warm = scoreReading({ ...base, cacheHitRate: 0.9, turns: turns(10), track: "full_history" });
  assert.ok(warm.score < cold.score, `캐시 효과 없음: ${cold.score} vs ${warm.score}`);
});

test("출력 토큰이 입력보다 5배 비싸게 반영된다", () => {
  const longOut = scoreReading({
    ...base, systemChars: 0, track: "full_history",
    turns: [{ role: "user", chars: 100 }, { role: "assistant", chars: 1000 }],
  });
  const longIn = scoreReading({
    ...base, systemChars: 0, track: "full_history",
    turns: [{ role: "user", chars: 1000 }, { role: "assistant", chars: 100 }],
  });
  assert.ok(longOut.score > longIn.score, "출력 가중이 반영되지 않음");
});

test("allocate — 배분 총합이 콘솔 총액과 일치", () => {
  const rows = [
    { id: "a", score: 3 },
    { id: "b", score: 1 },
    { id: "c", score: 0 },
  ];
  const out = allocate(rows, 100);
  const sum = out.reduce((acc, r) => acc + r.usd, 0);
  assert.ok(Math.abs(sum - 100) < 1e-9, `총합 불일치: ${sum}`);
  assert.ok(Math.abs(out[0].usd - 75) < 1e-9, `비중 오류: ${out[0].usd}`);
  assert.equal(out[2].usd, 0);
});

test("allocate — 점수 총합 0이면 전부 0 (0으로 나누지 않음)", () => {
  const out = allocate([{ id: "a", score: 0 }], 50);
  assert.equal(out[0].usd, 0);
});

test("빈 대화는 점수 0", () => {
  assert.equal(scoreReading({ ...base, turns: [], track: "full_history" }).score, 0);
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `node --import tsx --test lib/analytics/apiCost.test.ts`
Expected: FAIL — `Cannot find module './apiCost.ts'`

- [ ] **Step 3: 최소 구현 작성**

`lib/analytics/apiCost.ts`:

```ts
// API 원가 배분 — 콘솔 총액(진실)을 리딩별 비용 점수 비중으로 나눈다.
// 총액은 정확하고 배분만 추정이다. 점수는 Sonnet 5 단가 비($/MTok)를 그대로 가중한다.
//
// 종목별 컨텍스트 창이 다르다:
//  - full_history: 사주/타로 상담. 매 턴 전체 히스토리를 보내므로 입력이 초선형으로 커진다.
//  - windowed:     연애 상담 스레드. 최근 N메시지 + rolling_summary 라 입력이 상한에 수렴한다.
//                  (lib/relationship/memory.ts RECENT_MSGS = 24)

export type Turn = { role: "user" | "assistant"; chars: number };
export type CostTrack = "full_history" | "windowed";

export type ScoreInput = {
  turns: Turn[];
  /** 페르소나 + 정적 컨텍스트 글자수 (캐시 마킹 대상) */
  systemChars: number;
  track: CostTrack;
  /** windowed 트랙에서 모델에 보내는 최근 메시지 수 */
  windowMsgs?: number;
  /** windowed 트랙의 rolling_summary 평균 글자수 */
  summaryChars?: number;
  /** 0~1. 정적 블록이 캐시 히트하는 비율 */
  cacheHitRate: number;
};

/** 한국어 근사 — 글자수 ÷ 이 값 ≈ 토큰수 */
export const CHARS_PER_TOKEN = 1.6;
const IN_PRICE_PER_MTOK = 3;
const OUT_PRICE_PER_MTOK = 15;
const CACHE_READ_MULT = 0.1;
const CACHE_WRITE_MULT = 1.25;

export function scoreReading(i: ScoreInput): { inTok: number; outTok: number; score: number } {
  const windowMsgs = i.windowMsgs ?? 24;
  const summaryChars = i.summaryChars ?? 0;
  let inTok = 0;
  let outTok = 0;
  let calls = 0;

  for (let t = 0; t < i.turns.length; t++) {
    const turn = i.turns[t];
    if (turn.role !== "assistant") continue; // API 호출 1회 = assistant 응답 1개
    calls++;

    const before = i.turns.slice(0, t);
    const ctx = i.track === "full_history" ? before : before.slice(-windowMsgs);
    const ctxChars = ctx.reduce((a, m) => a + m.chars, 0)
      + (i.track === "windowed" && before.length > windowMsgs ? summaryChars : 0);

    // 첫 호출은 캐시 write(1.25×), 이후는 히트율에 따라 read(0.1×)와 미스(1×)를 섞는다.
    const sysMult = calls === 1
      ? CACHE_WRITE_MULT
      : i.cacheHitRate * CACHE_READ_MULT + (1 - i.cacheHitRate);

    inTok += (i.systemChars * sysMult + ctxChars) / CHARS_PER_TOKEN;
    outTok += turn.chars / CHARS_PER_TOKEN;
  }

  const score = (inTok / 1e6) * IN_PRICE_PER_MTOK + (outTok / 1e6) * OUT_PRICE_PER_MTOK;
  return { inTok, outTok, score };
}

export function allocate<T extends { score: number }>(
  rows: T[],
  totalUsd: number
): (T & { usd: number })[] {
  const sum = rows.reduce((a, r) => a + r.score, 0);
  if (sum <= 0) return rows.map((r) => ({ ...r, usd: 0 }));
  return rows.map((r) => ({ ...r, usd: (r.score / sum) * totalUsd }));
}
```

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `node --import tsx --test lib/analytics/apiCost.test.ts`
Expected: PASS, `pass 7 / fail 0`

- [ ] **Step 5: 커밋**

```bash
git add lib/analytics/apiCost.ts lib/analytics/apiCost.test.ts
git commit -m "feat(analytics): API 원가 배분 순수 함수(종목별 컨텍스트 창 분리·캐시 시나리오)"
```

---

## Task A4: 원가 배분 실행 + 3 시나리오 민감도

**Files:**
- Create: `scripts/api-cost-allocate.ts`
- Modify: `scripts/analysis-2026-07-25.sql` (Q9 추가)

- [ ] **Step 1: Q9 리딩별 메시지 집계 추출**

```bash
SCRATCH="C:/Users/c/AppData/Local/Temp/claude/C--Users-c-Desktop-vibe-project-byeolkong-talk/d1204945-d11c-487b-a20e-56fb325b1602/scratchpad"
SUPABASE_PAT=$(cat "$SCRATCH/pat.txt") node scripts/run-prod-query.mjs --sql "
with ex as (select unnest(array['9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0']) c),
r as (select * from readings where left(user_id::text,8) not in (select c from ex)
        and created_at >= '2026-07-01')
select r.id, r.consultation_type, coalesce(r.spread_type, r.saju_product, '-') product,
       r.stars_spent, r.created_at::date d,
       json_agg(json_build_object('role', m.role, 'chars', length(m.content))
                order by m.created_at) turns
from r join messages m on m.reading_id = r.id
group by r.id, r.consultation_type, r.spread_type, r.saju_product, r.stars_spent, r.created_at
order by r.created_at" > "$SCRATCH/q9.json"
node -e 'const d=JSON.parse(require("fs").readFileSync(process.argv[1]+"/q9.json","utf8"));console.log("리딩",d.length,"턴합",d.reduce((a,r)=>a+r.turns.length,0))' "$SCRATCH"
```

Expected: 리딩 수백 건, 턴 수천 개. 7월분만 뽑는 이유 = 콘솔 총액이 7월 기준.

- [ ] **Step 2: 배분 CLI 작성**

`scripts/api-cost-allocate.ts`:

```ts
// 사용: node --import tsx scripts/api-cost-allocate.ts <q9.json 경로> <콘솔총액USD>
// 예:   node --import tsx scripts/api-cost-allocate.ts "$SCRATCH/q9.json" 72.8
//
// 콘솔 총액(Sonnet 분)을 리딩별 점수 비중으로 배분하고, 캐시 히트율 3 시나리오로
// 상품 순위가 뒤집히는지 확인한다. haiku 분($2.8)은 요약·민감판정이라 별도 트랙.

import { readFileSync } from "node:fs";
import { scoreReading, allocate, type Turn, type CostTrack } from "../lib/analytics/apiCost.ts";

type Row = {
  id: string;
  consultation_type: string;
  product: string;
  stars_spent: number;
  d: string;
  turns: Turn[];
};

const [, , path, totalArg] = process.argv;
if (!path || !totalArg) {
  console.error("사용: node --import tsx scripts/api-cost-allocate.ts <q9.json> <총액USD>");
  process.exit(1);
}
const rows: Row[] = JSON.parse(readFileSync(path, "utf8"));
const TOTAL = Number(totalArg);

// 페르소나 정적 블록 추정 글자수. 코어 + 도메인 페르소나 실측으로 교체할 것(Step 3).
const SYSTEM_CHARS: Record<string, number> = {
  relationship: 24_000,
  tarot: 22_000,
  saju: 22_000,
};

function trackOf(t: string): CostTrack {
  return t === "relationship" ? "windowed" : "full_history";
}

for (const hit of [0.3, 0.6, 0.9]) {
  const scored = rows.map((r) => ({
    ...r,
    ...scoreReading({
      turns: r.turns,
      systemChars: SYSTEM_CHARS[r.consultation_type] ?? 20_000,
      track: trackOf(r.consultation_type),
      windowMsgs: 24,
      summaryChars: 1_200,
      cacheHitRate: hit,
    }),
  }));
  const alloc = allocate(scored, TOTAL);

  const byProduct = new Map<string, { usd: number; n: number; stars: number }>();
  for (const a of alloc) {
    const key = `${a.consultation_type}:${a.product}`;
    const cur = byProduct.get(key) ?? { usd: 0, n: 0, stars: 0 };
    cur.usd += a.usd;
    cur.n += 1;
    cur.stars += Number(a.stars_spent ?? 0);
    byProduct.set(key, cur);
  }

  console.log(`\n=== 캐시 히트율 ${hit} — 총 $${TOTAL} 배분 ===`);
  console.log("상품".padEnd(28) + "건수".padStart(6) + "원가$".padStart(10) + "건당$".padStart(9) + "별소모".padStart(8) + "별당원가₩".padStart(11));
  const sorted = [...byProduct.entries()].sort((a, b) => b[1].usd - a[1].usd);
  for (const [k, v] of sorted) {
    const perReading = v.usd / v.n;
    const wonPerStar = v.stars > 0 ? (v.usd * 1400) / v.stars : 0;
    console.log(
      k.padEnd(28) + String(v.n).padStart(6) + v.usd.toFixed(2).padStart(10) +
      perReading.toFixed(4).padStart(9) + String(v.stars).padStart(8) + wonPerStar.toFixed(1).padStart(11)
    );
  }
  const sum = sorted.reduce((a, [, v]) => a + v.usd, 0);
  console.log(`검산: 배분 총합 $${sum.toFixed(6)} (목표 $${TOTAL})`);
}
```

- [ ] **Step 3: 페르소나 실측 글자수로 상수 교체**

```bash
wc -m data/persona/*.md
```

`byeolkong_core.md` + 각 도메인 파일(`byeolkong_tarot.md` / `byeolkong.md` / `byeolkong_relationship.md`) 글자수를 합해 `SYSTEM_CHARS` 를 실측값으로 고친다. 예: 코어 18,000 + 타로 5,000 → `tarot: 23_000`.

- [ ] **Step 4: 배분 실행 + 검산**

```bash
SCRATCH="C:/Users/c/AppData/Local/Temp/claude/C--Users-c-Desktop-vibe-project-byeolkong-talk/d1204945-d11c-487b-a20e-56fb325b1602/scratchpad"
node --import tsx scripts/api-cost-allocate.ts "$SCRATCH/q9.json" 72.8 | tee "$SCRATCH/cost-alloc.txt"
```

Expected: 3개 블록 각각 마지막 줄 `검산: 배분 총합 $72.800000 (목표 $72.8)`. **불일치면 멈춘다.**

판정 포인트: **상품별 `건당$` 순위가 세 시나리오에서 동일해야** 결론이 캐시 가정에 안전하다. 순위가 뒤집히면 findings 에 "캐시 가정에 민감" 경고와 함께 범위로 보고한다.

- [ ] **Step 5: 커밋**

```bash
git add scripts/api-cost-allocate.ts scripts/analysis-2026-07-25.sql
git commit -m "feat(analysis): 원가 배분 CLI + 리딩별 메시지 집계 쿼리(Q9)"
```

---

## Task A4b: 테스트 vs 실유저 원가 분리

**Files:**
- Create: `scripts/qa-cost-score.ts`
- Modify: `scripts/run-prod-query.mjs` (프로젝트 ref 를 env 로 오버라이드)
- Modify: `scripts/analysis-2026-07-25.sql` (Q9b·Q9c 추가)

배경: 콘솔 총액 $75.6 은 **prod 유저 + QA 하네스 + 로컬 개발 + prod 스모크**가 섞인 값이다. 하네스는 `qa/config.ts` 대로 **시뮬레이터 = Haiku 4.5, 판정 = Sonnet 5**, 별콩이 응답 = Sonnet 5 를 쓴다. dev DB 는 하네스가 seed 를 퍼지해서 7월 메시지가 60건뿐이므로 원장이 못 된다 — 대신 `qa/out/<타임스탬프>/*.json` 의 전사를 원장으로 쓴다.

- [ ] **Step 1: run-prod-query 에 ref 오버라이드 추가**

`scripts/run-prod-query.mjs` 5행을 다음으로 바꾼다:

```js
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || "etczntmzobherqyjoyvj"; // 기본 prod, dev = vtdmxdcetziileynjaxi
```

- [ ] **Step 2: 하네스 전사 스코어링 스크립트 작성**

`scripts/qa-cost-score.ts`:

```ts
// QA 하네스 테스트 비용 점수 — qa/out/<타임스탬프>/*.json 전사를 읽어 일별 점수를 낸다.
// 사용: node --import tsx scripts/qa-cost-score.ts 2026-07
//
// 하네스 1 케이스의 API 호출 구성 (qa/config.ts):
//   - 별콩이 응답 = Sonnet, 턴당 1콜, 입력은 전체 히스토리 누적
//   - 시뮬레이터 유저턴 = Haiku, 턴당 1콜 (첫 턴 제외 — 첫 유저 발화는 케이스 스펙 고정)
//   - 판정 = Sonnet, 케이스당 1콜, 입력 ≈ 전사 전문 + 루브릭

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { scoreReading, CHARS_PER_TOKEN, type Turn } from "../lib/analytics/apiCost.ts";

const monthPrefix = process.argv[2] ?? "2026-07";
const OUT_DIR = "qa/out";
const RUBRIC_CHARS = 3_000;   // 판정 프롬프트 루브릭 고정분
const JUDGE_OUT_CHARS = 600;  // 판정 JSON 응답
const SYSTEM_CHARS = 22_000;  // 페르소나 (Step 3 에서 실측값으로 맞출 것)

type Day = { sonnet: number; haiku: number; cases: number; runs: number; turns: number };
const byDay = new Map<string, Day>();

for (const dir of readdirSync(OUT_DIR)) {
  if (!dir.startsWith(monthPrefix)) continue;
  const day = dir.slice(0, 10);
  const d = byDay.get(day) ?? { sonnet: 0, haiku: 0, cases: 0, runs: 0, turns: 0 };
  d.runs += 1;

  for (const f of readdirSync(join(OUT_DIR, dir))) {
    if (!f.endsWith(".json")) continue;
    const p = join(OUT_DIR, dir, f);
    let j: { transcript?: { turns?: { userText?: string; assistantText?: string }[] } };
    try {
      j = JSON.parse(readFileSync(p, "utf8"));
    } catch {
      continue; // 중단된 런의 깨진 파일은 건너뛴다
    }
    const raw = j.transcript?.turns ?? [];
    if (!raw.length) continue;
    d.cases += 1;
    d.turns += raw.length;

    // 별콩이 응답 = Sonnet (full_history 트랙)
    const turns: Turn[] = [];
    for (const t of raw) {
      turns.push({ role: "user", chars: (t.userText ?? "").length });
      turns.push({ role: "assistant", chars: (t.assistantText ?? "").length });
    }
    d.sonnet += scoreReading({
      turns,
      systemChars: SYSTEM_CHARS,
      track: "full_history",
      cacheHitRate: 0.6,
    }).score;

    // 판정 = Sonnet 1콜: 입력 = 전사 전문 + 루브릭
    const transcriptChars = turns.reduce((a, t) => a + t.chars, 0);
    d.sonnet +=
      ((transcriptChars + RUBRIC_CHARS) / CHARS_PER_TOKEN / 1e6) * 3 +
      (JUDGE_OUT_CHARS / CHARS_PER_TOKEN / 1e6) * 15;

    // 시뮬레이터 = Haiku, 유저턴마다 1콜(첫 턴 제외). Haiku 4.5 단가 $1/$5 per MTok
    const simCalls = Math.max(0, raw.length - 1);
    const simIn = (transcriptChars + 1_500) / CHARS_PER_TOKEN;   // 누적 맥락 + 페르소나 지시
    const simOut = raw.reduce((a, t) => a + (t.userText ?? "").length, 0) / CHARS_PER_TOKEN;
    d.haiku += (simIn / 1e6) * 1 * (simCalls / Math.max(1, raw.length)) + (simOut / 1e6) * 5;
  }
  byDay.set(day, d);
}

const days = [...byDay.entries()].sort();
console.log("날짜        런  케이스  턴   Sonnet점수  Haiku점수");
for (const [day, d] of days) {
  console.log(
    day + String(d.runs).padStart(5) + String(d.cases).padStart(7) + String(d.turns).padStart(6) +
    d.sonnet.toFixed(3).padStart(12) + d.haiku.toFixed(3).padStart(11)
  );
}
const tot = days.reduce((a, [, d]) => ({ s: a.s + d.sonnet, h: a.h + d.haiku }), { s: 0, h: 0 });
console.log(`합계 Sonnet 점수 ${tot.s.toFixed(3)} / Haiku 점수 ${tot.h.toFixed(3)}`);
if (!existsSync(OUT_DIR)) console.error("qa/out 없음 — 경로 확인");
```

- [ ] **Step 3: 하네스 점수 실행**

```bash
SCRATCH="C:/Users/c/AppData/Local/Temp/claude/C--Users-c-Desktop-vibe-project-byeolkong-talk/d1204945-d11c-487b-a20e-56fb325b1602/scratchpad"
node --import tsx scripts/qa-cost-score.ts 2026-07 | tee "$SCRATCH/qa-cost.txt"
```

Expected: 7월 실행일이 7/13(13런) · 7/17(18런) · 7/18(1) · 7/19(6) · 7/20(1) · 7/22(7) · 7/24(3) 로 나오고, **7/19 와 7/17 점수가 가장 큼**. 7/19 Haiku 점수가 다른 날보다 뚜렷이 높아야 한다(62케이스 시뮬레이터).

- [ ] **Step 4: Q9b — prod 제외 6명 일별 점수용 집계**

```bash
SCRATCH="C:/Users/c/AppData/Local/Temp/claude/C--Users-c-Desktop-vibe-project-byeolkong-talk/d1204945-d11c-487b-a20e-56fb325b1602/scratchpad"
SUPABASE_PAT=$(cat "$SCRATCH/pat.txt") node scripts/run-prod-query.mjs --sql "
with ex as (select unnest(array['9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0']) c)
select r.id, r.consultation_type, r.created_at::date d,
       json_agg(json_build_object('role', m.role, 'chars', length(m.content)) order by m.created_at) turns
from readings r join messages m on m.reading_id = r.id
where left(r.user_id::text,8) in (select c from ex) and r.created_at >= '2026-07-01'
group by r.id, r.consultation_type, r.created_at order by r.created_at" > "$SCRATCH/q9b.json"
node -e 'const d=JSON.parse(require("fs").readFileSync(process.argv[1]+"/q9b.json","utf8"));console.log("제외유저 리딩",d.length)' "$SCRATCH"
```

- [ ] **Step 5: Q9c — dev DB 일별 메시지**

```bash
SCRATCH="C:/Users/c/AppData/Local/Temp/claude/C--Users-c-Desktop-vibe-project-byeolkong-talk/d1204945-d11c-487b-a20e-56fb325b1602/scratchpad"
SUPABASE_PAT=$(cat "$SCRATCH/pat.txt") SUPABASE_PROJECT_REF=vtdmxdcetziileynjaxi node scripts/run-prod-query.mjs --sql "
select date(created_at) d, count(*) msgs, sum(length(content)) chars
from messages where created_at >= '2026-07-01' group by 1 order by 1" > "$SCRATCH/q9c.json"
cat "$SCRATCH/q9c.json"
```

Expected (실측): 7/08 1건 · 7/11 18건 · 7/18 4건 · 7/19 2건 · 7/24 17건 · 7/25 18건 = 60건. 규모가 작아 무시 가능 수준인지 확인하는 용도.

- [ ] **Step 6: clean-day 캘리브레이션으로 분리**

일별 표를 만든다: 콘솔 Sonnet/Haiku 실측(사용자 제공 25일치) · 유저 점수(Q9 에서 제외 6명 뺀 것을 날짜별로 합산) · 테스트 점수(하네스 + Q9b + Q9c).

**clean day** = `qa/out` 실행 없음 + Q9b·Q9c 활동 없는 날. 7월 후보: 7/09 · 7/10 · 7/12 · 7/14 · 7/15 · 7/16 · 7/21 · 7/23 (Step 3·4·5 결과로 확정).

```
단가 = Σ콘솔Sonnet(clean days) / Σ유저Sonnet점수(clean days)
실유저 Sonnet 원가 = 단가 × 전체 유저 Sonnet 점수
테스트 Sonnet 원가 = 콘솔 Sonnet 총액($72.8) − 실유저 Sonnet 원가
```

Haiku($2.8)도 같은 방식으로 나눈다 — prod Haiku 는 관계 요약·민감 2차 판정·next_reco, 테스트 Haiku 는 하네스 시뮬레이터.

- [ ] **Step 7: 검산 — 7/19 지문 확인**

Expected: 7/19 의 **테스트 귀속분이 그날 콘솔($17.96)의 대부분**(60% 이상)을 차지해야 한다. 7/19 는 QA 6런·62케이스를 완주한 날이고 유저 활동은 평소 수준이었다.

**이 검산이 깨지면 멈춘다.** 원인 후보: (a) `qa/out` 디렉토리 날짜가 UTC 인데 콘솔이 KST 기준(또는 반대) → 하루 밀림. `qa/out` 이름은 UTC ISO 이므로 KST 로 +9h 보정 필요 여부 확인 (b) 판정·시뮬레이터 콜 수 가정이 실제와 다름 (c) 하네스 실행이 중단돼 전사가 일부만 남음.

- [ ] **Step 8: 커밋**

```bash
git add scripts/qa-cost-score.ts scripts/run-prod-query.mjs scripts/analysis-2026-07-25.sql
git commit -m "feat(analysis): 테스트/실유저 API 원가 분리(하네스 전사 스코어링 + clean-day 캘리브레이션)"
```

---

## Task A5: 블록 2 — 누수 계량

**Files:**
- Modify: `scripts/analysis-2026-07-25.sql` (Q10~Q15 추가)

- [ ] **Step 1: Q10 이탈 턴 분포 (premium-depth 회수 검증)**

```bash
SCRATCH="C:/Users/c/AppData/Local/Temp/claude/C--Users-c-Desktop-vibe-project-byeolkong-talk/d1204945-d11c-487b-a20e-56fb325b1602/scratchpad"
SUPABASE_PAT=$(cat "$SCRATCH/pat.txt") node scripts/run-prod-query.mjs --sql "
with ex as (select unnest(array['9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0']) c),
r as (select * from readings where left(user_id::text,8) not in (select c from ex)
        and consultation_type in ('saju','tarot')),
m as (select reading_id,
        count(*) filter (where role='user') user_turns,
        count(*) filter (where role='assistant') asst_turns,
        max(case when role='assistant' then length(content) end) max_asst_chars,
        min(case when role='assistant' then length(content) end) first_asst_chars
      from messages group by 1)
select r.prompt_version, m.user_turns, count(*) readings,
       count(*) filter (where r.result_viewed_at is not null) viewed
from r join m on m.reading_id = r.id
group by 1,2 order by 1, 2" > "$SCRATCH/q10.json"
cat "$SCRATCH/q10.json"
```

Expected: `prompt_version` 별 유저 턴 분포. baseline 은 1턴 17% · 1~2턴 27%. `2026-07-22-premium-depth` 코호트에서 1턴 비율이 낮아졌는지가 첫 풀이 2배 투자의 회수 신호.

- [ ] **Step 2: Q11 종료 유형 · 증발률**

```bash
SCRATCH="C:/Users/c/AppData/Local/Temp/claude/C--Users-c-Desktop-vibe-project-byeolkong-talk/d1204945-d11c-487b-a20e-56fb325b1602/scratchpad"
SUPABASE_PAT=$(cat "$SCRATCH/pat.txt") node scripts/run-prod-query.mjs --sql "
with ex as (select unnest(array['9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0']) c),
r as (select * from readings where left(user_id::text,8) not in (select c from ex)
        and consultation_type in ('saju','tarot')),
last_a as (
  select m.reading_id, m.content
  from messages m
  join (select reading_id, max(created_at) t from messages where role='assistant' group by 1) x
    on x.reading_id = m.reading_id and x.t = m.created_at and m.role='assistant'
),
u_last as (
  select m.reading_id, m.content
  from messages m
  join (select reading_id, max(created_at) t from messages where role='user' group by 1) x
    on x.reading_id = m.reading_id and x.t = m.created_at and m.role='user'
)
select r.prompt_version,
       case when la.content like '%[END]%' then 'end_marker'
            when ul.content like '%마무리%' then 'button_close'
            else 'silent_drop' end end_type,
       count(*) n,
       count(*) filter (where r.result_viewed_at is not null) viewed
from r left join last_a la on la.reading_id = r.id
       left join u_last ul on ul.reading_id = r.id
group by 1,2 order by 1,2" > "$SCRATCH/q11.json"
cat "$SCRATCH/q11.json"
```

Expected: baseline 정상 58% vs 증발 42%. `silent_drop` 의 `viewed` 는 0에 가까워야 정상(증발 = 결과화면 미도달).

- [ ] **Step 3: Q12 전환자 여정 패턴 재분류**

```bash
SCRATCH="C:/Users/c/AppData/Local/Temp/claude/C--Users-c-Desktop-vibe-project-byeolkong-talk/d1204945-d11c-487b-a20e-56fb325b1602/scratchpad"
SUPABASE_PAT=$(cat "$SCRATCH/pat.txt") node scripts/run-prod-query.mjs --sql "
with ex as (select unnest(array['9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0']) c),
p as (select user_id, min(created_at) first_pay from payments
      where status='completed' and left(user_id::text,8) not in (select c from ex) group by 1)
select case when pre.n = 0 then '의도직행(상담경험 0)' else '경험후전환' end pattern,
       count(*) payers,
       round(percentile_cont(0.5) within group (order by extract(epoch from (p.first_pay - u.created_at))/60)::numeric,1) med_min,
       round(avg(pre.n)::numeric,2) avg_readings_before
from p join users u on u.id = p.user_id
join lateral (select count(*) n from readings r
              where r.user_id = p.user_id and r.created_at < p.first_pay) pre on true
group by 1 order by 1" > "$SCRATCH/q12.json"
cat "$SCRATCH/q12.json"
```

Expected: baseline 은 의도직행 9 / 경험후 3 (12명). 현재 52명 기준으로 비율이 유지되는지 확인.

- [ ] **Step 4: Q13 landing_variant · 소재별 성과**

```bash
SCRATCH="C:/Users/c/AppData/Local/Temp/claude/C--Users-c-Desktop-vibe-project-byeolkong-talk/d1204945-d11c-487b-a20e-56fb325b1602/scratchpad"
SUPABASE_PAT=$(cat "$SCRATCH/pat.txt") node scripts/run-prod-query.mjs --sql "
with ex as (select unnest(array['9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0']) c),
u as (select id, created_at from users where left(id::text,8) not in (select c from ex)),
a as (select * from user_acquisition),
p as (select user_id, count(*) pays, sum(amount_won) won from payments
      where status='completed' group by 1),
r as (select user_id, count(*) readings from readings group by 1)
select coalesce(a.utm_content,'(untracked)') creative,
       coalesce(a.landing_variant,'-') variant,
       count(*) signups,
       count(r.user_id) activated,
       count(p.user_id) payers,
       coalesce(sum(p.won),0) revenue,
       round(100.0*count(p.user_id)/count(*),1) cvr_pct
from u left join a on a.user_id = u.id
       left join p on p.user_id = u.id
       left join r on r.user_id = u.id
group by 1,2 order by signups desc" > "$SCRATCH/q13.json"
cat "$SCRATCH/q13.json"
```

Meta CSV 실지출과 조인해 CAC/ROAS 를 손으로 계산한다: tarot ₩86,752 · love ₩55,985 · daily ₩25,805 · relationship ₩5,481 · counsel ₩1,119.

- [ ] **Step 5: Q14 업셀 · next_reco · 이어가기**

```bash
SCRATCH="C:/Users/c/AppData/Local/Temp/claude/C--Users-c-Desktop-vibe-project-byeolkong-talk/d1204945-d11c-487b-a20e-56fb325b1602/scratchpad"
SUPABASE_PAT=$(cat "$SCRATCH/pat.txt") node scripts/run-prod-query.mjs --sql "
with ex as (select unnest(array['9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0']) c),
r as (select * from readings where left(user_id::text,8) not in (select c from ex))
select
 (select count(*) from r where next_reco is not null) reco_filled,
 (select count(*) from r) readings,
 (select count(*) from r where previous_reading_id is not null) continued,
 (select coalesce(sum(clarifier_count),0) from r) clarifier_sum,
 (select coalesce(sum(extra_turns),0) from r) extra_turns_sum,
 (select count(*) from star_transactions st where st.source='clarifier'
    and left(st.user_id::text,8) not in (select c from ex)) clarifier_tx,
 (select count(*) from star_transactions st where st.source='extend'
    and left(st.user_id::text,8) not in (select c from ex)) extend_tx" > "$SCRATCH/q14.json"
cat "$SCRATCH/q14.json"
```

Expected 참고 실측(전체): `clarifier` 13건 130별 · `extend` 6건 60별 — baseline(0/1)에서 살아나는 중. `continued` baseline 1건.

- [ ] **Step 6: Q15 emotion_tag 분포 · 제품 교차 · 관계 흐름**

```bash
SCRATCH="C:/Users/c/AppData/Local/Temp/claude/C--Users-c-Desktop-vibe-project-byeolkong-talk/d1204945-d11c-487b-a20e-56fb325b1602/scratchpad"
SUPABASE_PAT=$(cat "$SCRATCH/pat.txt") node scripts/run-prod-query.mjs --sql "
with ex as (select unnest(array['9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0']) c),
r as (select * from readings where left(user_id::text,8) not in (select c from ex))
select coalesce(emotion_tag,'(none)') tag,
       count(*) readings,
       count(*) filter (where created_at >= '2026-07-20') since20,
       count(distinct user_id) users
from r group by 1 order by readings desc" > "$SCRATCH/q15a.json"

SUPABASE_PAT=$(cat "$SCRATCH/pat.txt") node scripts/run-prod-query.mjs --sql "
with ex as (select unnest(array['9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0']) c),
r as (select * from readings where left(user_id::text,8) not in (select c from ex)),
u as (select user_id,
        bool_or(consultation_type in ('saju','tarot')) has_consult,
        bool_or(consultation_type='relationship') has_rel,
        bool_or(saju_product is not null) has_fortune
      from r group by 1)
select has_consult, has_rel, has_fortune, count(*) users from u group by 1,2,3 order by 4 desc" > "$SCRATCH/q15b.json"

SUPABASE_PAT=$(cat "$SCRATCH/pat.txt") node scripts/run-prod-query.mjs --sql "
select left(rl.user_id::text,8) u, rl.status, rl.created_at::date reg_d,
       rl.last_visited_at::date last_d, rl.summarized_msg_count,
       (rl.partner_profile_id is not null) has_partner,
       (select count(*) from messages m where m.reading_id = rl.thread_reading_id) msgs,
       (select count(*) from messages m where m.reading_id = rl.thread_reading_id and m.role='user') user_msgs,
       (select count(*) from relationship_passes rp where rp.relationship_id = rl.id) passes
from relationships rl order by rl.created_at" > "$SCRATCH/q15c.json"
cat "$SCRATCH/q15a.json" "$SCRATCH/q15b.json" "$SCRATCH/q15c.json"
```

Expected: `q15c` 는 15행. **패스 0인 관계가 14개**일 것 — 등록 후 어디서 멈췄는지(메시지 0건 vs 대화는 했지만 미구매)가 Task A6 정독의 표적.

- [ ] **Step 7: 원장에 추가하고 커밋**

```bash
git add scripts/analysis-2026-07-25.sql
git commit -m "chore(analysis): 블록2 누수 쿼리(이탈턴·증발·전환여정·소재·업셀·태그·관계흐름)"
```

---

## Task A6: 블록 3 — 가성비 (별당 분량)

**Files:**
- Modify: `scripts/analysis-2026-07-25.sql` (Q16 추가)

- [ ] **Step 1: Q16 상품별 첫 풀이 길이 · 별당 글자수**

```bash
SCRATCH="C:/Users/c/AppData/Local/Temp/claude/C--Users-c-Desktop-vibe-project-byeolkong-talk/d1204945-d11c-487b-a20e-56fb325b1602/scratchpad"
SUPABASE_PAT=$(cat "$SCRATCH/pat.txt") node scripts/run-prod-query.mjs --sql "
with ex as (select unnest(array['9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0']) c),
r as (select * from readings where left(user_id::text,8) not in (select c from ex)
        and consultation_type='tarot' and stars_spent > 0),
first_a as (
  select m.reading_id, length(m.content) chars
  from messages m
  join (select reading_id, min(created_at) t from messages where role='assistant' group by 1) x
    on x.reading_id = m.reading_id and x.t = m.created_at and m.role='assistant'
),
tot as (select reading_id, sum(length(content)) all_chars
        from messages where role='assistant' group by 1)
select r.spread_type, r.prompt_version, count(*) n, r.stars_spent stars,
       round(avg(fa.chars)) avg_first_chars,
       round(avg(t.all_chars)) avg_total_chars,
       round(avg(fa.chars)/nullif(r.stars_spent,0)) first_chars_per_star,
       round(avg(t.all_chars)/nullif(r.stars_spent,0)) total_chars_per_star
from r join first_a fa on fa.reading_id = r.id
       join tot t on t.reading_id = r.id
group by r.spread_type, r.prompt_version, r.stars_spent
order by r.spread_type, r.prompt_version" > "$SCRATCH/q16.json"
cat "$SCRATCH/q16.json"
```

- [ ] **Step 2: 검산 — 설계 목표치 대조**

`2026-07-22-premium-depth` 코호트의 `avg_first_chars` 를 스펙 목표와 대조한다:

| 스프레드 | 목표(중앙) | 허용 범위 |
|---|---|---|
| 쓰리카드 | 1,500자 | 1,300~1,700 |
| 5장 | 2,525자 | 2,300~2,750 |
| 6장 | 2,900자 | 2,700~3,200 |
| 7장 | 3,550자 | 3,300~3,800 |

범위 밖이면 **페르소나 지시가 실전에서 안 먹은 것** → findings 에 "premium-depth 미작동" 으로 기록하고 Task A8 액션표에 올린다.

- [ ] **Step 3: 원장에 추가하고 커밋**

```bash
git add scripts/analysis-2026-07-25.sql
git commit -m "chore(analysis): 블록3 가성비 쿼리(Q16 상품별 별당 글자수)"
```

---

## Task A7: 관계 스레드 15건 전수 정독

**Files:**
- Create (커밋 금지): `<스크래치패드>/rel-threads.json`, `<스크래치패드>/rel-tagged.json`

- [ ] **Step 1: 스레드 원문 추출**

```bash
SCRATCH="C:/Users/c/AppData/Local/Temp/claude/C--Users-c-Desktop-vibe-project-byeolkong-talk/d1204945-d11c-487b-a20e-56fb325b1602/scratchpad"
SUPABASE_PAT=$(cat "$SCRATCH/pat.txt") node scripts/run-prod-query.mjs --sql "
select left(rl.user_id::text,8) u, rl.id rel_id, rl.status, rl.label,
       rl.created_at::date reg_d, rl.last_visited_at,
       (select count(*) from relationship_passes rp where rp.relationship_id=rl.id) passes,
       (select json_agg(json_build_object('role',m.role,'skill',m.skill_key,'c',m.content) order by m.created_at)
        from messages m where m.reading_id = rl.thread_reading_id) msgs
from relationships rl order by rl.created_at" > "$SCRATCH/rel-threads.json"
node -e 'const d=JSON.parse(require("fs").readFileSync(process.argv[1]+"/rel-threads.json","utf8"));
console.log(d.map(r=>({u:r.u,passes:r.passes,msgs:(r.msgs||[]).length,status:r.status})))' "$SCRATCH"
```

- [ ] **Step 2: 병렬 정독 디스패치**

관계 15건을 3개 서브에이전트에 5건씩 나눠 태깅한다. 각 에이전트에 다음 프롬프트를 준다(파일 경로와 담당 인덱스만 바꿔서):

```
`<스크래치패드>/rel-threads.json` 의 인덱스 0~4 관계 스레드를 정독하고 아래 스키마로 태깅해
JSON 배열만 반환해라. 추측 금지 — 대화에 근거가 없으면 null.

{
  "u": "유저 앞8자리",
  "entry_depth": "registered_only | few_turns | sustained",   // 등록만/1~3턴/4턴+
  "pass_purchased": true|false,
  "stop_point": "온보딩 직후 | 첫 응답 후 | 패스 안내 화면 | 대화 중 | 미이탈",
  "thirst": "무엇을 알고 싶어 왔나 (한 문장)",
  "unmet": "충족되지 않은 것 (한 문장, 없으면 null)",
  "pass_blocker": "패스를 안 산 추정 이유 — 대화 근거를 인용해 한 문장 (근거 없으면 null)",
  "persona_issue": "심문피로 | 판없는데읽는척 | 톤과잉 | 반복 | 없음",
  "skill_reaction": "스킬 칩·제안에 대한 반응 (해당 없으면 null)",
  "quote": "가장 진단적인 유저 발화 1개 (개인정보·실명 제거)"
}
```

- [ ] **Step 3: 태깅 결과 통합**

세 결과를 `$SCRATCH/rel-tagged.json` 에 합치고 집계한다.

```bash
SCRATCH="C:/Users/c/AppData/Local/Temp/claude/C--Users-c-Desktop-vibe-project-byeolkong-talk/d1204945-d11c-487b-a20e-56fb325b1602/scratchpad"
node -e '
const d=JSON.parse(require("fs").readFileSync(process.argv[1]+"/rel-tagged.json","utf8"));
const cnt=(k)=>d.reduce((a,r)=>(a[r[k]??"null"]=(a[r[k]??"null"]||0)+1,a),{});
console.log("n =", d.length);
console.log("entry_depth", cnt("entry_depth"));
console.log("stop_point", cnt("stop_point"));
console.log("persona_issue", cnt("persona_issue"));
console.log("pass_blocker 샘플:", d.map(r=>r.pass_blocker).filter(Boolean).slice(0,8));
' "$SCRATCH"
```

- [ ] **Step 4: 검산 — 태깅 건수와 pass 일치**

`n` 이 Q0 의 `rel_cnt`(15+)와 같고, `pass_purchased: true` 개수가 Q0 의 `pass_cnt`(1)과 같아야 한다. 다르면 태깅이 원문을 잘못 읽은 것 → 재확인.

---

## Task A8: findings 문서 + 액션표

**Files:**
- Create: `docs/superpowers/specs/2026-07-25-pnl-spine-findings.md`

- [ ] **Step 1: 손익계산서 조립**

`$SCRATCH` 의 q0~q16 + `cost-alloc.txt` + Meta CSV 로 다음 표를 채운다. 7월(7/1~7/25) 기준으로 정규화한다.

```
매출 (payments completed, 7월분)                        ₩ ____
− PG 수수료 (매출 × 3.7% + 월 ₩9,167)                   ₩ ____
− 광고비 (Meta 실지출 7/8~7/25)                         ₩ 175,142
− Claude API — 실유저분만 (A4b 분리 결과 × 1,400)        ₩ ____
− 인프라 (Supabase $51.98 + Vercel $20 + 도메인 $0.87)   ₩ ____
= 현금 순손익 (영업)                                     ₩ ____
− 선수금 조정 (유상 잔액 × 별당 예상 원가)                ₩ ____
= 조정 순손익                                            ₩ ____

[별도 표기 — 영업 원가 아님]
개발·테스트 API 비용 (QA 하네스·로컬·스모크)              ₩ ____
```

⚠️ **Claude API 라인에는 A4b 의 실유저분만 넣는다.** 콘솔 총액 $75.6 을 그대로 넣으면 테스트 비용이 유저 COGS 로 잡혀 단위 경제가 왜곡된다. 테스트분은 개발비 성격이라 별도 라인으로 빼고, 기여마진·CAC 계산에서는 제외한다(힉스필드와 같은 취급).

- [ ] **Step 2: findings 문서 작성**

`docs/superpowers/specs/2026-07-25-pnl-spine-findings.md` 를 다음 목차로 쓴다. 각 절은 숫자 → 해석 → 한계 순서.

1. 한 줄 요약
2. 손익계산서 (현금 / 조정 병기) + 일 번레이트 + **테스트 API 비용 별도 라인**
3. 단위 경제 — 유저당 기여마진 · CAC vs LTV · 주차 코호트 추세 (**실유저 API 원가만 사용**)
4. 별 경제 — 무료 89% 구조 · 선수금 부채 · 잔액 분포 · FIFO vs 비례배분 차이
5. 상품별 마진 순위표 (3 시나리오 민감도 병기)
6. 누수 — 무료 소진 이탈 · 리텐션 · 증발 · 이탈 턴 · 결제 마찰
7. 신규 종목 성적표 — 연애 상담(등록 15 → 패스 1) 정량 + 정독 결과
8. 가성비 — premium-depth 목표 대조
9. 광고 — 소재별 CAC/ROAS · landing_variant · Meta 상단 퍼널
10. 기존 지표 리프레시 (블록 R 15항목 표)
11. **액션표**: `[항목 / 영향(₩/월 추정) / 비용 / 근거]` — 영향 큰 순
12. 한계 · 재현 방법

- [ ] **Step 3: 검산 결과를 문서에 명시**

각 검산(매출 항등식 · 별 원장 항등식 · 배분 총합 · 태깅 건수)의 통과 여부를 §12 에 한 줄씩 적는다. 실패한 게 있으면 그 절의 숫자에 ⚠️ 를 붙인다.

- [ ] **Step 4: 커밋**

```bash
git add docs/superpowers/specs/2026-07-25-pnl-spine-findings.md
git commit -m "docs(analysis): 손익 스파인 통합 분석 findings + 액션 우선순위표"
```

---

# 트랙 B — 페이지뷰 비콘

## Task B1: 순수 함수 (봇 판정 · path 정규화) — TDD

**Files:**
- Create: `lib/analytics/pageview.ts`
- Test: `lib/analytics/pageview.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`lib/analytics/pageview.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { isBotUserAgent, normalizePath } from "./pageview.ts";

test("isBotUserAgent — UA 없으면 봇 취급", () => {
  assert.equal(isBotUserAgent(null), true);
  assert.equal(isBotUserAgent(""), true);
  assert.equal(isBotUserAgent(undefined), true);
});

test("isBotUserAgent — 일반 모바일 브라우저는 통과", () => {
  const ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";
  assert.equal(isBotUserAgent(ua), false);
});

test("isBotUserAgent — 스크래퍼·크롤러는 차단", () => {
  assert.equal(isBotUserAgent("facebookexternalhit/1.1"), true);
  assert.equal(isBotUserAgent("Googlebot/2.1"), true);
  assert.equal(isBotUserAgent("curl/8.4.0"), true);
  assert.equal(isBotUserAgent("HeadlessChrome/120.0"), true);
});

test("normalizePath — 쿼리·해시 제거", () => {
  assert.equal(normalizePath("/tarot/reading?id=abc&x=1"), "/tarot/reading");
  assert.equal(normalizePath("/shop#top"), "/shop");
});

test("normalizePath — UUID·긴 숫자 세그먼트는 :id 로 치환", () => {
  assert.equal(normalizePath("/readings/3f2a1b4c-5d6e-7f80-9012-3456789abcde"), "/readings/:id");
  assert.equal(normalizePath("/readings/1234567"), "/readings/:id");
});

test("normalizePath — 루트 유지", () => {
  assert.equal(normalizePath("/"), "/");
});

test("normalizePath — 슬래시로 시작하지 않으면 null", () => {
  assert.equal(normalizePath("bad"), null);
  assert.equal(normalizePath(""), null);
});

test("normalizePath — 200자로 cap", () => {
  const long = "/" + "a".repeat(500);
  assert.equal(normalizePath(long)!.length, 200);
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `node --import tsx --test lib/analytics/pageview.test.ts`
Expected: FAIL — `Cannot find module './pageview.ts'`

- [ ] **Step 3: 최소 구현 작성**

`lib/analytics/pageview.ts`:

```ts
// 페이지뷰 비콘 순수 로직. /api/pv 에서 사용.
// 봇 트래픽이 UV/PV 를 오염시키면 퍼널 전환율이 전부 낮게 나오므로 입구에서 막는다.

const BOT_UA =
  /bot|crawler|spider|crawling|facebookexternalhit|slurp|bingpreview|curl|wget|python-requests|okhttp|headlesschrome|lighthouse|pingdom|monitor|preview/i;

export function isBotUserAgent(ua: string | null | undefined): boolean {
  if (!ua) return true; // UA 없음 = 정상 브라우저 아님
  return BOT_UA.test(ua);
}

const UUIDISH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 라우트 단위 집계를 위해 동적 세그먼트를 :id 로 접는다. 실패 시 null. */
export function normalizePath(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.startsWith("/")) return null;
  const clean = raw.split("?")[0].split("#")[0];
  const folded = clean
    .split("/")
    .map((s) => (UUIDISH.test(s) || /^\d{6,}$/.test(s) ? ":id" : s))
    .join("/");
  return (folded || "/").slice(0, 200);
}
```

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `node --import tsx --test lib/analytics/pageview.test.ts`
Expected: PASS, `pass 8 / fail 0`

- [ ] **Step 5: 커밋**

```bash
git add lib/analytics/pageview.ts lib/analytics/pageview.test.ts
git commit -m "feat(analytics): 페이지뷰 비콘 순수 로직(봇 판정·path 정규화)"
```

---

## Task B2: 마이그레이션 `page_views`

**Files:**
- Create: `supabase/migrations/20260725000000_page_views.sql`

⚠️ `users(id)` 참조 FK 는 `ON DELETE SET NULL` 을 명시한다 — 규칙이 없으면 회원 탈퇴의 `users DELETE` 가 23503 으로 차단된다(AGENTS.md 규칙). `SET NULL` 을 고른 이유: 탈퇴 시 유저 연결만 끊고 익명 통계로 남기는 게 개인정보처리방침의 "탈퇴 시 즉시 익명 처리" 문구와 맞다.

- [ ] **Step 1: 마이그레이션 작성**

`supabase/migrations/20260725000000_page_views.sql`:

```sql
-- 페이지뷰 비콘 (2026-07-25)
-- 목적: 가입 이후 앱 내부 라우트 이탈 측정. Meta 픽셀은 광고 상단(노출→클릭→랜딩→가입)만 커버한다.
-- anon_id 는 middleware 가 첫 진입에 발급하는 byeolkong_anon_id (1년, httpOnly).
-- 로그인 후 요청엔 anon/user 쿠키가 함께 실리므로 이 테이블의 row 가 anon↔user 브리지가 된다.

CREATE TABLE IF NOT EXISTS page_views (
  id BIGSERIAL PRIMARY KEY,

  anon_id TEXT,                                             -- error_logs.anonymous_id 와 같은 관행(TEXT)
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,     -- 탈퇴 시 익명 통계로 강등

  path TEXT NOT NULL,                                       -- 정규화된 라우트 (:id 로 접힘)

  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  landing_variant TEXT,
  referrer TEXT,

  is_bot BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_page_views_created ON page_views(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_views_path ON page_views(path, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_views_anon ON page_views(anon_id, created_at) WHERE anon_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_page_views_user ON page_views(user_id, created_at) WHERE user_id IS NOT NULL;

-- RLS: service_role 만 접근. 클라는 /api/pv 엔드포인트 경유 (error_logs 관행과 동일)
ALTER TABLE page_views ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: 커밋 + dev 푸시**

```bash
git add supabase/migrations/20260725000000_page_views.sql
git commit -m "feat(db): page_views 마이그레이션(비콘 수집 테이블)"
git push origin dev
```

- [ ] **Step 3: Supabase dev 브랜치 적용 확인**

Supabase 대시보드 → Branches → dev → **Workflow logs** 에서 `20260725000000_page_views` 가 SUCCESS 인지 확인한다. FAILED 면 AGENTS.md 의 baseline drift 노트대로 정리한다.

Expected: SUCCESS. 이게 통과해야 B4 로컬 검증이 가능하다.

---

## Task B3: `/api/pv` 라우트

**Files:**
- Create: `app/api/pv/route.ts`

- [ ] **Step 1: 라우트 작성**

`app/api/pv/route.ts`:

```ts
// 페이지뷰 비콘 수집. components/analytics/PageViewBeacon.tsx → 여기 → Supabase
//
// 보안·정합:
// - anon_id/user_id 는 서버 세션에서만 추출 (클라가 보낸 값 무시 — 위조 방지)
// - path 는 정규화 후 저장 (동적 세그먼트 :id 로 접어 카디널리티 억제)
// - 봇 UA 는 is_bot=true 로 표시만 하고 저장 (필터는 분석 쿼리에서)
// - rate limit IP 분당 120건 (페이지뷰는 에러 로그보다 잦다)
// - 실패는 무음 204 — 계측이 제품 동작을 막으면 안 된다

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { isBotUserAgent, normalizePath } from "@/lib/analytics/pageview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 120;
const ipHits = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = ipHits.get(ip);
  if (!entry || entry.resetAt < now) {
    ipHits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

const str = (v: unknown, n = 120): string | null =>
  typeof v === "string" && v ? v.slice(0, n) : null;

const NO_CONTENT = () => new NextResponse(null, { status: 204 });

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  if (!checkRateLimit(ip)) return NO_CONTENT();

  const text = await req.text();
  if (text.length > 4096) return NO_CONTENT();

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text);
  } catch {
    return NO_CONTENT();
  }

  const path = normalizePath(body.path);
  if (!path) return NO_CONTENT();

  const session = await getSession();

  try {
    const supa = getServiceSupabase();
    await supa.from("page_views").insert({
      anon_id: session.anonymousId ?? null,
      user_id: session.userId ?? null,
      path,
      utm_source: str(body.utm_source),
      utm_medium: str(body.utm_medium),
      utm_campaign: str(body.utm_campaign),
      utm_content: str(body.utm_content),
      utm_term: str(body.utm_term),
      landing_variant: str(body.landing_variant, 40),
      referrer: str(body.referrer, 200),
      is_bot: isBotUserAgent(req.headers.get("user-agent")),
    });
  } catch {
    // 무음 — 계측 실패가 제품에 영향을 주지 않는다
  }
  return NO_CONTENT();
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음. `session.anonymousId` / `session.userId` 는 `lib/session.ts` 가 반환하는 필드명이다.

- [ ] **Step 3: 커밋**

```bash
git add app/api/pv/route.ts
git commit -m "feat(analytics): /api/pv 비콘 수집 라우트(세션 귀속·봇 표시·무음 실패)"
```

---

## Task B4: 클라이언트 비콘 + 마운트

**Files:**
- Create: `components/analytics/PageViewBeacon.tsx`
- Modify: `app/layout.tsx` (104행 `<MetaPixel />` 다음)

- [ ] **Step 1: 비콘 컴포넌트 작성**

`components/analytics/PageViewBeacon.tsx`:

```tsx
"use client";

// 라우트 이동마다 /api/pv 로 1건 전송. anon/user 귀속은 서버가 httpOnly 쿠키로 처리하므로
// 클라는 path 와 utm 만 보낸다.
//
// 동작 위치: root layout (Suspense 내부 — useSearchParams 사용).

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export default function PageViewBeacon() {
  const pathname = usePathname();
  const sp = useSearchParams();
  const lastRef = useRef<string>("");

  useEffect(() => {
    if (!pathname) return;
    // StrictMode 이중 실행·쿼리 변경 재렌더로 같은 경로가 두 번 찍히는 것 차단
    if (lastRef.current === pathname) return;
    lastRef.current = pathname;

    const body = JSON.stringify({
      path: pathname,
      utm_source: sp.get("utm_source") ?? undefined,
      utm_medium: sp.get("utm_medium") ?? undefined,
      utm_campaign: sp.get("utm_campaign") ?? undefined,
      utm_content: sp.get("utm_content") ?? undefined,
      utm_term: sp.get("utm_term") ?? undefined,
      landing_variant: sp.get("v") ?? undefined,
      referrer: document.referrer ? document.referrer.slice(0, 200) : undefined,
    });

    try {
      const blob = new Blob([body], { type: "application/json" });
      if (!navigator.sendBeacon("/api/pv", blob)) {
        void fetch("/api/pv", {
          method: "POST",
          body,
          keepalive: true,
          headers: { "Content-Type": "application/json" },
        });
      }
    } catch {
      // 계측 실패는 무음
    }
  }, [pathname, sp]);

  return null;
}
```

- [ ] **Step 2: layout 에 마운트**

`app/layout.tsx` 의 import 블록에 추가:

```tsx
import PageViewBeacon from "@/components/analytics/PageViewBeacon";
```

`<MetaPixel />` 다음 줄에 추가 (`useSearchParams` 를 쓰므로 Suspense 필요):

```tsx
        <MetaPixel />
        <Suspense fallback={null}>
          <PageViewBeacon />
        </Suspense>
```

- [ ] **Step 3: 빌드 확인**

Run: `npm run build`
Expected: 성공. `useSearchParams()` 관련 prerender 에러가 나면 Suspense 누락이다.

- [ ] **Step 4: 커밋**

```bash
git add components/analytics/PageViewBeacon.tsx app/layout.tsx
git commit -m "feat(analytics): PageViewBeacon 클라 비콘 + layout 마운트"
```

---

## Task B5: 로컬 E2E 검증 + 방침 한 줄

**Files:**
- Modify: `app/privacy/page.tsx` (제8조)
- Create (커밋 금지): `<스크래치패드>/pv-check.mjs`

- [ ] **Step 1: dev 서버 띄우고 라우트 3개 이동**

Browser pane 으로 `preview_start {name: "byeolkong-dev"}` 후 `/`, `/concern`, `/shop` 을 차례로 열고 콘솔 에러가 없는지 확인한다.

- [ ] **Step 2: dev DB 에 row 들어왔는지 확인**

`<스크래치패드>/pv-check.mjs`:

```js
import { createClient } from "@supabase/supabase-js";
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await s
  .from("page_views")
  .select("path,anon_id,user_id,is_bot,landing_variant,created_at")
  .order("created_at", { ascending: false })
  .limit(10);
console.log(error ?? data);
```

```bash
SCRATCH="C:/Users/c/AppData/Local/Temp/claude/C--Users-c-Desktop-vibe-project-byeolkong-talk/d1204945-d11c-487b-a20e-56fb325b1602/scratchpad"
node --env-file=.env.local "$SCRATCH/pv-check.mjs"
```

Expected: 방금 이동한 3개 경로가 최신순으로 보이고, `anon_id` 가 **세 row 모두 같은 값**(같은 브라우저 = 같은 익명 식별자), `is_bot` false.

- [ ] **Step 3: 정규화·중복 차단 확인**

`/mypage` 를 열었다 `/` 로 갔다 다시 `/mypage` 로 온 뒤 재조회한다.

Expected: `/mypage` row 가 2건(왕복이므로 정상), 같은 경로 연속 중복은 없음.

- [ ] **Step 4: 방침 문구 추가**

`app/privacy/page.tsx` 제8조의 쿠키 목록 아래에 한 줄 추가:

```tsx
          <p className="mt-2">
            또한 서비스 개선을 위해 회원이 방문한 페이지 경로와 유입 경로를
            익명 식별자 기준으로 기록합니다.
          </p>
```

- [ ] **Step 5: 커밋 + dev 푸시**

```bash
git add app/privacy/page.tsx
git commit -m "docs(privacy): 제8조에 페이지 경로 기록 고지 추가"
git push origin dev
```

---

## 실행 순서

1. **트랙 A 를 A0 → A8 순서로 완주** (비콘 데이터 없이). 검산 실패 시 멈춤.
2. 트랙 B 는 A 와 병행 가능. 단 **B2 푸시 → Supabase dev SUCCESS 확인** 이 B5 의 선행 조건.
3. prod 배포는 이 플랜 범위 밖 — 비콘이 dev 에서 검증된 뒤 별도 결정.

## Self-Review 결과

**스펙 커버리지**: 블록 0(A0) · 블록 1 P&L(A1·A2·A3·A4·**A4b 테스트/실유저 분리**·A8) · 블록 2 누수(A5) · 블록 3 가성비(A6) · 블록 R 15항목(A1 #3·#4·#6, A2 #1·#2·#5, A5 #7~#12·#14~#16) · 블록 4 정독·액션표(A7·A8) · 비콘(B1~B5) — 전 항목에 태스크가 매핑됨.

**미배정 확인**: 블록 R #13·#17·#18 은 사용자가 C 등급으로 제외 결정 → 태스크 없음이 의도된 상태.

**타입 일관성**: `Turn`/`CostTrack`/`ScoreInput` 은 A3 에서 정의하고 A4 에서 import 해 사용 — 필드명(`turns`/`systemChars`/`track`/`windowMsgs`/`summaryChars`/`cacheHitRate`) 일치. `scoreReading` 반환 `{inTok,outTok,score}` 를 A4 가 스프레드로 받아 `allocate` 에 넘기므로 `{score:number}` 제약 충족. `isBotUserAgent`/`normalizePath` 는 B1 정의 → B3 사용, 시그니처 일치. `session.anonymousId`/`session.userId` 는 `lib/session.ts` 실제 필드명(36행 확인).
