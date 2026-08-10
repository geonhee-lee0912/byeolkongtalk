-- 상품별 토큰 원료 집계 — 리딩별 (assistant 턴 · output chars · full-history input 누적 chars) + 별 소모.
-- 로컬에서 apiCost.scoreReading 재현: in_tok=(systemChars×asst_turns×sysMult + in_ctx_chars)/1.6, out_tok=out_chars/1.6.
-- 어드민 6명 제외. windowed(연애)는 in_ctx 를 full 로 근사(리딩 소량이라 영향 작음, 주석 표시).
with ex as (select unnest(array[
  '9ff43266','b9e5dd5a','7f83a4d7','a3bcc2c7','3d648ebe','d8fdcdd0'
]) p),
labeled as (
  select r.id, coalesce(r.stars_spent,0) stars_spent, r.consultation_type,
    case
      when coalesce(r.emotion_tag,'') like 'fortune:%' then 'fortune:' || substring(r.emotion_tag from 9)
      when r.relationship_id is not null or r.skill_key is not null then
        case when r.skill_key is not null then 'rel_skill:'||r.skill_key else 'rel_thread' end
      when r.consultation_type='saju' then 'saju_chat'
      when r.consultation_type='tarot' then 'tarot:'||coalesce(r.spread_type,'(none)')
      else 'other:'||coalesce(r.consultation_type,'?')
    end as product,
    (r.relationship_id is not null or r.skill_key is not null) as windowed
  from readings r
  where left(r.user_id::text,8) not in (select p from ex)
),
msg as (
  select m.reading_id, m.role, length(m.content) chars,
    sum(length(m.content)) over (partition by m.reading_id order by m.created_at
      rows between unbounded preceding and 1 preceding) as ctx_before
  from messages m
),
pr as (
  select l.product, l.windowed, l.id, l.stars_spent,
    count(*) filter (where msg.role='assistant') asst_turns,
    coalesce(sum(msg.chars) filter (where msg.role='assistant'),0) out_chars,
    coalesce(sum(coalesce(msg.ctx_before,0)) filter (where msg.role='assistant'),0) in_ctx_chars
  from labeled l left join msg on msg.reading_id=l.id
  group by l.product, l.windowed, l.id, l.stars_spent
)
select product, windowed, count(*) readings,
  sum(asst_turns) tot_asst_turns,
  round(avg(asst_turns),2) avg_turns,
  sum(out_chars) tot_out_chars,
  sum(in_ctx_chars) tot_in_ctx_chars,
  sum(stars_spent) tot_stars,
  round(avg(out_chars)) avg_out,
  round(avg(in_ctx_chars)) avg_in_ctx
from pr group by product, windowed order by readings desc;
