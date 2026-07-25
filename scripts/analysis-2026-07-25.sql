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

-- ============ Q6. 별 지급/소비 원장 요약 (type × source) ============
-- 무엇: 별이 어디서 들어오고(charge) 어디로 나가는지(spend) source 별 건수·별·기간.
--       type 에 'charge'/'spend' 외 값이 없음을 확인하는 항등식 전제 검사도 겸한다.
-- 실측 (2026-07-25, 제외 6명 반영): type 은 charge/spend 2종뿐 (제3의 값 없음 = 항등식 전제 성립)
--   [charge] 총 16,303별
--     welcome_bonus       525건 14,630별 (07-08~07-25)  ← 가입 웰컴, 지급의 89.7%
--     pg                   52건  1,180별 (07-10~07-25)  ← 유일한 유상 지급. payments.stars_given 합과 정확히 일치
--     first_charge_bonus   49건    403별 (07-10~07-25)  ← 첫충전 보너스 (49명 = 결제자 전원)
--     admin_adjust          1건     50별 (07-08)
--     fortune_refund_monthly     1건 20별 / fortune_refund_tarot_love 1건 20별  ← 무료 운세 실패 환불
--   [spend] 총 11,285별
--     tarot_reading   440건 9,205별 (81.6%) · saju_reading 51건 1,020별 · fortune_compat 13건 420별
--     fortune_tarot_love 14건 280별 · fortune_monthly 7건 140별 · clarifier 11건 110별
--     extend 6건 60별 · relationship_pass 1건 30별 · fortune_tarot_money 1건 20별
--   → 무료 지급 15,123별 vs 유상 1,180별 = **무료가 지급의 92.8%** (플랜 추정 89% 보다 높다)
--   → 제외 6명이 무필터 실측 대비 들고 간 몫: pg 7건 740별, fortune_saju_full 3건 180별 전량,
--      admin_adjust 2건 525별, fortune_refund_tarot_money 1건 20별. 즉 최고가 상품(saju_full 60별)의
--      prod 소비는 전량 내부 테스트였고 **실유저 소비 0건** 이다.
with ex as (select unnest(array['9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0']) c)
select type, source, count(*) n, sum(amount) stars, min(created_at)::date f, max(created_at)::date l
from star_transactions where left(user_id::text,8) not in (select c from ex)
group by 1,2 order by 1, stars desc;

-- ============ Q7. 유저별 FIFO 분해 + 원장 항등식 위반 탐지 ============
-- 무엇: 유저별로 F(무료지급)/P(유상지급)/S(소비)/B(잔액) 을 모으고 (1) balance = F+P-S 항등식 위반을 세고
--       (2) 무료 별을 먼저 태운다는 FIFO 가정으로 잔액·소비를 무료분/유상분으로 쪼갠다.
--       유상 잔액 = 선수금 부채(받은 돈에 아직 원가가 안 붙은 몫), 무료 잔액 = 미래 COGS(매출 무관).
-- 실측 (2026-07-25): users 525 · **identity_violations 0**
--   P 1,180 · F 15,123 · S 11,285 · B 5,018   (1,180 + 15,123 − 11,285 = 5,018 ✓)
--   무료 잔액 4,580 (91.3%) / 유상 잔액 438 (8.7%)      ← 438별 = FIFO 선수금 부채
--   무료 소비 10,543 (93.4%) / 유상 소비 742 (6.6%)     ← 변동원가의 93.4% 가 매출 없는 무료 별에서 탔다
--   4중 폐곡선 전부 성립: F=무료소비+무료잔액 / P=유상소비+유상잔액 / S=소비2분 / B=잔액2분
--   ⚠️ 조인 커버리지 확인: star_balances 526행 vs 거래 있는 유저 525명. 차이 1명은 거래 0·잔액 0 이라
--      sum(balance) 에 영향 없음(아래 커버리지 쿼리로 실측). 역방향(거래 있고 잔액행 없음) 0건.
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
from j;

