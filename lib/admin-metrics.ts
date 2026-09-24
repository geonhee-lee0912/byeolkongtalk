// lib/admin-metrics.ts — 어드민 지표의 정본 정의 레지스트리.
//
// 🔴 왜 이 파일이 있나 — 2026-09-20 실측에서 **같은 지표에 정의가 둘씩** 있는 게 확인됐다.
//    오가닉 비율은 재는 방법에 따라 0.0% 와 8.8% 가 나왔고, 결과 열람은 리딩 기준 50.7% 와
//    코호트 기준 65% 가 공존했다. 화면마다 제각각 계산하면 같은 이름이 다른 뜻이 된다.
//    그래서 **정본을 하나 골라 여기 못박고**, 화면은 여기서만 가져다 쓴다.
//
// ⚠️ 이 파일은 **순수해야 한다** — DB·env·React 를 import 하지 않는다. 값이 아니라 *정의*를 담는
//    곳이고, 계약 테스트가 그걸 지킨다. 실제 숫자는 각 지표의 `source` 가 가리키는 RPC 가 낸다.

export type MetricUnit = "won" | "percent" | "count" | "ratio";

export interface MetricDef {
  /** 맵의 키와 같아야 한다(계약 테스트가 강제). */
  key: string;
  /** 화면에 뜨는 한글 라벨. */
  label: string;
  /** 정본 산식 한 줄. 사람이 읽고 "내가 생각한 그거"인지 판정할 수 있어야 한다. */
  definition: string;
  unit: MetricUnit;
  /** 이 값을 내는 정본 출처 — RPC 이름이나 테이블. */
  source: string;
  /** 가드레일 경보선. 이 값 미만이면 화면이 빨강. `alertAbove` 와 동시 지정 시 OR 로 결합(양방향 밴드). */
  alertBelow?: number;
  /** 가드레일 경보선. 이 값 초과면 화면이 빨강. */
  alertAbove?: number;
  /**
   * 소표본 게이트 임계. 표본이 이 값 미만이면 숫자 대신 "n=N · 판단 보류".
   * 0 = 게이트 없음(카운트·금액처럼 표본 개념이 없는 것).
   */
  minSample: number;
  /** 읽을 때 반드시 알아야 할 한계. */
  caveat?: string;
  /** 현 구현이 위 정본과 다르면 그 사실. 플랜 B 에서 해소한다. */
  drift?: string;
}

/**
 * 소표본 임계 — 지표 성격별 규칙(스펙 §7). 개별 지표가 제각각 정하면 그게 또 드리프트다.
 * 비율 30 · 분포 셀 5 · 리텐션 곡선 50 · 바이럴 계수 30.
 */
export const MIN_SAMPLE = {
  /** 카운트·금액 — 표본 개념이 없다. */
  NONE: 0,
  /** 비율·전환율. */
  RATE: 30,
  /** 분포·교차표(셀 단위). */
  CELL: 5,
  /** 리텐션 곡선·분위수(P90 등). */
  CURVE: 50,
  /** K-factor·바이럴 계수. */
  VIRAL: 30,
} as const;

