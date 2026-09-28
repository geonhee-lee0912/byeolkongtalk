-- admin_layer2_readings — 종목별 리딩 · 완료율 · 결과 열람 · 평균 유저 턴.
-- 플랜: docs/superpowers/plans/2026-09-21-어드민-플랜B-3층-대시보드.md § Task 12
--
-- 🔴 파일 번호가 플랜(20260921023000)과 다르다 — 그 번호는 Task 10 후속
--    (admin_subscriber_net_fresh_only)이 먼저 가져갔다. 023000 과 Task 13 예정분(024000)
--    사이인 023500 을 써서 적용 순서를 유지한다.
--    (이미 적용된 마이그레이션 파일은 편집하지 않는다 — 재실행이 안 되므로 dev 에는 영영 안
--     들어가고 prod 에만 들어가 스키마가 갈린다. 고칠 게 있으면 새 파일 + CREATE OR REPLACE.)
--
-- ⚠️ "완료"는 별콩이 발화에 [END] 마커가 있는 것이다(messages.content). turn_close 컬럼이
--    아니다 — 그건 발화가 어떤 상태에서 생성됐는지를 남기는 **추가** 계측이고, 종료 판정의
--    정본은 여전히 [END] 다(3층 roadmap KPI 와 같은 정의).
-- ⚠️ LIKE '%[END]%' 의 대괄호는 Postgres LIKE 에서 특별한 뜻이 없다(SIMILAR TO·정규식과 다르다).
--    `_` 와 `%` 만 와일드카드이고 여기엔 없다.
--
-- 🔴 종목을 **대화 / one-shot 리포트**로 쪼갠다(is_report). 안 쪼개면 사주 완료율이 6배 과소로
--    나온다 — `/fortune` 리포트도 readings 에 consultation_type 'saju'|'tarot' 로 저장되는데
--    (app/api/fortune/create/route.ts, base 가 그 두 값뿐이다 — lib/fortune/types.ts), 대화가
--    없어 [END] 가 **구조적으로** 안 찍히기 때문이다. note 로 "섞여 있다"고 적는 걸로는 부족하다:
--    경고문은 운영자가 읽는 **틀린 숫자 자체**를 고치지 못한다.
--    2026-09-27 prod 전 기간 — saju 325건 = 리포트 272 + 대화 53. 쪼개기 전 완료율 9.2% →
--    쪼갠 뒤 대화 행 **56.6%**. tarot 2,385 = 리포트 25 + 대화 2,360 (69.9% → 70.6%, 미미하다).
--    리포트 297건은 전부 ended=0 · viewed=0 · **user_turns 최댓값이 0** 이다(구조가 데이터로 확인된다).
--
-- 🔴 분리 키는 `emotion_tag LIKE 'fortune:%'`.
--    ⚠️ AGENTS.md 가 경고하는 `LIKE 'fortune_%'` 함정과는 **다른 케이스**다 — 거기서 문제는
--       `_` 가 LIKE 와일드카드라는 것인데 `fortune:` 에는 `_` 가 없다.
--    ⚠️ `left(emotion_tag, 8) = 'fortune:'` 로 쓰지 않는다 — 리터럴과 길이를 **따로 동기화**해야
--       해서, prefix 가 길어지는 날 `left(x,8) = 'fortune_v2:'` 가 **영원히 false** 가 되고
--       사주 완료율이 9.2% 버그로 조용히 회귀한다. LIKE 엔 없는 실패 모드다.
--    ⚠️ **NULL 3값 논리** — emotion_tag 는 nullable 이고(2026-09-27 prod 2,885건 중 175건이
--       NULL), `NULL LIKE 'fortune:%'` 는 false 가 아니라 **NULL** 이다. COALESCE 를 빼면
--       GROUP BY 가 NULL 그룹을 따로 만들어 정체불명의 행이 하나 더 생긴다(SUM(cnt) 불변식은
--       그래도 성립하므로 **불변식이 이 결함을 못 잡는다**). 반드시 COALESCE(..., false).
--
-- 🔴 왜 여기는 prefix 인데 `/admin/paywall` 은 화이트리스트인가 — 두 화면이 다른 문제를 푼다.
--    paywall(`app/admin/paywall/page.tsx:96`)은 **분류기가 둘**이다: 앱의 `fortuneTypeFromTag`
--    와 SQL 이 같은 태그를 각자 분류하므로, SQL 이 맨 prefix 를 쓰면 `fortune:오타` 를 앱은
--    상담으로 SQL 은 운세로 분류해 **같은 화면의 두 숫자가 조용히 어긋난다.** 그래서
--    `p_fortune_types: Object.keys(FORTUNE_CONFIG)` 로 단일 원천을 강제한다.
--    여기는 분류기가 **이 RPC 하나**뿐이다 — `readingRowView` 는 내려받은 boolean 을 쓸 뿐
--    `emotion_tag` 를 다시 해석하지 않으므로 어긋날 상대가 없다. 반대로 화이트리스트는 **비용이
--    있다**: 이 표는 창 안의 모든 리딩을 세는 **역사 census** 라, 상품이 sunset 돼 키가
--    FORTUNE_CONFIG 에서 빠지면 그 순간 **과거 행들이 소급해서** 사주(대화)로 재분류되고
--    완료율 0 이 섞여 들어온다 — 오래된 데이터일수록 더 틀린다. 키 리네임에 둔감한 prefix 가
--    역사 데이터에는 맞다. (2026-09-27 기준으로는 prod 의 fortune 키 16종이 전부
--     FORTUNE_CONFIG 26종 안에 있어 두 방식의 결과가 같다 — 잠재 위험이지 현재 버그가 아니다.)
--
-- 🔴 avg_user_turns 는 COALESCE(m.user_turns, 0) 이다 — **메시지가 한 건도 없는 리딩도 0턴으로
--    분모에 넣는다.** 플랜 원안 `ROUND(AVG(m.user_turns), 2)` 는 LEFT JOIN 이 만든 NULL 을
--    AVG 가 **행째로 무시**해서, "한 마디도 못 하고 죽은 리딩"이 평균에서 빠져 평균이 과대해진다.
--    2026-09-27 prod 전 기간 실측 — relationship 3.05(원안) → 2.21(현행), 155건 중 **43건**이
--    메시지 0건이었다(원안이 +38% 과대). tarot 은 2,385건 중 1건뿐이라 4.13 → 4.13 로 무변.
--    즉 이 칸의 정의는 "발화한 사람의 평균"이 아니라 **리딩당 평균**이다.
--
-- ⚠️ 완료율·결과 열람이 **구조적으로 불가능한 행**(연애 스레드 · 리포트)은 0% 가 아니라 "—"로
--    찍는다. 그 판정은 SQL 이 아니라 `lib/admin/product-map.ts` 의 `readingRowView` 가 한다 —
--    근거가 데이터가 아니라 **페르소나 파일과 라우트 존재 여부**에 있고, 1비트 데이터 신호
--    (`bool_or([END])`)로 판정하면 페르소나가 한 번 삐끗할 때 뜻이 통째로 뒤집히기 때문이다.
--    이 함수는 센 값을 그대로 돌려주고, 숨길지 말지는 그쪽이 정한다(유닛으로 잠겨 있다).
--
-- 🔴 불변식: 같은 (p_since, p_until, p_exclude) 에서 SUM(cnt) == admin_layer1_flow.readings.
--    두 함수의 readings 필터가 글자 단위로 같아서 성립한다 — 어긋나면 1층과 2층이 서로 다른
--    모수를 말하는 것이고, 이 화면의 존재 이유가 무너진다. 쪼개기는 **행을 나눌 뿐 모수를
--    바꾸지 않으므로** 합은 그대로다.
--    2026-09-27 prod 인라인 대조: 7일 창 246 == 246 · 30일 창(상위 3명 제외) 956 == 956 ·
--    쪼갠 뒤 재확인 7일 246 == 246 · 전 기간 2,885 == 2,885.
--
-- 성능(2026-09-27 prod EXPLAIN ANALYZE): 7일 창 **10.9ms**(messages 를 idx_messages_reading
--    으로 인덱스 스캔) · 전 기간 **95ms**(messages seq scan 21,338행, 2,016 buffer 전부 shared
--    hit). `LIKE '%[END]%'` 는 선행 와일드카드라 인덱스를 못 타지만, 이미 reading_id 로 좁혀
--    가져온 행에만 걸리는 **필터**라 스캔 비용이 아니다. 라우트의 창 상한이 365일이고 데이터가
--    2026-07 시작이라 전 기간이 곧 최악의 경우다.
--    대화/리포트 쪼개기 **후** 재측정: 7일 11.0ms · 전 기간 100.0ms — 실행 계획 모양이 같고
--    (GROUP BY 에 열 하나 추가) 전 기간에서 +5% 다. 유의미한 비용이 아니다.
CREATE OR REPLACE FUNCTION admin_layer2_readings(
  p_since TIMESTAMPTZ,
  p_until TIMESTAMPTZ,
  p_exclude UUID[]
)
RETURNS TABLE (
  consultation_type TEXT,
  is_report BOOLEAN,
  cnt BIGINT,
  paid_cnt BIGINT,
  ended_cnt BIGINT,
  viewed_cnt BIGINT,
  avg_user_turns NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH win AS (
    SELECT r.id,
           r.consultation_type,
           COALESCE(r.emotion_tag LIKE 'fortune:%', false) AS is_report,  -- NULL → false
           r.stars_spent,
           r.result_viewed_at
    FROM readings r
    WHERE r.created_at >= p_since
      AND (p_until IS NULL OR r.created_at < p_until)
      AND r.user_id <> ALL(p_exclude)   -- readings.user_id 는 NOT NULL 이라 3값 논리 함정이 없다
  ), msg AS (
    SELECT m.reading_id,
           COUNT(*) FILTER (WHERE m.role = 'user') AS user_turns,
           bool_or(m.role = 'assistant' AND m.content LIKE '%[END]%') AS ended
    FROM messages m
    JOIN win ON win.id = m.reading_id
    GROUP BY 1
  )
  -- COALESCE 는 오늘 기준 **도달 불가**다(readings.consultation_type 은 NOT NULL). '(없음)' 행을
  -- 찾아 헤매지 말 것 — 컬럼이 nullable 로 바뀌는 날을 대비한 방어로만 남긴다.
  SELECT COALESCE(w.consultation_type, '(없음)')::TEXT,
         w.is_report,
         COUNT(*)::BIGINT,
         COUNT(*) FILTER (WHERE w.stars_spent > 0)::BIGINT,
         COUNT(*) FILTER (WHERE COALESCE(m.ended, false))::BIGINT,
         COUNT(w.result_viewed_at)::BIGINT,
         ROUND(AVG(COALESCE(m.user_turns, 0)), 2)
  FROM win w
  LEFT JOIN msg m ON m.reading_id = w.id
  GROUP BY 1, 2
  -- 출력 서수(ORDER BY 3)가 아니라 식으로 쓴다 — 열이 하나 늘 때마다 서수가 밀려 조용히 다른
  -- 열로 정렬되는 걸 막는다(is_report 를 끼워 넣으며 실제로 밀렸다).
  -- 🔴 타이브레이커 필수 — LIMIT 가 없어 행 유실은 없지만, 동수 그룹(하위 행이 25 vs 20 으로
  --    가깝다)의 표시 순서가 새로고침마다 뒤집혀 "표가 흔들린다". 공짜로 닫는다.
  ORDER BY COUNT(*) DESC, 1, 2;
$$;

REVOKE ALL ON FUNCTION admin_layer2_readings(TIMESTAMPTZ, TIMESTAMPTZ, UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_layer2_readings(TIMESTAMPTZ, TIMESTAMPTZ, UUID[]) TO service_role;