-- ============ Q7-cov. 조인 커버리지 (Q7 의 inner join 이 잔액을 빠뜨리는지) ============
-- 무엇: Q7 은 거래가 있는 유저만 잡는다(inner join). 잔액행은 있는데 거래가 없는 유저의 잔액이
--       합계에서 누락되면 항등식이 "통과처럼 보이지만" 모수가 좁아진 것이다.
-- 실측 (2026-07-25): balance_rows 526 / tx_users 525 / balance_all_rows 5,018
--   bal_no_tx 1명 (그 1명의 잔액 합 0별) · tx_no_bal 0명 · users_all 526
--   → 잔액행 전체 합 5,018 == Q7.balance_total 5,018. 누락 없음 = Q7 항등식은 전 모수 커버.
with ex as (select unnest(array['9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0']) c),
sb as (select * from star_balances where left(user_id::text,8) not in (select c from ex)),
st as (select distinct user_id from star_transactions where left(user_id::text,8) not in (select c from ex))
select (select count(*) from sb) balance_rows,
       (select count(*) from st) tx_users,
       (select coalesce(sum(balance),0) from sb) balance_all_rows,
       (select count(*) from sb where not exists (select 1 from st where st.user_id=sb.user_id)) bal_no_tx,
       (select coalesce(sum(balance),0) from sb where not exists (select 1 from st where st.user_id=sb.user_id)) bal_no_tx_stars,
       (select count(*) from st where not exists (select 1 from sb where sb.user_id=st.user_id)) tx_no_bal,
       (select count(*) from users u where left(u.id::text,8) not in (select c from ex)) users_all;

-- ============ Q7-b. FIFO 분해를 결제자/비결제자로 가름 (FIFO 정합성 검증) ============
-- 무엇: 선수금 부채는 원리상 결제자에게만 존재한다. 비결제자에게 유상 잔액이 잡히면
--       FIFO 계산이나 source 분류(pg 판정)가 틀린 것 → 이 쿼리가 그 오류를 잡는 검산이다.
-- 실측 (2026-07-25):
--   결제자   49명: P 1,180 · F 1,703 · S 2,415 · B   468 | 무료잔액   30 · 유상잔액 438 | 무료소비 1,673 · 유상소비 742
--   비결제자 476명: P     0 · F 13,420 · S 8,870 · B 4,550 | 무료잔액 4,550 · 유상잔액 **0** | 무료소비 8,870 · 유상소비 0
--   → **비결제자 유상 잔액 0 · users_with_pg_stars 0 = FIFO/source 분류 정상**
--   → 교차검증: users_with_pg_stars(결제자) 49 == payments 결제자 49 == first_charge_bonus 수령 49
--      (pg 별만 있고 payments row 가 없는 유령, 또는 그 역이 0건)
--   → 해석: 결제자는 무료별을 1,703 중 1,673(98.2%) 태운 뒤 결제했고, 남은 무료는 30별뿐.
--      비결제자는 13,420 무료별 중 8,870(66%)만 태우고 4,550 을 방치 = 미래 COGS 이자 재활성 재고.
--   → 유상 소비 742별은 전량 결제자 몫이고, 결제자 소비 2,415 중 유상분은 30.7% 뿐
--      (즉 결제자조차 소비의 69%를 무료별로 했다).
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
         greatest(0, a.f_free - a.s_spend) free_left,
         (select count(*) from payments p where p.user_id=a.user_id and p.status='completed') pays
  from agg a join star_balances b on b.user_id = a.user_id
)
select (pays>0) is_payer, count(*) users,
       count(*) filter (where p_paid>0) users_with_pg_stars,
       sum(p_paid) paid_total, sum(f_free) free_total, sum(s_spend) spend_total,
       sum(balance) balance_total,
       sum(free_left) free_left_total,
       sum(balance - free_left) paid_left_total,
       sum(least(f_free,s_spend)) free_consumed,
       sum(greatest(0, s_spend - f_free)) paid_consumed
from j group by 1 order by 1 desc;

