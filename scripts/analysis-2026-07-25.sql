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

-- ============ Q9b. 제외 6명(관리자·내부테스트·지인) 리딩별 메시지 집계 ============
-- A4b 테스트/실유저 분리용. 이 사람들은 "유저 모수에서 빼고 테스트 모수에 넣는" 쪽 →
-- 활동이 있는 날은 clean day 에서 탈락시킨다. d(UTC) 와 d_kst 를 같이 뽑아 타임존 가정 2개를 다 계산.
with ex as (select unnest(array['9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0']) c)
select r.id, r.consultation_type, r.created_at::date d,
       (r.created_at at time zone 'Asia/Seoul')::date d_kst,
       json_agg(json_build_object('role', m.role, 'chars', length(m.content)) order by m.created_at) turns
from readings r join messages m on m.reading_id = r.id
where left(r.user_id::text,8) in (select c from ex) and r.created_at >= '2026-07-01'
group by r.id, r.consultation_type, r.created_at order by r.created_at;
-- 실측: 19건. 일별(UTC) 07-08:1 · 09:2 · 10:9 · 11:1 · 12:1 · 13:2 · 15:1 · 16:1 · 22:1
--       → clean day 후보 7/09·7/10·7/12·7/15·7/16 이 이걸로 전부 탈락. 남는 엄격 clean = 7/14·7/21·7/23.

-- ============ Q9c. dev DB 일별 메시지 (⚠️ SUPABASE_PROJECT_REF=vtdmxdcetziileynjaxi) ============
-- 로컬 개발·하네스가 태운 dev 분. 하네스가 seed 를 퍼지해서 원장이 못 되지만(7월 60건뿐),
-- "그날 dev 서버를 건드렸는지" 플래그로는 유효하다.
select date(created_at) d, count(*) msgs, sum(length(content)) chars
from messages where created_at >= '2026-07-01' group by 1 order by 1;
-- 실측: 60건. 07-08:1 · 11:18 · 18:4 · 19:2 · 24:17 · 25:18 (플랜 예상치와 정확히 일치)

-- ============ Q9c2. dev DB 리딩별 집계 (Q9c 의 스코어링용 버전, dev ref) ============
select r.id, r.consultation_type, r.created_at::date d,
       (r.created_at at time zone 'Asia/Seoul')::date d_kst,
       json_agg(json_build_object('role', m.role, 'chars', length(m.content)) order by m.created_at) turns
from readings r join messages m on m.reading_id = r.id
where r.created_at >= '2026-07-01' group by r.id, r.consultation_type, r.created_at order by r.created_at;
-- 실측: 8건. ⚠️ 리딩 기준 일자와 메시지 기준 일자가 어긋난 건 1건(7/18 생성 관계 스레드가 7/24 에 11개 추가) —
--       dev 는 무시 가능. prod 는 아래 Q9e 로 확인했고 스팬 리딩이 1건뿐이라 리딩 일자 귀속이 안전하다.

-- ============ Q9d. prod 리딩 UTC↔KST 날짜 맵 (Q9 의 KST 재버킷용) ============
select r.id, r.created_at::date d, (r.created_at at time zone 'Asia/Seoul')::date d_kst
from readings r where r.created_at >= '2026-07-01';
-- 실측: 615건 중 189건(31%)이 UTC 날짜 ≠ KST 날짜 → 타임존 가정이 일별 표를 실제로 흔든다.

-- ============ Q9e. 검산: 리딩이 여러 날에 걸치는지 (일자 귀속 안전성) ============
with ex as (select unnest(array['9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0']) c),
s as (select r.id, r.consultation_type, count(distinct m.created_at::date) days, count(*) msgs
      from readings r join messages m on m.reading_id=r.id
      where left(r.user_id::text,8) not in (select c from ex) and r.created_at>='2026-07-01'
      group by 1,2)
select consultation_type, days>1 multi, count(*) readings, sum(msgs) msgs from s group by 1,2 order by 1,2;
-- 실측: 멀티데이 리딩 1건(tarot, 12메시지)뿐 / 전체 5,014메시지. → 리딩 created_at 일자로 원가를 귀속해도
--       왜곡이 0.24% 미만. (연애 스레드가 늘면 이 가정이 깨지므로 다음 분석 때 재확인할 것)

