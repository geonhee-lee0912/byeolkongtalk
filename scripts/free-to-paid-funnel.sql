-- 무료별 → 결제 전환 인과. 어드민 6명 제외.
-- Q: 결제자는 결제 전 몇 판 무료로 했나 / 미결제자 중 무료 리딩 많이 한 규모 / 소모 별 분포.
with ex as (select unnest(array[
  '9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0'
]) p),
fp as (
  select user_id, min(created_at) t
  from payments where status='completed' and left(user_id::text,8) not in (select p from ex)
  group by 1
),
-- 결제자: 첫 결제 전 리딩 수(무료로 경험한 판)
payer_pre as (
  select fp.user_id, count(r.id) pre
  from fp left join readings r on r.user_id=fp.user_id and r.created_at < fp.t
  group by 1
),
-- 미결제자: 총 리딩 수
np as (
  select u.id, (select count(*) from readings r where r.user_id=u.id) rc
  from users u
  where left(u.id::text,8) not in (select p from ex) and u.id not in (select user_id from fp)
),
bk(k, lo, hi) as (values ('0',0,0),('1',1,1),('2',2,2),('3',3,3),('4-5',4,5),('6-10',6,10),('11+',11,100000)),
payer_bucket as (
  select bk.k, count(pp.user_id) users
  from bk left join payer_pre pp on pp.pre between bk.lo and bk.hi
  group by bk.k
),
np_bucket as (
  select bk.k, count(np.id) users
  from bk left join np on np.rc between bk.lo and bk.hi
  group by bk.k
),
-- 유저별 총 소모 별 (웰컴 20 대비)
usage as (
  select u.id,
    (select coalesce(sum(amount),0) from star_transactions st where st.user_id=u.id and st.type='spend') spent,
    (fp.user_id is not null) paid
  from users u left join fp on fp.user_id=u.id
  where left(u.id::text,8) not in (select p from ex)
),
spend_dist as (
  select paid, count(*) users, round(avg(spent),1) avg_spent,
    count(*) filter (where spent=0) s_zero,
    count(*) filter (where spent between 1 and 20) s_1_20,
    count(*) filter (where spent between 21 and 50) s_21_50,
    count(*) filter (where spent > 50) s_gt50
  from usage group by paid
)
select 'payer_pre_readings' metric, to_jsonb(array_agg(x order by x.k)) v from payer_bucket x
union all select 'nonpayer_readings', to_jsonb(array_agg(x order by x.k)) from np_bucket x
union all select 'spend_by_paid', to_jsonb(array_agg(x)) from spend_dist x
union all select 'totals', to_jsonb(array_agg(x)) from (
  select (select count(*) from fp) payers,
         (select count(*) from np) nonpayers,
         (select round(avg(pre),2) from payer_pre) avg_pre_readings_payers
) x;