-- ============ Q7-c. 비례배분(pro-rata) 방식과 FIFO 방식의 선수금 차이 ============
-- 무엇: 유상 잔액을 FIFO(무료 먼저 소비) 대신 비례배분 Σ(B × P/(F+P)) 으로 계산해 두 값을 비교한다.
--       비례배분은 무료 소비를 과대 인정해 유상 잔액(부채)을 작게 만든다 → 순이익을 낙관적으로 만든다.
--       손익계산서 정본은 부채를 크게 잡는 FIFO 를 쓰고, 이 차이를 민감도로 병기한다.
-- 실측 (2026-07-25): users 525 · F+P=0 인 유저 0명 (전원 최소 1건 지급 = 웰컴)
--   유상 잔액  FIFO 438별  vs  비례배분 205.0별   → 차이 233별 (FIFO 가 2.14배)
--   무료 잔액  FIFO 4,580별 vs 비례배분 4,813.0별 (차이 233별, 정확히 반대 부호 = 총량 5,018 보존)
--   유상 소비  FIFO 742별  vs 비례배분 975.0별   → 배분 방식이 원가 귀속도 233별 옮긴다
--   → 방식 선택의 손익 영향폭은 233별. 별당 변동원가를 곱한 금액이 "조정 순손익" 의 민감도 구간이다.
with ex as (select unnest(array['9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0']) c),
agg as (
  select user_id,
    sum(case when type='charge' and source='pg' then amount else 0 end) p_paid,
    sum(case when type='charge' and source<>'pg' then amount else 0 end) f_free,
    sum(case when type='spend' then amount else 0 end) s_spend
  from star_transactions where left(user_id::text,8) not in (select c from ex) group by 1
),
j as (
  select a.*, b.balance, greatest(0, a.f_free - a.s_spend) free_left
  from agg a join star_balances b on b.user_id = a.user_id
)
select count(*) users_all,
       count(*) filter (where (f_free+p_paid)=0) users_zero_charge,
       round(sum(case when (f_free+p_paid)>0 then balance::numeric * p_paid / (f_free+p_paid) else 0 end),1) paid_left_prorata,
       round(sum(case when (f_free+p_paid)>0 then balance::numeric * f_free / (f_free+p_paid) else 0 end),1) free_left_prorata,
       sum(balance - free_left) paid_left_fifo,
       sum(free_left) free_left_fifo,
       round(sum(case when (f_free+p_paid)>0 then s_spend::numeric * p_paid / (f_free+p_paid) else 0 end),1) paid_consumed_prorata,
       sum(greatest(0, s_spend - f_free)) paid_consumed_fifo
from j;

-- ============ Q8. 별 잔액 분포 (버킷 × 결제자여부) ============
-- 무엇: 잔액 버킷별 유저수·별 합을 결제자/비결제자로 가른다. 소진율(잔액<10) 이 페이월 도달 압력의 대리지표.
-- 실측 (2026-07-25): 전체 526명 5,018별 (= Q7.balance_total ✓)
--   결제자 49명 468별  — 0:1명 0별 / 1-9:37명 164별 / 10-19:8명 100별 / 20-39:**0명** / 40+:3명 204별
--     → 소진율(잔액<10) 38/49 = 77.6%. 40+ 3명이 결제자 잔액의 43.6%(204별, 평균 68별, 최대 100별)
--        = 선수금 부채가 소수 고액 패키지 구매자에게 집중
--   비결제자 477명 4,550별 — 0:44명 0별 / 1-9:265명 1,325별 / 10-19:80명 900별 / 20-39:87명 2,270별 / 40+:1명 55별
--     → 소진율(잔액<10) 309/477 = **64.8%** (baseline 71% 대비 6.2pp 하락)
--        웰컴 30→20 축소로 "다 태우고 페이월에 붙는" 유저 비중이 줄고, 대신 20-39 버킷(87명 2,270별)이 두꺼워졌다
--        = 웰컴 20 을 받고 **한 번도 안 쓴 채 이탈**하는 층. 실제로 소비 0 유저 67명이 1,870별을 들고 있고 전원 비결제자.
--     → 비결제자 40+ 1명 55별 = admin_adjust 50별 수령자(유일)
--   ⚠️ Q8 은 star_balances 기준(526) 이라 Q7-b(거래 조인 기준 525) 보다 비결제자가 1명 많다 — 그 1명 잔액 0.
with ex as (select unnest(array['9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0']) c),
b as (select sb.*, (select count(*) from payments p where p.user_id=sb.user_id and p.status='completed') pays
      from star_balances sb where left(sb.user_id::text,8) not in (select c from ex))
select case when balance = 0 then '0'
            when balance between 1 and 9 then '1-9'
            when balance between 10 and 19 then '10-19'
            when balance between 20 and 39 then '20-39'
            else '40+' end bucket,
       (pays > 0) is_payer, count(*) users, sum(balance) stars