-- ============ 검산: A4b 테스트/실유저 분리 (2026-07-25 실행 결과) ============
-- 실행: node --import tsx scripts/qa-cost-score.ts 2026-07 <q9> <q9b> <q9c2> <q9d>
--
-- 방법(잔여법): clean day(하네스 실행 0 + Q9b 0 + Q9c 0) 에서만 콘솔 실측 ÷ 유저 점수 = 단가를 구하고,
--   그 단가로 전체 유저분을 환산한 뒤 나머지를 테스트분으로 돌린다. 하네스 판정 콜처럼 전사에 안 남는
--   오버헤드가 자동으로 테스트 쪽에 잡히므로 점수 비례 배분보다 정확하다.
--
-- ✅ 게이트 (7/19 지문): 콘솔 $17.96 중 테스트 귀속 $13.59 = 75.7% (UTC) / $13.33 = 74.2% (KST). 기준 60% 통과.
--
-- 결과 (UTC 채택): Sonnet 실유저 $51.22(70.4%) / 테스트 $21.57(29.6%)
--                  Haiku  실유저 $1.09(39.0%)  / 테스트 $1.71(61.0%)
--                  합계   실유저 $52.31(69.2%) / 테스트 $23.28(30.8%)
--   → A4 의 상품별 배분($72.8 전액을 유저 리딩에 배분)은 실유저분으로 축소 배율 51.22/72.79 = 0.704 를 곱한다.
--      배분 API 원가 ₩101,920 → ₩71,700 ($51.22 × ₩1,400). 실매출 ₩107,900 대비 94.5% → 66.4%.
--      상품별 금액·건당$·별당원가는 전부 같은 0.704 배로 축소되고, 상품 간 순위·점유율은 불변.
--
-- 타임존: qa/out 디렉토리명은 UTC ISO, readings.created_at::date 도 UTC. 콘솔 기준일은 불명이라 둘 다 계산.
--   UTC 채택 근거 = 비하네스일 잔여의 일평균 절대오차가 UTC $0.26 vs KST $0.47 (UTC 가 2배 타이트).
--   콘솔이 KST 기준이면 KST 재버킷이 노이즈를 줄여야 하는데 오히려 늘어남 → 콘솔은 UTC 로 판단.
--   어느 쪽이든 결론은 동일(테스트 29.6% vs 32.0%)이라 손익 결론에 영향 없음.
--
-- 강건성 3종 (전부 UTC 기준):
--   1) 잔여 집중도 — 테스트 잔여 $21.57 의 104% 가 하네스 실행일 7일에 집중.
--      비하네스일 11일 잔여 합 −$0.83(일평균 절대오차 $0.26) → 유저 점수 모델이 일별로 잘 맞는다.
--   2) 독립 추정 대조 — 하네스 전사 점수 30.96 × 단가 = $25.12 vs 잔여 $21.57 (116% 설명).
--      하네스 모델이 16% 과대 → 테스트 실제분은 $21.6~25.1 구간. 하네스 캐시 재사용이 0.6 보다 높을 것.
--   3) clean 표본 확장 — 제외6 이 2건 이하인 날까지 넣어 7일로 늘려도 단가 0.8113 → 0.7871 (−3.0%),
--      실유저 70.4% → 68.3%. 표본이 3일뿐인 게 이 분석의 최대 약점이지만 결론은 안 흔들린다.
--   4) 캐시 히트율 0.3/0.6/0.9 → 실유저 70.5%/70.4%/70.1%. 같은 스코어러가 분자·분모에 다 쓰여 상쇄.
--
-- Haiku 모델 근거: prod haiku = next_reco 태깅(lib/reco.ts)이 사실상 전부.
--   ⚠️ 콘솔 Haiku 가 7/01~7/12 전부 $0.00 인데 그 기간 유저 리딩은 17~31건/일 →
--      민감 2차 판정(detectSensitiveAsync)은 prod 에서 사실상 안 돌고 있었다는 뜻(regex 매칭 때만 호출).
--      Haiku 첫 과금일 7/13 = next_reco 마이그레이션(20260713000000) 도입일과 정확히 일치 → 모델 검증됨.
--   롤링요약(summarizeOlder)은 24메시지 초과 스레드에서만 트리거 → 이 기간 prod/dev/하네스 전체 0건.
--   하네스 Haiku 는 모델(0.51)이 콘솔(1.13)의 45% 밖에 안 됨 — 7/22 게이트 전 위기 케이스의 per-turn
--   2차 판정 콜로 추정. 하네스 점수는 분리식에 안 들어가므로 결론에는 영향 없음.
--
-- 모델 한계: ① clean day 3일(콘솔 $12.41 = 총액의 17%)로 단가를 뽑았다 ② 유저 점수가 A4 와 같은
--   근사(1.6자/토큰, dynamicPart 미계상)를 쓴다 — 단, 분자·분모 양쪽에 같이 들어가 상쇄된다
--   ③ prod 스모크(제외 6명 계정 밖에서 돌린 것)는 유저분에 섞여 들어간다(규모 미상, 작을 것).

-- ############################################################################
-- 블록 2 — 누수 계량 (Task A5).  ⚠️ 운세 one-shot 배제 규약 (이 블록 전체 공통)
-- ############################################################################
-- 함정: 플랜 초안은 대화형 상담을 consultation_type in ('saju','tarot') 로 걸렀는데,
--   운세 리포트(one-shot)도 그 두 값을 쓴다. saju_product 는 NOT NULL DEFAULT 'today_letters'
--   라 판별에 못 쓴다. 운세의 진짜 마커는 emotion_tag 의 'fortune:' 센티넬
--   (lib/fortune/types.ts FORTUNE_SENTINEL_PREFIX).
-- 채택한 대화형(chat) 정의 = 아래 3조건 AND:
--     consultation_type in ('saju','tarot')
--     coalesce(emotion_tag,'') not like 'fortune:%'   -- ⚠️ coalesce 필수
--     relationship_id is null                        -- 인-스레드 스킬 reading 배제
-- ⚠️ coalesce 를 빼면 emotion_tag IS NULL 인 행에서 `NULL not like ...` = NULL 이라
--    조용히 탈락한다(사주 상담 다수가 NULL). 반드시 coalesce(...,'') 로 감쌀 것.
-- ✅ 검산: 이 정의가 A4 의 원가 배분 모수를 정확히 재현한다 → chat 492 / 운세 88.

-- ============ Q-diag. 리딩 모수 분해 (센티넬 정의 검증) ============
with ex as (select unnest(array['9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0']) c),
r as (select * from readings where left(user_id::text,8) not in (select c from ex))
select consultation_type, (emotion_tag like 'fortune:%') is_fortune,
       (relationship_id is not null) has_rel, (skill_key is not null) has_skill,
       count(*) n, sum(stars_spent) stars, min(created_at)::date d0, max(created_at)::date d1
from r group by 1,2,3,4 order by 5 desc;
-- 실측 (2026-07-25): tarot 대화형 441건 9,220별 · saju 운세 63건 500별 · saju 대화형 51건 1,020별
--   · tarot 운세 24건 280별 · relationship 스레드 15건 0별 · saju+운세+스킬 1건 40별
--   합 595건. → chat = 441+51 = 492건 10,240별 / 운세 = 63+24+1 = 88건 / 관계스레드 15건.
--   A4 의 "chat 492건 / report 88건" 과 정확히 일치 → 센티넬 정의 확정.
-- ⚠️ 모수 드리프트: 세션 시작 593건 → 595건(신규 유입) / users 526 → 533.
--   탈퇴 CASCADE 와 신규 유입이 동시에 움직여 재실행 시 숫자가 흔들린다(Q0 주의 재확인).

-- ============ Q10. prompt_version × 유저 턴 분포 (premium-depth 회수 검증) ============
with ex as (select unnest(array['9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0']) c),
r as (select * from readings where left(user_id::text,8) not in (select c from ex)
        and consultation_type in ('saju','tarot')
        and coalesce(emotion_tag,'') not like 'fortune:%'
        and relationship_id is null),
m as (select reading_id,
        count(*) filter (where role='user') user_turns,
        count(*) filter (where role='assistant') asst_turns
      from messages group by 1)
select coalesce(r.prompt_version,'(none)') pv, coalesce(m.user_turns,0) user_turns,
       count(*) readings,
       count(*) filter (where r.result_viewed_at is not null) viewed,
       sum(r.stars_spent) stars
