-- 손익 스파인 통합 분석 (2026-07-25) 쿼리 원장
-- 설계: docs/superpowers/specs/2026-07-25-pnl-spine-analysis-design.md
-- 플랜: docs/superpowers/plans/2026-07-25-pnl-spine-analysis.md
--
-- 실행: SUPABASE_PAT=$(cat <스크래치패드>/pat.txt) node scripts/run-prod-query.mjs --sql "<쿼리 하나>"
--       dev DB 는 SUPABASE_PROJECT_REF=vtdmxdcetziileynjaxi 를 추가
-- 제외 6명: 9ff43266 b9e5dd5a 7f83a4d7 a3bcc2c7 3d648ebe d8fdcdd0
--           (b9e5dd5a=관리자, d8fdcdd0=지인(유료결제자), 나머지 4=내부 테스트)
-- 창 A 누적(05-25~07-25) / 창 B 07-20~ / 창 C 07-22~
-- ⚠️ run-prod-query.mjs 는 read_only=true 로 실행한다.

-- ⚠️⚠️ Q0 검산 중 발견 (2026-07-25) — 탈퇴가 과거 데이터를 지운다
-- 같은 Q0 를 30분 간격으로 두 번 돌렸더니 readings 594 → 593 으로 "줄었다".
-- 원인: 회원 탈퇴(users DELETE) → 자녀 테이블 전부 CASCADE. orphan 검사 결과
--       payments/star_transactions/readings/user_acquisition 모두 orphan 0 = 전부 삭제된다.
-- 규모: account_withdrawals 누적 44건 (7/10 시작, 일 2~7건, 최근 24h 4건).
--       현재 유저 526 + 탈퇴 44 = 실제 가입 570 → 탈퇴율 7.7%
-- 분석 함의 3가지:
--   (1) 누적 매출 ₩107,900 은 과소 집계 — 탈퇴자 결제가 DB 에서 사라졌다.
--       유일한 복구 경로 = 토스 정산 총액과 대조 (그 차액 = 소멸분)
--   (2) CAC/ROAS 과대 — user_acquisition 소멸로 소재별 가입수가 과소 집계됨
--   (3) API 원가 배분 왜곡 — 탈퇴자 리딩이 점수 모수에서 빠져 남은 상품 단가가 과대
--   (4) 탈퇴율 7.7% 자체가 리텐션 신호 — "안 돌아옴"이 아니라 "계정을 지웠다"
-- 결론: 과거 findings(07-13/16/20/22)의 숫자는 그 시점 스냅샷으로 읽어야 하고,
--       재실행하면 탈퇴분만큼 작아진다. 이 원장의 모든 숫자에 같은 주의가 붙는다.

-- ============ Q0-b. 탈퇴 추이 ============
-- select withdrawn_at::date d, count(*) n from account_withdrawals group by 1 order by 1;
-- 실측: 07-10:1 07-12:2 07-14:7 07-15:2 07-16:3 07-17:2 07-18:3 07-19:5
--       07-20:3 07-21:4 07-22:5 07-23:3 07-24:2 07-25:2  (합 44)

-- ============ Q0. 모수 (검산 기준선) ============
-- 실측 (2026-07-25): u_all=525 u_since20=198 u_since22=138
--                    pay_all=52 rev_all=107900 pay20=27 rev20=54800
--                    r_all=594 r_since20=234 rel_cnt=15 pass_cnt=1
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

-- ⚠️ 아래부터는 쿼리를 하나씩 복사해 실행한다(파일 전체를 넘기면 안 된다).
--    Q0 재실행용 `sed -n '/Q0. 모수/,$p'` 는 Q1 추가 후 더 이상 Q0 만 뽑지 못한다.