from b group by 1,2 order by 2 desc, 1;

-- ============ Q8-b. 소비 0 유저 · 잔액 이상치 진단 ============
-- 무엇: Q8 의 두꺼운 버킷과 이상치의 정체를 밝힌다. "한 번도 안 쓴 유저" 규모 = 무료별 사장(死藏) 규모.
-- 실측 (2026-07-25): never_spent 67명이 1,870별 보유 · **전원 비결제자**(결제자 중 소비 0 은 0명)
--   → 결제자 49명은 전원 최소 1회 소비했다. (블록 1-a 의 "결제 전 소비 0 = 65%" 와 상충 아님:
--      그들은 결제 후에 소비했다 = 페이월에 막혀 먼저 결제하고 그 다음 상품을 겪는 순서)
--   → 비결제자 40+ 1명(최대 55별) = admin_adjust 수령자. 결제자 최대 잔액 100별, 40+ 평균 68별.
with ex as (select unnest(array['9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0']) c),
agg as (
  select user_id,
    sum(case when type='charge' and source='pg' then amount else 0 end) p_paid,
    sum(case when type='charge' and source<>'pg' then amount else 0 end) f_free,
    sum(case when type='spend' then amount else 0 end) s_spend
  from star_transactions where left(user_id::text,8) not in (select c from ex) group by 1
),
j as (select a.*, b.balance, (select count(*) from payments p where p.user_id=a.user_id and p.status='completed') pays
       from agg a join star_balances b on b.user_id=a.user_id)
select count(*) filter (where s_spend=0) never_spent_users,
       sum(balance) filter (where s_spend=0) never_spent_stars,
       count(*) filter (where s_spend=0 and pays=0) never_spent_nonpayer,
       count(*) filter (where s_spend=0 and pays>0) never_spent_payer,
       count(*) filter (where pays=0 and balance>=40) np40_users,
       max(balance) filter (where pays=0) np_max_balance,
       max(balance) filter (where pays>0) payer_max_balance,
       round(avg(balance) filter (where pays>0 and balance>=40),1) payer40_avg
from j;

-- ============ 검산: 원장 항등식 (블록 1-b 게이트) ============
-- (1) 유저별 balance = F + P − S 위반 건수 == 0
-- (2) 합계 paid_total + free_total − spend_total == balance_total
-- 실측 결과 (2026-07-25): { violations: 0, lhs: 5018, balance_total: 5018, ok: true }
--   보조검산 4종 전부 true — 무료소비+무료잔액=F(15,123) · 유상소비+유상잔액=P(1,180)
--                            무료소비+유상소비=S(11,285) · 무료잔액+유상잔액=B(5,018)
--   커버리지 검산: 잔액행 전체 합(5,018) == Q7 조인 후 합(5,018) → inner join 누락 0
--   교차검산: Q8 stars 합 468+4,550 = 5,018 == Q7.balance_total · Q8 users 49+477 = 526 == users_all
--   교차검산: Q6 pg 1,180별 == Q1 stars_given 합 1,180별 == Q7.paid_total 1,180
-- 실행: node -e 'const r=JSON.parse(require("fs").readFileSync("<스크래치패드>/q7.json","utf8"))[0];
--        const lhs=Number(r.paid_total)+Number(r.free_total)-Number(r.spend_total);
--        console.log({violations:Number(r.identity_violations), lhs, balance_total:Number(r.balance_total),
--          ok: Number(r.identity_violations)===0 && lhs===Number(r.balance_total)});'
--
-- 선수금 조정 라인의 원자료 (손익계산서 투입값):
--   미소비 유상 별 = 438별 (FIFO 정본) / 205별 (비례배분) → 조정 순손익 = 현금 순손익 − 438 × 별당변동원가
--   미래 COGS (매출 무관) = 무료 잔액 4,580별 — 부채 아님, 별도 표기
--   참고: 유상 별당 매출 ₩107,900 / 1,180별 = ₩91.44/별 → 438별에 대응하는 미실현 매출 ₩40,051
--         (누적 매출의 37.1%. 단 손익 조정에 쓰는 값은 원가 기준 438별이고 이 ₩ 는 매출인식 관점 참고치)