from r left join m on m.reading_id = r.id
group by 1,2 order by 1,2;
-- ⚠️ 플랜 초안은 `join m` (inner) 이라 메시지 0건 리딩이 빠진다 → left join + coalesce 로 교체.
--    실측 결과 0턴 리딩은 0건이었다(모든 리딩이 최소 1 유저턴 보유) → 결론에 영향 없음.
-- 실측 (버전별 n / 1턴 / 1~2턴 / 결과열람):
--   pre-2026-07-12          58 / 7 (12.1%) / 14 (24.1%) / 19 (32.8%)
--   2026-07-12-persona-tuning 21 / 1 (4.8%) /  2 ( 9.5%) / 11 (52.4%)
--   2026-07-13-conversion-c3  96 / 7 (7.3%) / 16 (16.7%) / 44 (45.8%)
--   2026-07-17-persona-v3    209 / 12 (5.7%)/ 42 (20.1%) /117 (56.0%)
--   2026-07-22-card-noname     2 / 1        /  2         /  0
--   2026-07-22-premium-depth 106 / 9 (8.5%) / 28 (26.4%) / 68 (64.2%)
--   합                       492 / 37 (7.5%)/104 (21.1%) /259 (52.6%)
-- ❌ 판정: premium-depth 가 "턴 0~1 증발"을 줄이지 못했다.
--    1턴 8.5% (persona-v3 5.7% 대비 오히려 +2.8pt) · 1~2턴 26.4% (20.1% 대비 +6.3pt).
--    첫 풀이 2배 확대의 회수 근거로는 이 지표가 반증. 단 결과열람은 56.0% → 64.2% (+8.2pt) 로 개선.
--    → 첫 풀이 확대는 "이탈을 막는" 효과가 아니라 "끝까지 간 사람을 결과로 데려가는" 효과로 나타났다.
-- ⚠️ 1턴 리딩의 결과열람은 전 버전에서 예외 없이 0 — 1턴 = [END] 도달 불가 = 구조적 전손.
--    1턴 37건 700별 / 1~2턴 104건 2,020별(chat 별의 19.7%).
-- ⚠️ 교란: premium-depth 창은 7/22~7/25 (3.5일)뿐이고 같은 날 card-noname 태그가 병존한다.
--    baseline "1턴 17% · 1~2턴 27%" 은 과거 findings 의 다른 모수(운세 포함 추정) → 위 표는
--    동일 정의로 버전 간 비교한 값이라 baseline 과 직접 대조하지 말 것.