export const METRICS = {
  // ── 1층 손익 ──────────────────────────────────────────────────────────────
  contribution_won: {
    key: "contribution_won",
    label: "기여",
    definition: "매출 − 광고비 − API 원가. 창은 7일 롤링(KST 자정 경계).",
    unit: "won",
    source: "payments + ad_spend + llm_usage",
    minSample: MIN_SAMPLE.NONE,
    caveat: "인프라 비용(Vercel·Supabase)은 빠져 있다 — 월 단위로만 파악된다.",
  },
  revenue_won: {
    key: "revenue_won",
    label: "매출",
    definition: "payments 중 status='completed' 의 amount_won 합. 환불(refunded)은 제외.",
    unit: "won",
    source: "admin_dashboard_revenue",
    minSample: MIN_SAMPLE.NONE,
    caveat:
      "탈퇴자의 결제는 user_id 가 NULL 로 익명 보존된다. 집계는 반드시 `(user_id IS NULL OR user_id <> ALL(exclude))` 로 감쌀 것 — `<> ALL` 만 쓰면 3값 논리로 NULL 행이 통째로 빠진다.",
  },
  ad_spend_won: {
    key: "ad_spend_won",
    label: "광고비",
    definition: "ad_spend.spend_won 합. spend_date 는 이미 KST 날짜다(입력값).",
    unit: "won",
    source: "ad_spend",
    minSample: MIN_SAMPLE.NONE,
    caveat: "사용자가 손으로 입력한다 — 최근 며칠이 비어 있을 수 있다. 창 끝단을 신뢰하기 전에 최근 입력일을 확인할 것.",
  },
  api_cost_won: {
    key: "api_cost_won",
    label: "API 원가",
    definition: "llm_usage.cost_won 합. cost_won 은 적재 시점에 확정된 값이다.",
    unit: "won",
    source: "llm_usage",
    minSample: MIN_SAMPLE.NONE,
    caveat:
      "단가가 없는 모델은 cost_won 이 NULL 이라 합계에서 빠진다(0 아님). 토큰은 남으므로 단가를 채운 뒤 소급 계산할 수 있다.",
  },

  // ── 1층 단가 ──────────────────────────────────────────────────────────────
  rev_per_signup: {
    key: "rev_per_signup",
    label: "가입당 매출",
    definition: "가입 코호트 귀속. 해당 창에 **가입한** 사람들이 낸 매출 ÷ 그 인원. = 결제율 × ARPPU.",
    unit: "won",
    source: "roadmap-kpi-snapshot.sql / rev_ps",
    minSample: MIN_SAMPLE.RATE,
    caveat: "캘린더 귀속(그 창에 발생한 매출 ÷ 그 창의 가입자)과 다르다. 2026-09-19 분석이 코호트 귀속으로 정정했다.",
  },
  pay_rate: {
    key: "pay_rate",
    label: "결제율",
    definition: "가입자 중 status='completed' 결제가 1건 이상인 사람의 비율.",
    unit: "percent",
    source: "users ⋈ payments",
    minSample: MIN_SAMPLE.RATE,
    caveat: "가입당 매출의 두 성분 중 하나다. ARPPU 와 함께 읽지 않으면 하락 원인을 못 가린다.",
  },
  arppu_won: {
    key: "arppu_won",
    label: "ARPPU",
    definition: "매출 ÷ 결제자 수(결제 1건 이상인 사람).",
    unit: "won",
    source: "payments",
    minSample: MIN_SAMPLE.RATE,
  },
  cac_won: {
    key: "cac_won",
    label: "CAC",
    definition: "광고비 ÷ 그 창의 신규 가입 수.",
    unit: "won",
    source: "ad_spend + users",
    minSample: MIN_SAMPLE.NONE,
    caveat: "분모가 전체 가입이라 오가닉까지 포함한 혼합 CAC 다. 광고 경유만의 CAC 가 아니다.",
  },

  // ── 1층 가드레일 ──────────────────────────────────────────────────────────
  first_reading_rate: {
    key: "first_reading_rate",
    label: "첫 리딩 비율",
    definition: "가입자 중 리딩을 1건 이상 만든 사람의 비율.",
    unit: "percent",
    source: "users ⋈ readings",
    alertBelow: 80,
    minSample: MIN_SAMPLE.RATE,
  },
  result_viewed: {
    key: "result_viewed",
    label: "결과 열람",
    definition:
      "가입 코호트 기준 — 그 코호트의 **첫 리딩이 유료인 사람** 중 그 첫 리딩의 result_viewed_at 이 채워진 비율.",
    unit: "percent",
    source: "admin_layer1_guard / result_viewed",
    alertBelow: 55,
    minSample: MIN_SAMPLE.RATE,
    caveat:
      "result_viewed_at 은 '[결과 보기 →] 버튼을 눌렀나'를 잰다. 자동 이동이 아니라 수동 버튼이다. 무료 첫 리딩은 분모에서 빠진다(3층 roadmap KPI 와 같은 정의).",
  },
  login_success_rate: {
    key: "login_success_rate",
    label: "로그인 성공률",
    definition:
      "창 안에서 /login 에 도달한 anon_id 중, 같은 창에서 user_id 가 붙은 page_views 를 남긴 비율.",
    unit: "percent",
    source: "page_views",
    alertBelow: 60,
    minSample: MIN_SAMPLE.RATE,
    caveat:
      "2026-09-20 실측 67.6%(30일 1,531명 중 496명 이탈). 미탐지 봇·단순 구경이 섞였을 수 있어 해석은 '유력' 단계다. 숫자 자체는 확인됐다. 또한 `/login` 방문 당시 **이미 로그인돼 있던 사람**이 분자에 섞여 값이 소폭 과대다 — 2026-09-24 실측으로 도달자의 3.6%, 비율로는 +1.2%p(67.3% → 보정 시 66.1%).",
  },
  checkout_completion: {
    key: "checkout_completion",
    label: "결제 시작→완료",
    definition: "ui_events 의 recharge_payment_started 대비 같은 사람의 payments(completed) 도달 비율.",
    unit: "percent",
    source: "ui_events + payments",
    alertBelow: 75,
    minSample: MIN_SAMPLE.RATE,
  },
  new_error_classes: {
    key: "new_error_classes",
    label: "신규 에러 클래스",
    definition: "최근 24시간에 처음 등장한 error 레벨 에러 그룹의 수.",
    unit: "count",
    source: "error_logs",
    alertAbove: 0,
    minSample: MIN_SAMPLE.NONE,
    caveat: "설계된 정상 신호(중복차단 warn·카카오 -101 info)는 error 레벨이 아니라 여기 안 잡힌다.",
  },
  unreviewed_sensitive: {
    key: "unreviewed_sensitive",
    label: "미검토 민감알림",
    definition: "sensitive_alerts 중 reviewed_at 이 NULL 인 행의 수.",
    unit: "count",
    source: "sensitive_alerts",
    alertAbove: 0,
    minSample: MIN_SAMPLE.NONE,
  },

  // ── 1층 흐름·리텐션 ───────────────────────────────────────────────────────
  organic_share: {
    key: "organic_share",
    label: "오가닉 비율",
    definition:
      "가입자 중 user_acquisition **행이 없는** 사람의 비율. (행이 없다 = utm 없이 들어왔다)",
    unit: "percent",
    source: "users LEFT JOIN user_acquisition",
    minSample: MIN_SAMPLE.RATE,
    caveat:
      "쿠키 차단·acq 쿠키 30일 만료 후 가입도 여기 섞인다 — 오가닉의 **상한**으로 읽을 것.",
    drift:
      "🔴 정의 충돌 — `utm_source` 값으로 재면 항상 0.0% 가 나온다(prod 값이 meta 2,022 · ig 5 · NULL 1 뿐이라 'organic' 이라는 값 자체가 없다). 유입기록 없음 기준은 8.8%(30일 7.5%). 메모리에 적힌 3.8% 는 또 다른 창·정의다. **정본은 유입기록 없음.**",
  },
  visit_2d_plus: {
    key: "visit_2d_plus",
    label: "2일+ 방문",
    definition: "로그인 유저 중 서로 다른 KST 날짜에 2일 이상 page_views 를 남긴 사람의 비율.",
    unit: "percent",
    source: "page_views",
    minSample: MIN_SAMPLE.RATE,
    caveat: "2026-09-20 실측 12.1%(5일+ 는 0.7%). 30일 구독의 선행 조건이다.",
  },
  d7_return: {
    key: "d7_return",
    label: "D7 재방문",
    definition: "가입 코호트 중 가입 후 7일째에 방문한 사람의 비율. 창 종료 후 7일 성숙시켜 읽는다.",
    unit: "percent",
    source: "roadmap-kpi-snapshot.sql / d7_return_pct",
    minSample: MIN_SAMPLE.CURVE,
    caveat: "성숙 전 코호트를 넣으면 분모가 부풀어 값이 낮게 나온다 — 성숙 창 표기가 필수다.",
  },
  repeat_revenue_share: {
    key: "repeat_revenue_share",
    label: "재결제 매출 비중",
    definition: "결제 2건 이상인 사람의 매출 ÷ 전체 매출.",
    unit: "percent",
    source: "payments",
    minSample: MIN_SAMPLE.RATE,
    caveat: "2026-09-20 실측 30.8%(결제자 200명 중 재결제자 27명). 소수가 매출의 1/3을 만든다.",
  },
  // ⚠️ UV 는 **정의가 둘이고 그게 의도된 것**이다. 하나로 합치지 말 것 — 키를 둘로 나눠
  //    어느 쪽을 보고 있는지 화면이 항상 말하게 한다(실측 차이는 하루 최대 1명 수준).
  uv_pageview: {
    key: "uv_pageview",
    label: "UV (페이지뷰 귀속)",
    definition:
      "page_views 의 distinct anon_id 를 **페이지뷰가 찍힌 날**에 귀속. PV 와 짝이라 일별 추세에 쓴다.",
    unit: "count",
    source: "admin_traffic_trend",
    minSample: MIN_SAMPLE.NONE,
    caveat:
      "`uv_session` 과 값이 다르다(분모가 다르다). 같은 값으로 기대하지 말 것 — 화면에 어느 쪽인지 라벨을 반드시 붙인다.",
  },
  uv_session: {
    key: "uv_session",
    label: "UV (세션 시작 귀속)",
    definition:
      "방문을 30분 갭(SESSION_GAP)으로 세션화하고 **세션이 시작된 날**에 귀속. 신규/연속/복귀 분해와 짝이다.",
    unit: "count",
    source: "admin_traffic_visitor_mix",
    minSample: MIN_SAMPLE.NONE,
    caveat:
      "자정을 걸친 세션을 시작일로 몰아주므로 `uv_pageview` 와 하루 최대 1명 수준 차이가 난다. 의도된 공존이다.",
  },
  withdrawal_rate: {
    key: "withdrawal_rate",
    label: "탈퇴율",
    definition:
      "탈퇴 수 ÷ (현재 유저 + 탈퇴 수). 탈퇴는 users 행을 지우므로 분모를 '총 가입 이력'으로 이렇게 복원한다.",
    unit: "percent",
    source: "users + account_withdrawals",
    minSample: MIN_SAMPLE.RATE,
    caveat:
      "🔴 분자에서 어드민·테스트 계정을 **뺄 수 없다** — account_withdrawals 는 kakao_id_hash 만 남기고 user_id 를 안 남긴다(탈퇴 = 유저 삭제). 분모는 제외되는데 분자는 안 되므로 **실제보다 소폭 높게** 나온다. 이 한계를 화면에 적을 것.",
  },

  // ── 무료 상품 · 구독 ──────────────────────────────────────────────────────
  subscription_won: {
    key: "subscription_won",
    label: "구독 매출",
    definition:
      "byeolmaru_subscriptions.stars_spent 중 **유료별만** 원화 환산. free-first 귀속(admin_star_spend_breakdown 과 같은 규칙)을 재사용한다.",
    unit: "won",
    source: "byeolmaru_subscriptions + star_transactions",
    minSample: MIN_SAMPLE.NONE,
    caveat:
      "무료별(웰컴 보너스 등)로 산 구독의 매출 기여는 0 이다. 전체 별 기준과 유료별 기준을 같이 적을 것.",
  },
  free_share_funnel: {
    key: "free_share_funnel",
    label: "무료 상품 공유 퍼널",
    definition:
      "공유 링크 착지(page_views.utm_source=<상품>) → 가입 → 결제. 결제는 **착지 이후** 것만 센다.",
    unit: "count",
    source: "page_views + users + payments",
    minSample: MIN_SAMPLE.RATE,
    caveat:
      "무료 상품을 '전환율'로 재지 않는다 — 2026-08-24 실측에서 무료→결제는 역인과로 판명됐다. 이 퍼널은 **획득**을 재는 것이고, 리텐션 리프트는 별도 지표다.",
    drift:
      "별마루 오늘의 타로/사주 공유 링크에는 아직 utm 이 없다(별마루 P6-3 Task 12-b · P6-4 가 붙인다). 그때까지 별마루 행은 구조적으로 0 이다.",
  },
  byeoljari_k_factor: {
    key: "byeoljari_k_factor",
    label: "K-factor",
    definition: "지도당 utm 경유 가입 수.",
    unit: "ratio",
    source: "admin_byeoljari_summary",
    minSample: MIN_SAMPLE.VIRAL,
    caveat: "2026-09-20 기준 초대 클릭 2건 — 표본이 차기 전엔 게이트 뒤에 있어야 한다.",
  },
} as const satisfies Record<string, MetricDef>;

