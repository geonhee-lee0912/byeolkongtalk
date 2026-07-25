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