-- ============ Q11. 종료 유형 × 결과열람 (증발률) ============
-- ⚠️ 플랜 초안은 end_marker 를 먼저 검사해 "마무리 버튼"을 가린다 —
--    버튼 종료는 서버가 [END] 를 강제하므로(app/api/consultations/*/chat/route.ts) 전부 end_marker 로 흡수된다.
--    → 두 축을 교차표로 뽑아 어느 쪽도 안 가려지게 했다.
-- 버튼 문구는 코드의 정확한 유저 메시지: FINISH_PHRASE='대화 마무리할게'(하단 골드 버튼)
--    / FINISH_PHRASE_EXIT='오늘은 여기서 마무리할게'(출구 칩, 계측 구분용)
with ex as (select unnest(array['9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0']) c),
r as (select * from readings where left(user_id::text,8) not in (select c from ex)
        and consultation_type in ('saju','tarot')
        and coalesce(emotion_tag,'') not like 'fortune:%'
        and relationship_id is null),
last_a as (select m.reading_id, m.content from messages m
  join (select reading_id, max(created_at) t from messages where role='assistant' group by 1) x
    on x.reading_id=m.reading_id and x.t=m.created_at and m.role='assistant'),
u_last as (select m.reading_id, m.content from messages m
  join (select reading_id, max(created_at) t from messages where role='user' group by 1) x
    on x.reading_id=m.reading_id and x.t=m.created_at and m.role='user')
select coalesce(r.prompt_version,'(none)') pv,
       (la.content like '%[END]%') has_end,
       case when ul.content = '대화 마무리할게' then 'btn_finish'
            when ul.content = '오늘은 여기서 마무리할게' then 'exit_chip'
            when ul.content like '%마무리%' then 'other_wrapup'
            else 'no_close_signal' end close_sig,
       count(*) n,
       count(*) filter (where r.result_viewed_at is not null) viewed,
       sum(r.stars_spent) stars
from r left join last_a la on la.reading_id=r.id
       left join u_last ul on ul.reading_id=r.id
group by 1,2,3 order by 1,2,3;
-- ✅ 가장 깨끗한 신호: has_end=false 인 그룹의 viewed 가 전 버전 예외 없이 0.
--    → [END] 미도달 = 결과화면 100% 미도달. 증발의 정의로 [END] 부재를 써도 안전.
-- 실측 증발률(has_end=false) 버전별:
--   pre 20/58 34.5% · persona-tuning 9/21 42.9% · c3 39/96 40.6%
--   persona-v3 66/209 31.6% · card-noname 2/2 100% · premium-depth 31/106 29.2%
--   합 167/492 = 33.9%  (baseline 42% 대비 −8.1pt 개선, premium-depth 가 최저 29.2%)
-- 종료 325건의 트리거 구성: btn_finish 183 (56.3%) · 자연 [END] 102 (31.4%)
--   · other_wrapup 33 · exit_chip 7 (출구 칩은 사실상 미사용).
-- ⚠️ 2차 누수 발견: 정상 종료([END])했는데도 결과화면 미도달 66건.
--    종료 325건 중 20.3% — 버전별로 persona-v3 143→117(26건 손실), premium-depth 75→68(7건).
--    즉 결과 미도달 총계는 167(증발) + 66(종료후이탈) = 233건 = 전체 chat 의 47.4%.

-- ============ Q11b. 종료/열람 상태별 실볼륨 (증발 원가 정밀 산정) ============
-- 별 기준 점유율은 증발분을 과대평가한다(증발 리딩이 짧다) → 메시지수·assistant 글자수로 재계량.
with ex as (select unnest(array['9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0']) c),
r as (select * from readings where left(user_id::text,8) not in (select c from ex)
        and consultation_type in ('saju','tarot')
        and coalesce(emotion_tag,'') not like 'fortune:%' and relationship_id is null),
ended as (select distinct reading_id from messages where role='assistant' and content like '%[END]%'),
agg as (select reading_id, count(*) msgs, sum(length(content)) chars,
          sum(length(content)) filter (where role='assistant') a_chars from messages group by 1)
select (e.reading_id is not null) has_end, (r.result_viewed_at is not null) viewed,
       count(*) n, sum(r.stars_spent) stars,
       sum(coalesce(g.msgs,0)) msgs, sum(coalesce(g.a_chars,0)) asst_chars,
       round(avg(coalesce(g.a_chars,0))) avg_asst_chars
from r left join ended e on e.reading_id=r.id left join agg g on g.reading_id=r.id
group by 1,2 order by 1,2;
-- 실측: 증발(미종료·미열람)      167건 3,346별 1,220msg 331,841자 (건당 1,987자)
--       종료했으나 미열람         66건 1,350별   740msg 168,159자 (건당 2,548자)
--       정상(종료+열람)          259건 5,544별 2,968msg 789,769자 (건당 3,049자)
--       합                       492건 10,240별 4,928msg 1,289,769자
-- 점유율 3종 대조 (증발분): 별 32.7% / 메시지 24.8% / assistant 글자 25.7%
--   → 별 기준은 과대. 메시지·글자가 25% 로 수렴하므로 원가 배분은 25% 를 채택.
-- 💰 증발 소각 원가 = chat API 실유저 원가 ₩69,900 × 25% ≈ ₩17,500
--    결과 미도달 전체(233건) = 메시지 39.8% / 글자 38.8% → ₩69,900 × 39% ≈ ₩27,300
--    (chat 원가 ₩69,900 = 492건 × 건당 ₩142 = A4 건당 ₩202 × 실유저 배율 0.704)
-- 부수 관찰: 완주 대화가 증발 대화의 1.53배 분량(3,049 vs 1,987자)을 생산한다.

-- ============ Q12. 전환자 여정 패턴 (의도직행 vs 경험후) ============
-- 플랜 초안의 pre.n(모든 리딩)을 chat/운세로 쪼갰다 — 무료 운세만 본 뒤 결제한 층을 분리하기 위해.
with ex as (select unnest(array['9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0']) c),
p as (select user_id, min(created_at) first_pay, count(*) pays, sum(amount_won) won from payments
      where status='completed' and left(user_id::text,8) not in (select c from ex) group by 1),
d as (select p.user_id, p.first_pay, p.pays, p.won, u.created_at signup,
        extract(epoch from (p.first_pay - u.created_at))/60 min_to_pay,
        (select count(*) from readings r where r.user_id=p.user_id and r.created_at < p.first_pay) pre_any,
        (select count(*) from readings r where r.user_id=p.user_id and r.created_at < p.first_pay
           and r.consultation_type in ('saju','tarot') and coalesce(r.emotion_tag,'') not like 'fortune:%'
           and r.relationship_id is null) pre_chat,
        (select count(*) from readings r where r.user_id=p.user_id and r.created_at < p.first_pay
           and coalesce(r.emotion_tag,'') like 'fortune:%') pre_fortune
      from p join users u on u.id=p.user_id)
select case when pre_chat = 0 and pre_fortune = 0 then 'A.의도직행(리딩0)'
            when pre_chat = 0 then 'B.무료운세만후'
            else 'C.대화경험후' end pattern,
       count(*) payers, sum(pays) pays, sum(won) won,
       round(percentile_cont(0.5) within group (order by min_to_pay)::numeric,1) med_min,
       round(avg(pre_chat)::numeric,2) avg_pre_chat, round(avg(pre_fortune)::numeric,2) avg_pre_fortune
from d group by 1 order by 1;
-- 실측: A.의도직행(리딩0)  32명 34결제 ₩64,900  중앙 4.3분  pre_chat 0.00
--       B.무료운세만후      0명 — 이 경로는 존재하지 않는다
--       C.대화경험후       17명 18결제 ₩43,000  중앙 10.8분 pre_chat 1.00 (pre_fortune 0.06)
-- ✅ 검산: 49명 / 52결제 / ₩107,900 — 모수 일치.
-- 판정: 의도직행 32/49 = 65.3% — 기존 "결제자 65% 갭결제" 와 독립 재현.
--   가입→첫결제 중앙 4.3분 = 온보딩 중 페이월에 즉시 부딪혀 결제한다는 뜻.
-- ⚠️ 가장 날카로운 사실: C 그룹의 avg_pre_chat 이 정확히 1.00 —
--    "2건 이상 무료 경험 후 결제"한 유저가 단 한 명도 없다. 결제는 리딩 #1~#2 에서만 발생하고
--    그 창을 넘기면 영구 미전환. 체험 누적이 전환으로 이어지는 경로가 실측 0건.

-- ============ Q13. 소재(utm_content) × landing_variant 퍼널 ============
with ex as (select unnest(array['9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0']) c),
u as (select id, created_at from users where left(id::text,8) not in (select c from ex)),
p as (select user_id, count(*) pays, sum(amount_won) won from payments where status='completed' group by 1),
rc as (select user_id, count(*) chats from readings
       where consultation_type in ('saju','tarot') and coalesce(emotion_tag,'') not like 'fortune:%'
         and relationship_id is null group by 1),
rf as (select user_id, count(*) fort from readings where coalesce(emotion_tag,'') like 'fortune:%' group by 1)
select coalesce(a.utm_content,'(untracked)') creative,
       coalesce(a.landing_variant,'-') variant,
       count(*) signups,
       count(rc.user_id) chat_users, coalesce(sum(rc.chats),0) chats,
       count(rf.user_id) fort_users,
       count(p.user_id) payers, coalesce(sum(p.won),0) revenue,
       round(100.0*count(p.user_id)/count(*),1) cvr_pct
from u left join user_acquisition a on a.user_id = u.id
       left join p on p.user_id = u.id
       left join rc on rc.user_id = u.id
       left join rf on rf.user_id = u.id
group by 1,2 order by signups desc;
-- 실측 (가입 527 = 유저 533 − 제외 6):
--   love/love           150  chat 131명 150건  payers 20  ₩45,200  CVR 13.3%
--   tarot/tarot         142  chat 124명 137건  payers 14  ₩32,300  CVR  9.9%
--   새 판매 광고 - 사본/동일 98  chat  83명  90건  payers  7  ₩17,500  CVR  7.1%
--   (untracked)/-        63  chat  48명  55건  payers  4  ₩ 4,000  CVR  6.3%
--   daily/daily          47  chat  29명  37건  payers  3  ₩ 7,900  CVR  6.4%
--   새 판매 광고 - 사본/-  17  chat  13명  14건  payers  1  ₩ 1,000  CVR  5.9%
--   relationship/relationship 6 chat 5명 5건   payers  0  ₩     0  CVR  0.0%
--   counsel/counsel       2  chat   2명   2건  payers  0  ₩     0  CVR  0.0%
--   {{ad.name}}/love      1 · link_in_bio/-  1   (매크로 미치환 1건 = 계측 누출)
-- ⚠️ landing_variant 가 utm_content 를 그대로 미러링한다 → v 파라미터의 독립 검증력이 없다.
--    v=love 성과 = love 소재 행과 동일(CVR 13.3%, 최고).
--
-- 💰 CAC / ROAS 손계산 (Meta 실지출 7/8~7/25, 합 ₩175,142)
--    API 원가는 chat 건수 × ₩142 (A4 건당 ₩202 × 실유저 배율 0.704) 로 배분.
--  소재         지출     가입  CAC/가입  결제  CAC/결제자  매출     ROAS   API원가   기여    순손익
--  tarot        86,752   142    611      14     6,197     32,300  0.372   19,454   12,846  −73,906
--  love         55,985   150    373      20     2,799     45,200  0.807   21,300   23,900  −32,085
--  daily        25,805    47    549       3     8,602      7,900  0.306    5,254    2,646  −23,159
--  relationship  5,481     6    914       0        ∞           0  0.000      710     −710   −6,191
--  counsel       1,119     2    560       0        ∞           0  0.000      284     −284   −1,403
--  ─────────── 합 175,142   347   505      37     4,734     85,400  0.488   47,002   38,398 −136,744
-- ❌ 18일 광고 순손실 약 −₩136,700. 블렌디드 ROAS 0.49 (손익분기의 절반).
--    tarot 이 지출의 50%(₩86,752)를 먹고 ROAS 0.37 로 최악 — 단일 최대 누수.
--    love 는 ROAS 0.807 로 tarot 의 2.2배 · CAC/결제자 ₩2,799 (tarot ₩6,197 의 45%) = 유일한 승자 후보.
--    daily(무료 운세 소재)는 CVR 6.4% ROAS 0.31 — 무료 미끼가 결제로 안 이어진다.
-- ⚠️ "새 판매 광고 - 사본"(115가입 ₩18,500)은 위 지출 5종에 대응 항목이 없다(매크로 도입 전 레거시
--    소재로 추정). 지출 미귀속 슬라이스라 위 표에서 제외 — 실제 총 지출은 ₩175,142 보다 클 수 있다.
-- ⚠️ 탈퇴 CASCADE 로 가입·매출이 동시에 과소집계(Q16-w) → CAC 는 과대, ROAS 는 과소. 방향 상쇄.

-- ============ Q14. 업셀 · next_reco · 이어가기 ============
with ex as (select unnest(array['9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0']) c),
r as (select * from readings where left(user_id::text,8) not in (select c from ex)),
chat as (select * from r where consultation_type in ('saju','tarot')
           and coalesce(emotion_tag,'') not like 'fortune:%' and relationship_id is null),
ended as (select distinct m.reading_id from messages m where m.role='assistant' and m.content like '%[END]%')
select
 (select count(*) from chat) chat_readings,
 (select count(*) from chat c join ended e on e.reading_id=c.id) chat_ended,
 (select count(*) from chat where next_reco is not null) reco_filled,
 (select count(*) from chat c join ended e on e.reading_id=c.id where c.next_reco is not null) reco_filled_of_ended,
 (select count(*) from r where previous_reading_id is not null) continued,
 (select coalesce(sum(clarifier_count),0) from r) clarifier_sum,
 (select coalesce(sum(extra_turns),0) from r) extra_turns_sum,
 (select count(*) from star_transactions st where st.source='clarifier' and left(st.user_id::text,8) not in (select c from ex)) clarifier_tx,
 (select coalesce(sum(amount),0) from star_transactions st where st.source='clarifier' and left(st.user_id::text,8) not in (select c from ex)) clarifier_stars,
 (select count(*) from star_transactions st where st.source='extend' and left(st.user_id::text,8) not in (select c from ex)) extend_tx,
 (select coalesce(sum(amount),0) from star_transactions st where st.source='extend' and left(st.user_id::text,8) not in (select c from ex)) extend_stars,
 (select count(*) from star_transactions st where st.source='rel_extend' and left(st.user_id::text,8) not in (select c from ex)) rel_extend_tx;
-- 실측: chat 492 / 종료 325 / reco 채움 234 (전체 47.6%, 종료분 232/325 = 71.4%)
--       이어가기 12건 (baseline 1건 → 12건으로 살아남)
--       clarifier 11건 110별 · extend 6건 60별 (extra_turns 합 24 = 6회 × +4턴)
--       rel_extend 0건 ← 연애 스레드 "5별 +5턴 무제한 연장" 은 단 한 번도 안 팔렸다
-- 💰 업셀 실매출: clarifier 110별 + extend 60별 = 170별 ≈ 명목 ₩15,545 (별당 ₩91.44).
--    baseline(clarifier 0 · extend 1)에서 살아났지만 chat 별 10,240 의 1.7% 로 여전히 미미.

-- ============ Q14b. next_reco 소스 · 추천 상품 분포 ============
with ex as (select unnest(array['9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0']) c),
chat as (select * from readings where left(user_id::text,8) not in (select c from ex)
           and consultation_type in ('saju','tarot')
           and coalesce(emotion_tag,'') not like 'fortune:%' and relationship_id is null)
select next_reco->>'source' src, next_reco->>'product' product, count(*) n,
       count(*) filter (where result_viewed_at is not null) viewed
from chat where next_reco is not null group by 1,2 order by 3 desc;
-- 실측: haiku 221 (94.4%) vs marker 13 (5.6%) → 페르소나의 [RECO] 마커 경로는 사실상 죽어 있고
--       lib/reco.ts 의 haiku 태깅이 전량을 떠받친다.
--   haiku:tarot:relationship_5 153(viewed 136) · haiku:saju:good_days 28 · haiku:continue 25
--   marker:saju:good_days 8(viewed 2) · haiku:saju:choice 8 · haiku:saju:nature 7
--   marker:tarot:relationship_5 5(viewed 3)
--   → 추천의 65%가 tarot:relationship_5 한 상품에 쏠려 있다.

-- ============ Q14c. reco 후속 이행률 (C3 인챗 업셀 작동 여부) ============
with ex as (select unnest(array['9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0']) c),
chat as (select * from readings where left(user_id::text,8) not in (select c from ex)
           and consultation_type in ('saju','tarot')
           and coalesce(emotion_tag,'') not like 'fortune:%' and relationship_id is null),
w as (select c.id, c.user_id, c.created_at, c.next_reco->>'product' prod, c.next_reco->>'source' src,
        (select count(*) from readings r2 where r2.user_id=c.user_id and r2.created_at > c.created_at) after_any,
        (select count(*) from readings r2 where r2.user_id=c.user_id and r2.created_at > c.created_at
           and r2.stars_spent > 0) after_paid,
        (select count(*) from readings r2 where r2.user_id=c.user_id and r2.created_at > c.created_at
           and (r2.spread_type = replace(c.next_reco->>'product','tarot:','')
             or coalesce(r2.emotion_tag,'') = 'fortune:'||replace(c.next_reco->>'product','saju:','')
             or (c.next_reco->>'product'='continue' and r2.previous_reading_id = c.id))) after_match
      from chat c where c.next_reco is not null)
select prod, count(*) recos,
       count(*) filter (where after_any > 0) had_next_reading,
       count(*) filter (where after_paid > 0) had_next_paid,
       count(*) filter (where after_match > 0) took_the_reco
from w group by 1 order by 2 desc;
-- ❌ 실측 (reco / 후속리딩 / 후속유료 / 추천대로 이행):
--   tarot:relationship_5 158 / 42 / 27 / 1
--   saju:good_days        36 /  8 /  5 / 0
--   continue              25 /  7 /  5 / 2
--   saju:choice            8 /  2 /  1 / 0
--   saju:nature            7 /  2 /  2 / 0
--   합                   234 / 61 / 40 / 3
-- 판정: 추천 234건 → 추천대로 이행 3건 = 1.3%. 인챗/결과카드 업셀은 실측상 작동하지 않는다.
--   relationship_5 는 158회 추천되고 1회 이행(0.6%). 후속 유료 리딩 자체는 40건 있으나
--   추천과 무관한 상품으로 갔다 → 기존 "전환 75%가 관계스프레드 갭결제" 는 reco 경로가 아니라
--   진열/페이월 경로로 발생한 것. reco 엔진은 haiku 원가만 태우고 매출 기여 ≈ 0.
-- ✅ 검산: 상품별 합 158+36+25+8+7 = 234 = Q14 의 reco_filled = Q14b 의 src×product 합. 3중 일치.

-- ============ Q15a. emotion_tag 분포 ============
with ex as (select unnest(array['9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0']) c),
r as (select * from readings where left(user_id::text,8) not in (select c from ex))
select coalesce(emotion_tag,'(none)') tag,
       (coalesce(emotion_tag,'') like 'fortune:%') is_fortune,
       count(*) readings, count(distinct user_id) users, sum(stars_spent) stars,
       count(*) filter (where created_at >= '2026-07-20') since20,
       count(*) filter (where result_viewed_at is not null) viewed
from r group by 1,2 order by readings desc;
-- 실측 top: 그 사람 마음이 궁금해 233건 219명 5,506별 (since20 = 6 → W1 개편 전 레거시 태그)
--   걔 속마음이 궁금해 89 (since20 89 = 신규 태그로 교체됨) · 재회할 수 있을까 56
--   fortune:daily 45 (0별 무료, viewed 0) · 새로운 인연 20 · 요즘 내 흐름 18
--   (none) 15 = 관계 스레드 · 내 앞날 14 · 언제 연락 올까 14 · fortune:compat 13 · fortune:tarot_love 13 …
-- 연애 계열 합 ≈ 425/492 = 86.4% — 수요가 연애로 압도적으로 쏠려 있다(W1 연애 전면 배치의 사후 정당화).
-- ⚠️ 운세 리포트는 result_viewed_at 을 안 쓴다(viewed 전부 0) → 열람 지표는 chat 에만 유효.
-- ⚠️ 태그 리네임(7/20) 때문에 태그별 시계열은 since20 컬럼으로 끊어 읽어야 한다.

-- ============ Q15b. 제품 교차 이용 × 결제 ============
-- ⚠️ 플랜 초안은 has_fortune 을 `bool_or(saju_product is not null)` 로 잡았는데
--    saju_product 는 NOT NULL DEFAULT 라 항상 true → 무의미. 센티넬로 교체했다.
with ex as (select unnest(array['9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0']) c),
r as (select * from readings where left(user_id::text,8) not in (select c from ex)),
u as (select user_id,
        bool_or(consultation_type in ('saju','tarot') and coalesce(emotion_tag,'') not like 'fortune:%'
                and relationship_id is null) has_chat,
        bool_or(consultation_type='relationship') has_rel,
        bool_or(coalesce(emotion_tag,'') like 'fortune:%') has_fortune
      from r group by 1),
p as (select user_id, sum(amount_won) won from payments where status='completed' group by 1)
select has_chat, has_rel, has_fortune, count(*) users,
       count(p.user_id) payers, coalesce(sum(p.won),0) revenue
from u left join p on p.user_id=u.user_id group by 1,2,3 order by 4 desc;
-- 실측 (유저 / 결제자 / 매출 / CVR / ARPU):
--   chat 단독            379 / 34 / ₩55,600 /  9.0% / ₩147
--   chat+운세             46 /  9 / ₩33,200 / 19.6% / ₩722   ← 최고 가치 세그먼트
--   운세 단독             28 /  1 / ₩ 2,800 /  3.6% / ₩100
--   chat+관계             11 /  3 / ₩ 9,700 / 27.3% / ₩882   ← CVR 최고
--   관계 단독              2 /  0 / ₩     0
--   관계+운세              1 /  1 / ₩ 5,600
--   3종 전부               1 /  1 / ₩ 1,000
-- ✅ 검산: 리딩 보유 유저 468 · 결제자 49 · 매출 ₩107,900 일치.
--    가입 527 − 468 = 59명(11.2%)은 리딩 0건 = 가입만 하고 아무것도 안 했다.
-- 판정: 2제품 이상 접촉 유저의 ARPU 가 단일제품의 4.9~6.0배(₩722·₩882 vs ₩147).
--   표본이 작지만(46·11명) 방향이 일관 → 교차판매가 유일하게 실측된 ARPU 레버.
--   반대로 "운세 단독" 28명은 CVR 3.6% — 무료 운세만 소비하는 층은 현금화되지 않는다.

-- ============ Q15c. 관계(우리 사이) 15건 흐름 — 정지 지점 ============
-- ⚠️ 플랜 초안에 제외 필터가 없었다 → is_excluded 컬럼으로 표시해 분리(관리자 b9e5dd5a 1건 포함 총 16행).
with ex as (select unnest(array['9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0']) c)
select left(rl.user_id::text,8) u,
       left(rl.user_id::text,8) in (select c from ex) is_excluded,
       rl.status, rl.created_at::date reg_d, rl.last_visited_at::date last_d,
       rl.summarized_msg_count sumc, (rl.partner_profile_id is not null) has_partner,
       (select count(*) from messages m where m.reading_id=rl.thread_reading_id) msgs,
       (select count(*) from messages m where m.reading_id=rl.thread_reading_id and m.role='user') user_msgs,
       (select count(*) from relationship_passes rp where rp.relationship_id=rl.id) passes,
       (select coalesce(sum(rp.stars_spent),0) from relationship_passes rp where rp.relationship_id=rl.id) pass_stars,
       (select count(*) from readings r2 where r2.relationship_id=rl.id and r2.skill_key is not null) skill_readings,
       (select coalesce(sum(amount_won),0) from payments py where py.user_id=rl.user_id and py.status='completed') paid_won
from relationships rl order by rl.created_at;
-- ❌❌ 실측 16행(관리자 1 제외 → 실유저 15건). 정지 지점이 한 곳에 100% 몰려 있다:
--   · 15건 전부 has_partner=true  → 상대 생년월일 입력(온보딩 최대 마찰)까지는 완주
--   · 14건(93.3%)이 msgs=0 & last_visited_at=NULL → 스레드에서 단 한 마디도 안 했다
--   · 1건(a4bb198c, 7/22)만 패스 구매(30별) → 6메시지(유저 3) + 스킬 1회 + 재방문 1회
-- 판정: "대화는 했지만 패스 미구매"가 아니라 **"등록 직후 첫 발화 전에 전멸"**.
--   원인 확정(코드): app/api/relationship/chat/route.ts:144-146 —
--     const pass = await getActivePass(rel.id); if (!pass && !inDialogueSkill) → 402 'pass_required'
--   즉 무료 체험 턴이 0이다. 유저는 상대 생일까지 입력하고 나서 첫 마디를 하기도 전에
--   30별(최소 1일권) 페이월을 만난다 → 상품이 사실상 미출시 상태.
-- 💰 규모: 실현 패스 매출 30별 1건(명목 ₩2,743). 14건이 최소권만 사도 420별 ≈ 명목 ₩38,400.
-- ⚠️ 이 14명은 "돈 없는 유저"가 아니다 — 5명이 이미 현금 결제자
--    (₩5,900 · ₩5,600 · ₩2,800 · ₩1,000 · ₩1,000 = 합 ₩16,300). 지불 의사가 아니라 순서 문제.
-- status 분포: onesided 8 · breakup 6 · crush 1 (관리자 crush 1 별도) — 짝사랑/이별에 쏠림.

-- ============ Q16-w. 탈퇴 44건의 소재 복구 가능성 ============
select
 (select json_agg(column_name order by ordinal_position) from information_schema.columns
   where table_name='account_withdrawals') aw_cols,
 (select count(*) from account_withdrawals) aw_n,
 (select count(*) from user_acquisition a where not exists (select 1 from users u where u.id=a.user_id)) orphan_acq,
 (select count(*) from users) users_now,
 (select count(*) from user_acquisition) acq_now;
-- 실측: account_withdrawals 컬럼 = [id, kakao_id_hash, withdrawn_at] — utm/소재 필드 없음.
--       aw_n=44 · orphan_acq=0 · users_now=533 · acq_now=464 (미추적 69명)
-- ❌ 판정: 탈퇴 44건의 소재 귀속은 **영구 복구 불가**. 근거 2가지 —
--   (1) account_withdrawals 는 kakao_id_hash 만 남긴다(소재·utm 미보존, 유저 PK 와도 연결 불가)
--   (2) user_acquisition orphan 0 = users DELETE CASCADE 로 유입기록이 잔여 없이 전삭제
-- 함의: Q13 의 소재별 가입수는 탈퇴분(44/577 = 7.6%)만큼 과소집계 → CAC/가입 은 약 8% 과대.
--   동시에 탈퇴자 결제도 소멸해 매출도 과소 → ROAS 는 과소. 두 왜곡이 반대 방향으로 상쇄되나
--   소재별로 탈퇴율이 다르면 소재 간 순위까지 흔들릴 수 있고, 그걸 검증할 방법이 없다.
--   유일한 총량 복구 경로 = 토스 정산 총액 대조(그 차액 = 소멸 매출). 소재 분해는 불가.
-- 🔧 향후: account_withdrawals 에 탈퇴 시점 utm_content/landing_variant 스냅샷 1컬럼을 남기면
--   (개인정보 아님) 이 맹점이 사라진다. 지금은 매일 소재별 가입 스냅샷을 외부에 적재하는 수밖에 없다.

-- ############################################################################
-- 블록 3 — 가성비 (별당 분량) (Task A6)
-- ############################################################################

-- ============ Q16. 타로 유료 리딩 첫 풀이 길이 · 별당 글자수 ============
-- 모수: 대화형 타로 유료분만 (운세 센티넬 배제 + relationship_id is null — A5 블록 규약과 동일).
-- 평균은 소표본에서 튀므로 중앙값·min·max 를 같이 뽑아 "한 건도 목표에 못 닿았는지"를 볼 수 있게 했다.
with ex as (select unnest(array['9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0']) c),
r as (select * from readings where left(user_id::text,8) not in (select c from ex)
        and consultation_type='tarot' and stars_spent > 0
        and coalesce(emotion_tag,'') not like 'fortune:%' and relationship_id is null),
first_a as (select m.reading_id, length(m.content) chars from messages m
  join (select reading_id, min(created_at) t from messages where role='assistant' group by 1) x
    on x.reading_id=m.reading_id and x.t=m.created_at and m.role='assistant'),
tot as (select reading_id, sum(length(content)) all_chars from messages where role='assistant' group by 1)
select r.spread_type, coalesce(r.prompt_version,'(none)') pv, count(*) n, r.stars_spent stars,
       round(avg(fa.chars)) avg_first,
       round(percentile_cont(0.5) within group (order by fa.chars)::numeric) med_first,
       min(fa.chars) min_first, max(fa.chars) max_first,
       round(avg(t.all_chars)) avg_total,
       round(avg(fa.chars)/nullif(r.stars_spent,0)) first_per_star,
       round(avg(t.all_chars)/nullif(r.stars_spent,0)) total_per_star
from r join first_a fa on fa.reading_id=r.id join tot t on t.reading_id=r.id
group by r.spread_type, coalesce(r.prompt_version,'(none)'), r.stars_spent
order by r.spread_type, pv;
--
-- ❌ 검산 1 — premium-depth(2026-07-22) 코호트 vs 스펙 목표 (med_first 기준)
--  스프레드         n  별  med_first  avg  max  목표   허용범위      판정
--  three_card       3  25    1,355  1,327 1,357 1,500 1,300~1,700  ✅ 범위 내(하단)
--  deep_feelings_5  1  40    1,474  1,474 1,474 2,525 2,300~2,750  ❌ 목표의 58%
--  readiness_6      1  45    1,321  1,321 1,321 2,900 2,700~3,200  ❌ 목표의 46%
--  potential_7      3  55    2,334  2,208 2,456 3,550 3,300~3,800  ❌ 목표의 66%
--  reunion_deep_7   3  55    1,962  2,119 2,464 3,550 3,300~3,800  ❌ 목표의 55%
--  one_card        23  10      789    835 1,077  (확대 대상 아님)  persona-v3 577 → +37%
--  two_card        70  15    1,022  1,045 1,346  (확대 대상 아님)  persona-v3 921 → +11%
--
-- 🔴 판정: **premium-depth 부분 미작동**. 확대 대상이던 5·6·7장 프리미엄 4종이 전부 범위 밖이고,
--    프리미엄 8건(deep_feelings_5 1 + readiness_6 1 + potential_7 3 + reunion_deep_7 3) 중
--    **허용범위 하단에 닿은 건이 0건**이다. 최댓값 2,464자(reunion_deep_7)조차 자기 하한 3,300 미달.
--    소표본(n=1~3)이지만 min/max 가 전부 하한 아래라 "표본운"으로 설명되지 않는다.
--    반대로 확대 대상이 아니던 원/투카드는 +37%/+11% 증가 → 지시가 저가 상품에만 먹었다.
--    쓰리카드만 유일하게 의도대로 작동(persona-v3 1,020 → 1,355 med, +33%).
-- ⚠️ relationship_5 는 premium-depth 표본이 0건 — 7/22 이후 한 건도 안 팔렸다.
--    Q14b 에서 158회 추천된 최다 추천 상품인데(Q14c 이행 1건) 개편 효과를 측정할 데이터조차 없다.
--
-- 📊 검산 2 — 유저 체감 가성비(별당 글자) vs 우리 원가(별당 원가) 4분면
--   별당 글자 = 전 버전 가중평균 total_per_star (assistant 전체 글자 ÷ 별). one_card 는 6별 이상치 1건 제외.
--   별당 원가 = A4 실측 별당원가(캐시 0.6) × 실유저 배율 0.704.
--   컷선: 별당글자 130자 / 별당원가 ₩7.0
--
--  스프레드         별  별당글자  별당원가   분면
--  one_card         10    186.5   ₩10.70   A (유저 후함 · 우리 비쌈)
--  two_card         15    175.3   ₩ 9.15   A
--  deep_feelings_5  40    159.7   ₩ 8.66   A
--  readiness_6      45    114.0   ₩ 6.55   C (유저 박함 · 우리 쌈)
--  three_card       25    108.2   ₩ 6.20   C
--  reunion_deep_7   55    101.8   ₩ 4.51   C
--  reunion_5        40    100.4   (미산출)  C
--  relationship_5   40     87.6   ₩ 5.07   C
--  potential_7      55     84.1   ₩ 3.31   C
--
--  B (유저 후함 · 우리 쌈) = **공집합**   /   D (유저 박함 · 우리 비쌈) = **공집합**
-- 🔵 해석: 9개 상품이 A–C 대각선에 일렬로 놓인다. 두 지표가 같은 분자(생산 글자수)를 공유하니
--    구조적으로 상관될 수밖에 없지만, 그 대각선의 기울기가 곧 **가격 정책의 실패**다.
--    유저는 55별 potential_7 에서 별당 84자를, 10별 one_card 에서 별당 187자를 받는다 —
--    **비싼 상품을 살수록 별당 체감이 2.2배 나빠진다**(정상적인 볼륨 디스카운트의 역방향).
--    우리 마진은 정확히 그 반대로 프리미엄에서 최고다(₩3.31 vs ₩10.70 = 3.2배 유리).
--    즉 프리미엄 티어 = 우리 고마진 · 유저 저체감. premium-depth 가 고치려던 바로 그 격차이고,
--    위 검산 1 이 그 수정이 프리미엄 구간에서 안 먹었음을 보여준다 → 격차는 그대로 남아 있다.
-- ⚠️ 이것이 프리미엄 재구매가 안 붙는 유력 원인(재구매율 6.1% · 3회+ 0명)의 후보 설명.
--    다만 인과는 미확인 — 정독(A7)이나 환불/이탈 코멘트로 교차검증이 필요하다.
-- ⚠️ 별당 글자수는 "체감 가치"의 대리지표일 뿐이다. 프리미엄은 카드 수가 많아 정보 밀도·구조가
--    다르므로 글자수만으로 가치를 단정하면 안 된다(길다≠좋다). 그래도 2.2배 역전은 설명이 필요한 크기다.