/** METRICS 의 키 유니온 — 오타를 컴파일 타임에 잡는다. */
export type MetricKey = keyof typeof METRICS;

/** 1층 가드레일 줄에 뜨는 지표. 평소엔 조용하고 경보선을 벗어나면 빨강. */
export const GUARDRAILS: readonly MetricKey[] = [
  "first_reading_rate",
  "result_viewed",
  "login_success_rate",
  "checkout_completion",
  "new_error_classes",
  "unreviewed_sensitive",
];

export interface GateResult {
  /** 숫자를 그려도 되는가. */
  show: boolean;
  /** show=false 일 때 숫자 대신 그릴 문구. */
  note?: string;
}

/**
 * 동적 문자열이 유효한 지표 키인지 판별하는 타입가드.
 * 플랜 B 에서 쿼리 파라미터 같은 런타임 문자열로 키가 들어올 때 이걸로 좁힌 뒤 METRICS 를 조회한다.
 */
export function isMetricKey(key: string): key is MetricKey {
  return Object.hasOwn(METRICS, key); // `in` 은 프로토타입 체인을 타 "__proto__"·"constructor" 를 통과시킨다
}

/**
 * 소표본 게이트 — 임계 미만이면 숫자를 **흐리게가 아니라 대체**한다.
 * 표본 12명으로 낸 K-factor 는 틀린 게 아니라 판단 근거가 될 수 없다.
 */
export function sampleGate(key: MetricKey, n: number): GateResult {
  const m = METRICS[key];
  return n >= m.minSample ? { show: true } : { show: false, note: `n=${n} · 판단 보류` };
}

/**
 * 가드레일 경보 판정. 경보선이 없는 지표는 항상 false.
 * alertBelow 와 alertAbove 가 둘 다 있으면 OR — 양방향 밴드를 벗어났는가.
 */
export function isAlerting(key: MetricKey, value: number | null): boolean {
  if (value === null) return false; // 값이 없는 것은 경보가 아니다 — 조회 실패는 따로 표시한다
  const m: MetricDef = METRICS[key];
  const below = m.alertBelow !== undefined && value < m.alertBelow;
  const above = m.alertAbove !== undefined && value > m.alertAbove;
  return below || above;
}