-- ============ Q9. 리딩별 메시지 집계 (API 원가 배분 입력) ============
-- 용도: scripts/api-cost-allocate.ts 의 입력. 콘솔 총액(진실)을 이 리딩별 점수 비중으로 배분한다.
-- 실행: ... --sql "<아래 쿼리>" > "<스크래치패드>/q9.json"
--       node --import tsx scripts/api-cost-allocate.ts "<스크래치패드>/q9.json" 72.8
--
-- ⚠️ 상품 분류 함정 2개 (플랜 초안의 coalesce(spread_type, saju_product) 는 틀린다)
--   (1) readings.saju_product 는 NOT NULL DEFAULT 'today_letters' (20260609000000_saju_products.sql)
--       → 절대 NULL 이 안 된다. "saju_product 가 채워졌는가"로 운세 리포트를 못 가른다.
--         타로 리딩도 전부 saju_product='today_letters' 를 들고 있다.
--   (2) 운세 one-shot 리포트의 진짜 마커는 emotion_tag 센티넬 'fortune:<type>'
--       (lib/fortune/types.ts FORTUNE_SENTINEL_PREFIX, app/api/fortune/create/route.ts).
--       consultation_type 엔 cfg.base('saju'|'tarot') 가 들어가므로 종목만으론 대화/리포트 구분 불가.
--
-- 실측 요약 (2026-07-25 실행): 리딩 580건 / 턴(메시지) 5,008개 / 별소모 11,045
--   kind·persona 분포: chat/tarot 440건 4,408턴 · report/fortune 88건 88턴(전부 assistant 1건 = one-shot)
--                      chat/saju 51건 506턴 · chat/relationship 1건 6턴
--   메시지 0건 리딩 14건은 inner join 으로 빠짐 = relationship 스레드 껍데기(stars_spent 전부 0) → 원가·매출 누락 없음
--   readings/messages 는 전부 7/08 이후 (min(created_at)=2026-07-08, pre-July 0건).
--     users 는 5/25, payments 는 6/17 부터 → 7/08 이전 리딩·메시지는 이미 삭제됨(탈퇴 CASCADE).
--     ⚠️ 콘솔 총액창은 7/01~7/25 인데 점수 기반은 7/08~ → 7/01~7/07 사용분이 있었다면
--        살아남은 리딩에 비례 전가된다. 비례라서 순위·점유율엔 불변, 절대 금액만 상향 편의.
with ex as (select unnest(array['9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0']) c)
select r.id,
       case when r.emotion_tag like 'fortune:%' then 'report' else 'chat' end kind,
       case when r.emotion_tag like 'fortune:%' then r.emotion_tag
            when r.consultation_type = 'relationship' then 'relationship:thread'
            when r.spread_type is not null then 'tarot:' || r.spread_type
            else 'saju:' || r.saju_product end product,
       case when r.emotion_tag like 'fortune:%' then 'fortune'
            else r.consultation_type end persona,
       r.consultation_type, r.stars_spent, r.created_at::date d,
       json_agg(json_build_object('role', m.role, 'chars', length(m.content))
                order by m.created_at) turns
from readings r join messages m on m.reading_id = r.id
where left(r.user_id::text,8) not in (select c from ex) and r.created_at >= '2026-07-01'
group by r.id order by r.created_at;

-- ============ Q9 부속: 상품 분류 검증 (위 함정 (1)(2) 실증) ============
-- 실측: saju_product 는 74개 조합 전부에서 non-null. tarot 리딩도 today_letters 를 들고 있다.
--       emotion_tag 가 'fortune:%' 인 행은 예외 없이 메시지 1건(assistant) = one-shot 리포트.
with ex as (select unnest(array['9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0']) c),
r as (select * from readings where left(user_id::text,8) not in (select c from ex)
        and created_at >= '2026-07-01')
select r.consultation_type, coalesce(r.emotion_tag,'(null)') tag, r.spread_type, r.saju_product,
       r.skill_key, count(*) n, sum(cnt.msgs) msgs, sum(r.stars_spent) stars
from r join lateral (select count(*) msgs from messages m where m.reading_id=r.id) cnt on true
group by 1,2,3,4,5 order by n desc;