-- ============ Q1. 창별 패키지 분포 · 건당 단가 ============
-- 무엇: 창(pre/B/C)별로 어떤 패키지가 몇 건 · 얼마 · 몇 별 팔렸는지. 웰컴 30→20 이후 믹스 상향 확인용.
-- 실측 (2026-07-25): 합계 52건 ₩107,900 1,180별
--   pre(~07-19)  25건 ₩53,100 590별 (₩2,124/건) — star_10 18건₩18,000 / star_70 5건₩29,500 / star_30 2건₩5,600
--   B(07-20~21)   6건  ₩6,000  60별 (₩1,000/건) — star_10 6건 뿐 (전량 최저가)
--   C(07-22~)    21건 ₩48,800 530별 (₩2,324/건) — star_30 10건₩28,000 / star_70 2건₩11,800 / star_10 9건₩9,000
--   → 웰컴 30→20 이후 star_30 이 최대 매출 라인으로 역전(pre 2건 → C 10건). 건당 단가 ₩1,000→₩2,324
--   → stars_given 은 패키지 정액(10/30/70)만 기록. 첫충전 보너스는 star_transactions 에 별도 적립
with ex as (select unnest(array['9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0']) c),
p as (select * from payments where status='completed' and left(user_id::text,8) not in (select c from ex))
select case when created_at >= '2026-07-22' then 'C(07-22~)'
            when created_at >= '2026-07-20' then 'B(07-20~21)'
            else 'pre(~07-19)' end win,
       package_type, count(*) n, sum(amount_won) won, sum(stars_given) stars
from p group by 1,2 order by 1, won desc;

-- ============ Q2. 유저별 결제 횟수 · 재구매율 ============
-- 무엇: 결제 횟수 분포. 재구매(2회+) 비율과 결제자당 평균 결제액.
-- 실측 (2026-07-25): 결제자 49명 / 52건
--   1회 46명 ₩98,300 (평균 ₩2,137) · 2회 3명 ₩9,600 (평균 ₩3,200) · 3회+ 0명
--   → 재구매율 3/49 = 6.1%. 결제자당 ₩2,202. 전체 유저(526) 기준 LTV ₩205.1. CVR 9.3%
--   → 3회 이상이 단 한 명도 없다 = LTV 가 사실상 1회 결제로 끝난다(리텐션 통로 부재)
with ex as (select unnest(array['9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0']) c),
p as (select * from payments where status='completed' and left(user_id::text,8) not in (select c from ex)),
per_user as (select user_id, count(*) cnt, sum(amount_won) won, min(created_at) first_at from p group by 1)
select cnt pay_count, count(*) users, sum(won) won_sum, round(avg(won)) avg_won_per_user
from per_user group by 1 order by 1;

-- ============ Q3. 첫 결제 소요시간 · 결제 직전 잔액 · 결제 전 소비별 ============
-- 무엇: 가입→첫 결제까지 중앙 소요시간과 결제 직전 상태. "가치 경험 후 결제"인지 "갭 결제"인지 판정.
-- 코호트는 가입 시각 07-22(UTC) 기준. ⚠️ 웰컴 30→20 배포는 07-22 20:23 KST(=11:23 UTC) 라
--    true 버킷에 웰컴 30 유저 3명이 섞인다 → 정본은 아래 Q3-b(실지급액 기준).
-- 실측 (2026-07-25):
--   false(07-22 이전 가입) n=29 med 5.7분 avg_bal_before 20.7 zero_spend 17 avg_spent 9.3
--   true (07-22 이후 가입) n=20 med 4.6분 avg_bal_before 18.0 zero_spend 15 avg_spent 3.5
--   → 양 코호트 모두 중앙 5분 내 결제. 결제 전 소비 0인 유저가 32/49 = 65%
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
from j group by 1 order by 1;

