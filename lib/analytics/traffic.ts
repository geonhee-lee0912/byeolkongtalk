// lib/analytics/traffic.ts — 어드민 트래픽 화면의 타입 + RPC 결과에 붙이는 표시용 파생값 (DB 접근 없음).
//
// 왜 이 계측이 있는가: Meta 픽셀은 광고 상단(노출→클릭→랜딩→가입)까지만 보여준다. 클릭→랜딩
// 도달률은 96% 로 건강한데, 가입 이후 앱 내부 라우트 이탈은 계측이 없어 완전히 블라인드였다.
// "상담 대화의 47.4% 가 결과 화면에 도달하지 못한다"는 건 알지만 어느 화면에서 사라지는지는
// 알 수가 없었다 → 이 계측의 1순위 목적은 라우트별 이탈 지점 찾기다.
//
// ⚠️ **집계는 전부 Postgres RPC 가 한다** (admin_traffic_*, 2026-07-29 전환). 이전엔 page_views
//    원본을 .limit(100000) 으로 받아 이 모듈의 순수 함수로 집계했는데, Supabase `Max rows`(서버
//    강제 상한)가 그 limit 을 조용히 덮어써 30일 UV/PV 가 53% 유실됐다(2026-07-28 사고).
//    그래서 여기 남은 것은 **RPC 결과를 화면용으로 다듬는 함수와 타입뿐**이다.
//    봇 제외 · 어드민 제외(3값 논리) · KST 자정 버킷 · first-touch 귀속 규칙은 전부 SQL 안에 있다:
//    supabase/migrations/20260729000000_admin_traffic_aggregates.sql
//    (유입 버킷 라벨 '(직접/오가닉)'·'(매크로 미치환)' 도 그 SQL 의 admin_normalize_entry 가 만든다)
//
// 공통 규칙:
// - UV = 구별되는 anon_id 수. anon_id 는 middleware 가 첫 진입에 발급하므로 사실상 항상 있지만,
//   없는 행(쿠키 발급 전 · 차단)은 UV 에 세지 않고 PV 만 기여한다 (하나로 뭉치면 UV 가 왜곡된다).
// - is_bot=true 는 모든 지표에서 제외한다. 섞이면 전환율이 전부 이유 없이 낮게 나온다.
//   대신 봇 비율만 따로 본다 (계측 건강성 확인용).
// - 화면 표기는 UV → PV 순 ("몇 명이 왔고 그중 몇 번 봤나"). 타입 필드도 그 순서로 맞춘다.

const pct1 = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);

// ── 1. 일별 UV/PV 추세 ───────────────────────────────────────────────────────

export type TrafficPoint = { date: string; uv: number; pv: number };

/**
 * RPC 의 일별 행에 날짜 축을 채운다(없는 날 0). 축 밖 날짜는 버린다.
 * RPC 는 데이터가 있는 날만 반환하므로, 수집이 끊긴 날이 행 자체로 사라지면 그래프가 거짓말을 한다.
 */
export function fillTrafficAxis(
  rows: TrafficPoint[],
  days: number,
  todayBucket: string
): TrafficPoint[] {
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const base = new Date(`${todayBucket}T00:00:00Z`);
  const out: TrafficPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(base.getTime() - i * 86400000).toISOString().slice(0, 10);
    const hit = byDate.get(d);
    out.push({ date: d, uv: hit?.uv ?? 0, pv: hit?.pv ?? 0 });
  }
  return out;
}

/**
 * 추세의 마지막 두 점 = 오늘·어제 (KST 자정 버킷). 상단 "오늘 UV/PV + 어제 대비" 카드용.
 * fillTrafficAxis 가 날짜 축을 항상 채우고 오름차순이므로 마지막이 오늘이지만,
 * days=1 이나 빈 배열에서도 안전해야 한다 → 없는 쪽은 0 으로 준다 (Delta 가 "어제 0" 으로 뜬다).
 */
export function pickTodayYesterday(trend: TrafficPoint[]): { today: TrafficPoint; yesterday: TrafficPoint } {
  const zero = (date: string): TrafficPoint => ({ date, uv: 0, pv: 0 });
  return {
    today: trend[trend.length - 1] ?? zero(""),
    yesterday: trend[trend.length - 2] ?? zero(""),
  };
}

/** 봇 비율 — 계측 건강성 한 줄. 봇 PV 가 갑자기 치솟으면 UV/PV 해석 자체를 의심해야 한다. */
export type BotShare = { totalPv: number; botPv: number; botPct: number };

// ── 2. 라우트별 UV·PV (이 화면의 핵심) ───────────────────────────────────────

export type RouteRow = {
  path: string;
  uv: number;
  pv: number;
  /** PV/UV — 재방문 강도. 1 에 가까우면 "한 번 보고 떠남", 높으면 머물거나 되돌아온 화면. */
  pvPerUv: number;
};