-- ============ 검산: A4 원가 배분 게이트 (2026-07-25 실행 결과) ============
-- 페르소나 정적 블록 실측 글자수 (SYSTEM_CHARS) — 문자수 기준. wc -m 은 로케일이 UTF-8 이 아니면
--   바이트를 세므로(한국어 3배 과대) 쓰지 말 것. Postgres length() 도 문자수라 이쪽이 정합.
--   근거: lib/claude.ts getPersona/getTarotPersona/getRelationshipPersona = core + "\n\n---\n\n"(7자) + 도메인
--         lib/fortune/prompt.ts getFortunePersona = byeolkong_fortune.md 단독 (코어 없음!)
--   core 8,379 · saju 2,193 · tarot 8,212 · relationship 4,073 · fortune 678
--   → saju 10,579 / tarot 16,598 / relationship 12,459 / fortune 678
--   ⚠️ 운세 리포트만 코어를 안 붙여서 정적 블록이 24배 작다 → 캐시 히트율 가정에 가장 민감한 항목.
--
-- 게이트 1 (총합 일치): 히트율 0.3·0.6·0.9 3개 시나리오 전부
--   "검산: 배분 총합 $72.800000 (목표 $72.8)" → 통과.
-- 게이트 2 (건당$ 순위 안정성): discordant pair 기준 n>=1 190쌍 중 역전 4건 / n>=5 78쌍 중 1건.
--   유일한 유의미 역전 = saju:today_letters vs fortune:monthly (0.3에서 +92.9% → 0.9에서 -17.0%).
--   나머지 3건은 0.9 에서 ±0.2~10% 로 스치는 근접 동률(relationship_5↔potential_7, three_card·two_card↔choice).
--   건당$ 상위 3위(deep_feelings_5 · readiness_6 · reunion_deep_7)는 3 시나리오 전부 동일 → 결론 유지.
--   구조적 원인: 히트율↑ → 정적 블록 과금↓ → 정적 678자인 운세 리포트의 상대 원가가 +124~128% 뛰고
--                정적 16,598자인 타로는 −4~10% 내려간다(고정 총액 배분이라 서로 밀어냄).
--
-- 배분 결과 (히트율 0.6): 총 ₩101,920 (= $72.8 × 1,400)
--   tarot:three_card 214건 $33.59 (건당 $0.1570, 별당 ₩8.8) — 전체 원가의 46%
--   tarot:two_card 116건 $16.14 · tarot:one_card 79건 $8.56 · tarot:relationship_5 17건 $3.47
--   saju:nature 26건 $3.20 · tarot:deep_feelings_5 6건 $2.11(건당 최고 $0.3523) · saju:good_days 17건 $1.55
--   fortune 계열 88건 합 $1.69 (건당 $0.0192) — 건수 15%인데 원가 2.3%
--
-- ⚠️ 실현 현금 대조 (A 마진표의 "명목매출"과 구분): 소비 별의 93.4% 가 무료라
--   명목매출(별소모 × ₩91.44) 합 ₩1,009,955 은 실매출 ₩107,900 의 9.4배.
--   현금 기준 진짜 그림 = 실매출 ₩107,900 vs 배분 API 원가 ₩101,920 → API 원가가 매출의 94.5%.
--   (완료 결제 52건 전부 7월분이라 원가창 7/01~7/25 과 매출창이 정합)
--   무료로 태운 원가 근사 = ₩101,920 × 93.4% = ₩95,193 / 유상 대응 ₩6,727.
--
-- C. 운세 one-shot vs 대화형 (방향은 3 시나리오 전부 동일, 배수만 캐시 가정에 민감):
--   chat 492건 건당 $0.1445(₩202) 건당 20.8별 별당 ₩9.7
--   report 88건 건당 $0.0192(₩27)  건당  9.3별 별당 ₩2.9
--   → 별당 원가 chat/report = 4.64배(0.3) / 3.37배(0.6) / 2.04배(0.9). 대화형이 항상 별당 원가가 나쁘다.
--
-- 모델 한계(배분 왜곡 방향): systemChars 는 cache_control 마킹된 staticPart 만 센다.
--   dynamicPart(사주판·뽑은 카드·관계 파일 블록·verdict/draw 가이드)는 매 턴 비캐시로 나가는데 미계상 →
--   동적 블록이 큰 상품(good_days 30일 일진, compat 두 사람 사주, relationship_5)의 원가가 과소 추정.