-- ============ Q3-b. 같은 지표를 "실지급 웰컴별" 로 다시 가름 (Q3 정본) ============
-- 무엇: created_at 경계 추정 대신 star_transactions(source='welcome_bonus') 실지급액으로 코호트를 나눈다.
--       Q3 의 UTC 자정 경계 오염(3명)을 제거한 판정용.
-- 실측 (2026-07-25):
--   welcome=30 n=32 med 6.0분 avg_bal_before 21.6 zero_spend 20(63%) avg_spent 8.4  (그중 3명이 Q3 true 버킷에 오염)
--   welcome=20 n=17 med 4.4분 avg_bal_before 15.9 zero_spend 12(71%) avg_spent 4.1
--   → 웰컴 축소는 의도대로 작동: 결제 전 소비 8.4→4.1별, 직전 잔액 21.6→15.9, 소요 6.0→4.4분
--   → 그러나 "소비 0 결제자" 비중은 63%→71% 로 오히려 상승 = 갭 결제 성격이 더 짙어졌다
--      (가치를 겪고 결제하는 게 아니라 페이월에 막혀 결제. 상품 미경험 결제 → 재구매 6.1% 와 정합)
with ex as (select unnest(array['9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0']) c),
p as (select * from payments where status='completed' and left(user_id::text,8) not in (select c from ex)),
fp as (select user_id, min(created_at) t from p group by 1),
w as (select user_id, sum(amount) welcome from star_transactions
      where type='charge' and source='welcome_bonus' group by 1),
j as (
  select fp.user_id, coalesce(w.welcome,0) welcome,
         extract(epoch from (fp.t - u.created_at))/60 min_to_pay,
         (select st.balance_after from star_transactions st
           where st.user_id=fp.user_id and st.created_at < fp.t order by st.created_at desc limit 1) bal_before,
         (select coalesce(sum(st.amount),0) from star_transactions st
           where st.user_id=fp.user_id and st.type='spend' and st.created_at < fp.t) spent_before,
         (u.created_at >= '2026-07-22') utc_bucket
  from fp join users u on u.id=fp.user_id left join w on w.user_id=fp.user_id
)
select welcome, count(*) n,
       count(*) filter (where utc_bucket) in_true_bucket,
       round(percentile_cont(0.5) within group (order by min_to_pay)::numeric,1) med_min,
       round(avg(bal_before)::numeric,1) avg_bal_before,
       count(*) filter (where spent_before=0) zero_spend,
       round(avg(spent_before)::numeric,1) avg_spent
from j group by 1 order by 1;

-- ============ Q4. 주차 코호트 LTV ============
-- 무엇: 가입 주차별 signups/payers/revenue/유입당 LTV/CVR. 오퍼·페르소나 변경의 누적 효과 추세.
-- 실측 (2026-07-25):
--   2026-07-06주 signups  95 payers  4 rev  ₩8,900 ltv ₩93.7  cvr  4.2%  (실제 07-08 광고 시작분 = 5일치)
--   2026-07-13주 signups 232 payers 20 rev ₩44,200 ltv ₩190.5 cvr  8.6%
--   2026-07-20주 signups 199 payers 25 rev ₩54,800 ltv ₩275.4 cvr 12.6%  (07-20~25, 6일치 미완주)
--   → 유입당 LTV 2주만에 2.9배(93.7→275.4), CVR 3배(4.2→12.6). 미완주 주차가 이미 최고치
--   ⚠️ 제외 후 최초 가입이 2026-07-08 = 실사용자 전원이 광고 시작 이후. 05-25~07-07 유저는 제외 6명뿐
--      → "누적(창 A)" 은 사실상 07-08~07-25 18일치다. 05-25 부터의 2개월이 아니다.
--   ⚠️ 탈퇴 CASCADE 로 오래된 주차의 signups 가 깎인다(비결제자 탈퇴 시 CVR/LTV 과대 표시) → 추세는 보수적으로
with ex as (select unnest(array['9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0']) c),
u as (select id, date_trunc('week', created_at)::date wk from users where left(id::text,8) not in (select c from ex)),
p as (select user_id, sum(amount_won) won, count(*) n from payments
      where status='completed' and left(user_id::text,8) not in (select c from ex) group by 1)