/** 라우트 행에 PV/UV(재방문 강도)를 붙인다. SQL 로 내리지 않는 이유: 순수 표시 파생값이다. */
export function withPvPerUv<T extends { uv: number; pv: number }>(
  rows: T[]
): (T & { pvPerUv: number })[] {
  return rows.map((r) => ({
    ...r,
    pvPerUv: r.uv ? Math.round((r.pv / r.uv) * 10) / 10 : 0,
  }));
}

// ── 3. 로그인 전/후 ──────────────────────────────────────────────────────────
//
// user_id 유무로 UV·PV 분해. 이 비콘의 존재 이유가 "가입 이후 이탈" 이라 이 분해가 중요하다.
// 주의: 같은 anon_id 가 로그인 전/후 양쪽에 나타난다(가입 순간 브리지) → 두 UV 합은 전체 UV 보다 클 수 있다.

export type AuthSplitRow = { segment: "guest" | "member"; uv: number; pv: number };

// ── 4. 유입별 (landing_variant · utm_content) ────────────────────────────────
//
// 방문자 최초 귀속(first-touch)으로 SQL 이 집계한다. 왜 행 단위로 그룹하지 않는가:
// 비콘(components/analytics/PageViewBeacon.tsx)은 utm 이 URL 에 실려 있는 그 1건에만 값을 담아
// 보낸다. 행 단위로 묶으면 랜딩 1건만 소재에 잡히고 그 방문자의 나머지 PV 는 전부 (직접/오가닉)
// 으로 흘러가 표가 무의미해진다 → anon_id 의 가장 이른 값으로 그 방문자의 모든 행을 귀속시킨다.

export type EntryRow = { key: string; uv: number; pv: number };

// ── 5. "오늘" 열 ────────────────────────────────────────────────────────────
//
// 표마다 최근 N일과 오늘을 나란히 본다. 두 값을 같은 RPC 가 같은 조건(같은 봇 제외·같은 어드민
// 제외·같은 자정 버킷)으로 내려주므로 두 열이 같은 정의로 비교된다.
// 행 구성·순서는 기간 집계를 그대로 유지한다 — 오늘 값으로 재정렬하면 순위가 매 시간 흔들려
// "어느 라우트에서 새는가"를 못 읽는다. 오늘 없던 키는 0/0. 반대로 오늘만 활동하고 기간 상위 N 에
// 못 든 키는 표에 안 나온다(라우트 표의 limit 때문 — 유입·로그인 표는 상한이 없어 해당 없음).

export type WithToday<T> = T & { todayUv: number; todayPv: number };

// ── 6. 방문자 구성 (신규 / 연속 / 복귀) ──────────────────────────────────────
//
// 집계는 SQL(admin_traffic_visitor_mix)이 한다. 방문자의 "직전 방문 버킷"을 알아야 하고 그건
// 조회창 밖까지 봐야 나오므로, 원본 행을 앱으로 받는 방식으로는 계산 자체가 불가능하다.
// 여기 있는 건 SQL 결과에 표시용 파생값을 붙이는 순수 함수뿐이다.
//
// 정의 (SQL 이 보장): 신규 = 직전 방문 없음 / 연속 = 직전 방문이 어제 버킷 / 복귀 = 그보다 전.
// 배타적·완전하므로 세 값의 합은 그 버킷 UV 와 같다.
//
// ⚠️ 이 UV 는 **세션 시작 귀속**이라 일별 추세의 UV(페이지뷰 귀속)와 하루 1명 수준으로 다를 수
//    있다(의도된 것). 두 값을 같은 것으로 기대하지 말 것 — 근거는 RPC 의 SESSION_GAP 주석.

export type VisitorMixRow = {
  date: string; // 'YYYY-MM-DD' (KST 자정 버킷, 세션 시작 귀속)
  uv: number;
  newUv: number;
  streakUv: number;
  backUv: number;
};

export type VisitorMixPoint = VisitorMixRow & {
  returningUv: number;
  /** (연속+복귀)/UV, 소수 1자리. 유입 규모에 중립적이라 "리텐션이 생겼나"의 판독 지표다. */
  returningPct: number;
};

export function buildVisitorMix(rows: VisitorMixRow[]): VisitorMixPoint[] {
  return rows.map((r) => {
    const returningUv = r.streakUv + r.backUv;
    return { ...r, returningUv, returningPct: pct1(returningUv, r.uv) };
  });
}

/**
 * 추세의 마지막 점 = 오늘 버킷. 상단 카드 서브라인용.
 * 빈 배열에서도 0 인 점을 반환한다 (수집 초기·조회 실패에 화면이 깨지지 않게).
 */
export function pickTodayVisitorMix(mix: VisitorMixPoint[]): VisitorMixPoint {
  return (
    mix[mix.length - 1] ?? {
      date: "",
      uv: 0,
      newUv: 0,
      streakUv: 0,
      backUv: 0,
      returningUv: 0,
      returningPct: 0,
    }
  );
}