select u.wk, count(*) signups, count(p.user_id) payers,
       coalesce(sum(p.won),0) revenue,
       round(coalesce(sum(p.won),0)::numeric / count(*),1) ltv_per_signup,
       round(100.0 * count(p.user_id) / count(*),1) cvr_pct
from u left join p on p.user_id = u.id group by 1 order by 1;

-- ============ Q5. 결제 상태 분포 (결제 마찰) ============
-- 무엇: payments.status 분포. 미완료/환불이 있으면 그게 결제 마찰 = 손실.
-- 실측 (2026-07-25): completed 52건 ₩107,900 (07-10~07-25) — 그 외 상태 0건. 환불 0건.
-- ⚠️⚠️ 이 0 은 "마찰이 없다"는 뜻이 아니다. 스키마 블라인드다.
--    payments row 는 /api/payment/confirm 이 토스 승인 성공한 뒤에만 INSERT 되고 status 는 'completed' 하드코딩
--    (app/api/payment/confirm/route.ts:152). /api/payment/ready 는 orderId 만 만들고 row 를 안 만든다.
--    → 결제창 이탈·승인 실패는 payments 에 흔적이 전혀 없다. DEFAULT 'pending' 은 아무도 안 쓰는 죽은 값이고
--      'refunded' 는 어드민 환불 라우트만 쓴다. 실제 마찰은 error_logs 에만 남는다 → Q5-b
with ex as (select unnest(array['9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0']) c)
select status, count(*) n, coalesce(sum(amount_won),0) won, min(created_at)::date f, max(created_at)::date l
from payments where left(user_id::text,8) not in (select c from ex)
group by 1 order by n desc;

-- ============ Q5-b. 실제 결제 마찰 (error_logs 경유) ============
-- 무엇: payments 가 못 보는 승인 실패를 confirm 라우트 에러 로그로 실측. 토스 에러코드별 건수·유저수.
-- 실측 (2026-07-25, 제외 반영 후 4건/3유저 — 전부 07-13 이전):
--   NOT_AVAILABLE_PAYMENT_BY_MERCHANT 2건/1유저 (07-08) — 상점 차단 사고. 해당 유저(13a39e80) 이후 결제 0건
--                                                        = 유실 고객 1명 확정 (₩1,000~5,900 상당)
--   REJECT_ACCOUNT_PAYMENT            1건/1유저 (07-12) — 고객 계좌 거절. 2분 후 재시도 성공(₩1,000/10별) = 회복
--   ALREADY_PROCESSED_PAYMENT         1건/1유저 (07-12) — 위 유저의 재시도 레이스. 최종 정합
--   → 돈 받고 별 안 준 사고 0건 (user_paid_won ↔ pg 별 적립 전건 정합 확인)
--   → 07-13 이후 승인 실패 0건. 남은 블라인드 = 토스 결제창에서 그냥 닫은 이탈(어디에도 기록 없음)
with ex as (select unnest(array['9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0']) c)
select level,
       coalesce(context->'extra'->>'tossErrorCode', context->>'tossErrorCode','(none)') toss_code,
       count(*) n, count(distinct user_id) users,
       min(created_at)::date f, max(created_at)::date l
from error_logs
where route = '/api/payment/confirm'
  and (user_id is null or left(user_id::text,8) not in (select c from ex))
group by 1,2 order by n desc;

-- ============ 검산: 매출 3중 대조 (블록 1-a 게이트) ============
-- Q0.rev_all == Q1 의 won 합 == Q2 의 won_sum 합
-- 실측 결과 (2026-07-25): 107,900 == 107,900 == 107,900  → ok: true
--   부가 대조도 전부 통과 — 건수 52 (Q0/Q1/Q2/Q5 일치) · 결제자 49 (Q2/Q3/Q4 일치)
--                          창 B+C ₩54,800 == Q0.rev20 · Q4 signups 합 526 == Q0.u_all
--   제외필터 검증: 무필터 users 532 - 526 = 정확히 6명 제외 (필터 문자열 전건 매칭)
