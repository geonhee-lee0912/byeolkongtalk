// lib/admin/roadmap.ts — 3층 판정 규칙. 순수(DB·React import 0).
//
// 🔴 베이스라인·목표선은 `plans/2026-09-19-흑자전환-로드맵-v2-별마루배포포함.md` §1·§3 이 정본이다.
//    "판정 지표는 배포 전에 고정하고 배포 후 바꾸지 않는다"가 그 문서의 원칙이라, 이 파일의
//    숫자를 고치는 것은 **판정 규칙을 바꾸는 일**이다. 근거 없이 건드리지 말 것.
//
// ⚠️ 베이스라인 출처가 두 갈래다 — 알고 읽을 것.
//    · 대부분: §1 표(W5 창 09-01~18 가입 코호트, 485명).
//    · 문서 하단 "확정 스냅샷" 행은 **09-19 예비 실행**(창 09-01~20 · 공휴일 제외 없음 · 503명)이라
//      §1 과 1~2 눈금 다르다(예: turns 3.70 vs 3.79, arppu ₩3,254 vs ₩3,392). 정본은 §1 쪽이고,
//      그 행은 D0 전날 재실행해 덮어쓰기로 되어 있다. 여기 숫자는 **§1 을 따랐다.**
import type { MetricUnit } from "@/lib/admin-metrics";
import { daysAgoKstIso, startOfTodayKstIso } from "@/lib/admin-time";

export interface KpiDef {
  /** admin_roadmap_kpi 의 반환 컬럼명. */
  column: string;
  label: string;
  unit: MetricUnit;
  /** 로드맵 §1 베이스라인. */
  baseline: number;
  /** 성공선. 없으면 참고 지표이거나 가드레일. */
  target?: number;
  /** 이 값에 닿으면 되돌리기 검토(가드레일은 경보선). */
  floor?: number;
  /** 높을수록 좋은가 낮을수록 좋은가. */
  direction: "up" | "down";
  /**
   * 경계값이 **경보 쪽에 포함**되는가. 기본 false = 로드맵의 다수형 `<X → 경보`(배타).
   * 🔴 Primary 만 `≤₩200 → 되돌리기 검토`라 true 다. 이걸 하나로 뭉뚱그리면 둘 중 하나가 틀린다.
   */
  floorInclusive?: boolean;
  /**
   * 경계값이 **달성 쪽에 포함**되는가. 기본 true = 로드맵의 다수형 `≥X → 달성`(포함).
   * 🔴 무언 이탈만 `<22% 면 성공`이라 false 다.
   */
  targetInclusive?: boolean;
  /** 사람이 읽는 판정 규칙 — 화면에 그대로 뜬다. */
  rule: string;
  group: "primary" | "welcome15" | "turnclose" | "byeolmaru" | "guardrail" | "ref";
}

// 🔴 선언부 타입 주석이다 — `as const satisfies` 를 쓰면 색인·filter 결과가 원소별 좁은
//    유니온이 되어 `k.target`·`k.floor` 접근이 TS2339 로 죽는다(Task 1 에서 METRICS 로 같은
//    함정을 확인했다). 여긴 리터럴 타입이 필요 없고, 이 자리에 타입을 달아야 각 원소가
//    KpiDef 를 만족하는지도 검사된다(`as` 캐스트는 그 검사를 약화시킨다).
export const ROADMAP_KPIS: readonly KpiDef[] = [
  {
    column: "rev_ps_whalecap20k",
    label: "가입당 매출 (고래캡 ₩20k)",
    unit: "won",
    baseline: 252,
    target: 394,
    floor: 200,
    floorInclusive: true, // 로드맵 §3: "≤₩200 → 되돌리기 검토"
    direction: "up",
    rule: "4주 창에서 ≥₩394 연속 2창 → 증액 스위치 ON. ≤₩200 → 해당 Phase 되돌리기 검토.",
    group: "primary",
  },
  {
    column: "two_first_rev_ps",
    label: "two_card 첫선택 층 가입당",
    unit: "won",
    baseline: 84,
    target: 84,
    floor: 60,
    direction: "up",
    rule: "3주 창 <₩60 → 되돌리기 또는 구독가 상향 재논의. ≥₩84 유지. 그 사이는 4주까지 연장.",
    group: "welcome15",
  },
  {
    column: "two_first_payer_pct",
    label: "two_card 층 결제율",
    unit: "percent",
    baseline: 2.6,
    direction: "up",
    rule: "가입당의 성분. 7월 W3 은 4.7% 였다.",
    group: "welcome15",
  },
  {
    column: "two_first_share_pct",
    label: "two_card 첫선택 비중",
    unit: "percent",
    baseline: 64,
    direction: "up",
    rule: "웰컴 재화가 스프레드 선택을 지배한다(08-29 적자 진단) — 웰컴 15 의 직접 효과가 여기 나온다.",
    group: "welcome15",
  },
  {
    column: "silent_exit_pct",
    label: "무언 이탈 (유료 첫 리딩)",
    unit: "percent",
    baseline: 27.7,
    target: 22,
    targetInclusive: false, // 로드맵 §3: "무언 이탈 <22% 이면 성공" — 22.0 은 아직 아니다
    direction: "down",
    // ⚠️ 이 컬럼은 사주를 포함한다(§1 각주). §3 표의 "30%" 는 타로만 본 값이라 여기 기준이 아니다.
    rule: "<22% 이고 유저 턴 ≥4.0 이면 성공 → Phase 3 페르소나 A/B 불필요. 기준 27.7% 는 사주 포함(§1 각주).",
    group: "turnclose",
  },
  {
    column: "avg_user_turns",
    label: "평균 유저 턴",
    unit: "ratio",
    baseline: 3.79,
    target: 4.0,
    direction: "up",
    rule: "무언 이탈과 **함께** 읽는다. 둘 다 좋아져야 턴마무리 성공이다.",
    group: "turnclose",
  },
  {
    column: "d7_return_pct",
    label: "D7 재방문",
    unit: "percent",
    baseline: 6.2,
    target: 10,
    direction: "up",
    // ⚠️ 기준 6.2% 는 §1 이 W4 값으로 적어 둔 것이다 — W5 는 검열 중이라 확정값이 없었다.
    rule: "단월 판정 금지. 12주 누적(12-14)에 구독 ≥ 가입의 0.5% 또는 D7 ≥10% 면 별마루 유지. 기준 6.2% 는 W4 값이다(§1).",
    group: "byeolmaru",
  },
  {
    column: "visit2_pct",
    label: "2일+ 방문",
    unit: "percent",
    baseline: 9.6,
    direction: "up",
    rule: "30일 구독의 선행 조건. 5일+ 방문은 0.7% 였다(09-19 별마루 P6 설계 실측).",
    group: "byeolmaru",
  },
  {
    column: "first_reading_pct",
    label: "첫 리딩 비율",
    unit: "percent",
    baseline: 87,
    floor: 80,
    direction: "up",
    rule: "<80% 면 온보딩 회귀 즉시 조사.",
    group: "guardrail",
  },
  {
    column: "viewed_pct",
    label: "결과 열람",
    unit: "percent",
    baseline: 65,
    floor: 55,
    direction: "up",
    rule: "<55% 면 결과 화면 회귀.",
    group: "guardrail",
  },
  {
    column: "shop_to_pay_pct",
    label: "shop→결제",
    unit: "percent",
    // 🔴 21.1 은 로드맵 §1 의 "7.3%" 가 아니다 — 의도적이다.
    //    §1·§5 의 7.3%(W5)·15.7%(W3)·목표 12% 는 전부 심층분석 findings §A-3 의
    //    **two_card 첫선택자만** 분해한 표에서 온 값인데, 이 컬럼(= 스냅샷 SQL 원본 그대로)은
    //    **전체 코호트**의 shop 방문자 중 결제자다. 같은 창(09-01~20)에서 21.1% 가 나온다.
    //    7.3 을 기준으로 두면 화면이 첫날부터 "목표 12% 달성"이라 거짓 성공을 말한다.
    //    → 기준은 이 컬럼 자신의 값(09-19 예비 스냅샷)으로 두고 **목표선은 비운다.**
    //      Phase 2 판정선 12% 를 이 척도로 다시 잡는 건 로드맵 쪽 결정이다(사용자 판단 대기).
    baseline: 21.1,
    direction: "up",
    rule: "전체 코호트 shop 방문자 중 결제자. 로드맵의 7.3%·15.7%·목표 12% 는 **two_card 첫선택 층만** 잰 값이라 척도가 다르다 — 그대로 비교하지 말 것. 기준 21.1% 는 09-19 예비 스냅샷(창 09-01~20)의 같은 컬럼 값.",
    group: "ref",
  },
  {
    column: "premium_first_share_pct",
    label: "프리미엄 첫선택 비중",
    unit: "percent",
    baseline: 3.9,
    target: 5,
    direction: "up",
    rule: "09-19 분석 기준 3개월 불변이던 값. Phase 2 판정선 5%+.",
    group: "ref",
  },
  {
    column: "payer_pct",
    label: "결제율",
    unit: "percent",
    baseline: 7.4,
    direction: "up",
    rule: "가입당 매출의 성분. 09-19 분석이 하락의 본체로 지목한 쪽.",
    group: "ref",
  },
  {
    column: "arppu",
    label: "ARPPU",
    unit: "won",
    baseline: 3392,
    direction: "up",
    rule: "가입당 매출의 다른 성분.",
    group: "ref",
  },
  {
    column: "organic_pct",
    label: "오가닉 비율",
    unit: "percent",
    baseline: 7.5,
    direction: "up",
    rule: "유입 기록이 없는 가입 비율 — 쿠키 차단·30일 만료도 섞이므로 오가닉의 **상한**으로 읽는다. 기준 7.5% 는 어드민 스펙 §7 의 30일 실측(09-20).",
    group: "ref",
  },
  {
    column: "inchat_sheet_opens",
    label: "인챗 충전 시트 열림",
    unit: "count",
    baseline: 7,
    direction: "up",
    // ⚠️ 유일한 **창 누계**다 — 창을 좁히면 값도 같이 줄어든다. 기준 7 은 월 기준이라
    //    28일 기본 창에서만 직접 비교가 성립한다.
    rule: "결제 순간이 대화 안에 있는가. 창 누계이고 기준 7건은 **월** 기준 — 창을 좁히면 그대로 비교되지 않는다. Phase 2 목표 월 100건+.",
    group: "ref",
  },
];

export function kpiByColumn(column: string): KpiDef | undefined {
  return ROADMAP_KPIS.find((k) => k.column === column);
}

export type Verdict = "good" | "watch" | "bad" | "ref" | "unknown";

/**
 * 판정. 값이 없으면 unknown, 목표선도 바닥도 없으면 ref(참고).
 *
 * 🔴 경계는 로드맵 §3 이 **지표마다 다르게** 써 뒀다 — 하나의 규칙으로 뭉개면 둘 중 하나가 틀린다.
 *    · Primary  : "≥₩394 → 스위치 ON" · "≤₩200 → 되돌리기"  → 양쪽 다 포함
 *    · 가드레일 : "<80% 면 조사" · "<55% 면 회귀"            → 바닥은 배타
 *    · 턴마무리 : "무언 이탈 <22% 면 성공"                    → 목표는 배타
 *    기본값(floor 배타 · target 포함)이 다수형이고, 예외 둘만 KpiDef 에 플래그가 붙는다.
 */
export function judge(def: KpiDef, value: number | null): Verdict {
  if (value === null || Number.isNaN(value)) return "unknown";
  if (def.target === undefined && def.floor === undefined) return "ref";

  if (def.floor !== undefined) {
    const worse = def.direction === "up" ? value < def.floor : value > def.floor;
    const atEdge = value === def.floor && def.floorInclusive === true;
    if (worse || atEdge) return "bad";
  }
  if (def.target === undefined) return "good"; // floor 만 있는 가드레일 — 바닥 위면 정상

  const better = def.direction === "up" ? value > def.target : value < def.target;
  const atEdge = value === def.target && def.targetInclusive !== false;
  return better || atEdge ? "good" : "watch";
}

/**
 * 로드맵 §0-4 "공휴일 가입 제외" — 추석(09-24~27)·개천절(10-03)·한글날(10-09) = **6일**.
 * 🔴 추석은 하루가 아니라 나흘이다. 셋만 넣으면 판정 창에 연휴 사흘치 가입이 그대로 남는다.
 *    Task 15 가 RPC 검증을 이 6일로 돌려 원본 스냅샷과 21개 컬럼 전부 일치를 확인했다.
 */
export const HOLIDAYS_2026 = [
  "2026-09-24",
  "2026-09-25",
  "2026-09-26",
  "2026-09-27",
  "2026-10-03",
  "2026-10-09",
] as const;

/** `?since=`/`?until=` 이 받는 유일한 형식. */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 형식 + **달력 유효성**. 둘 다 봐야 아래 parseRoadmapWindow 의 주석이 참이 된다.
 *
 * 🔴 정규식만으로는 `2026-13-45` 도 `2026-02-31` 도 통과한다. 그렇다고 `Date.parse` 를 얹는
 *    것만으로도 부족하다 — 실측(node v24): `2026-13-45` 는 NaN 이지만 **`2026-02-31` 은 통과해
 *    3월 3일로 조용히 굴러간다**(오버플로우 롤오버). 그러면 운영자가 입력한 창과 화면이 읽은
 *    창이 달라지는데, 그건 RPC 파싱 에러보다 나쁘다(에러는 보이고 롤오버는 안 보인다).
 *    그래서 왕복 비교로 롤오버까지 잡는다.
 */
function isCalendarDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export interface RoadmapWindow {
  /** 반개구간 시작 (RPC `p_since`). */
  since: string;
  /** 반개구간 끝 (RPC `p_until`). **절대 비지 않는다** — 아래 주석 참조. */
  until: string;
}

/**
 * 창: 기본은 최근 28일. `?since=YYYY-MM-DD&until=YYYY-MM-DD` 로 덮어쓴다.
 *
 * 🔴 **p_until 은 항상 닫혀 있어야 한다.** `admin_roadmap_kpi` 는 다른 2층 RPC 들과 달리
 *    `p_until IS NULL` 분기가 없고 `created_at < p_until` 을 무조건 쓴다. NULL 이 넘어가면
 *    `< NULL` → NULL 이라 **에러 없이 코호트가 통째로 빈다.** 화면은 "가입 0명"을 그리고
 *    운영자는 그걸 "이 창에 가입이 없었다"로 읽는다 — 판정 화면에서 가장 위험한 실패 모드라
 *    호출부에서 막는다. 그래서 이 함수의 반환 타입에 null 이 없고, 형식이나 달력상 불가능한
 *    파라미터는 거부하는 대신 기본 창으로 떨어진다(잘못된 문자열을 그대로 넘기면 RPC 가 파싱
 *    에러를 내는데, 그건 LoadFailed 로 보이긴 해도 운영자가 고칠 수 없는 실패다).
 *
 * ⚠️ **창 역전(since > until)은 막지 않는다** — 의도된 선택이다. 역전은 운영자가 직접 친 창이고,
 *    조용히 기본 창으로 강등하면 화면은 멀쩡한 숫자를 보여주면서 그게 **입력한 창이 아니다.**
 *    그대로 넘기면 코호트가 0명이 되고 화면의 앰버 경고가 창 방향을 짚어 준다 — 오타가 보인다.
 *
 * 🔴 KST 자정 경계는 `lib/admin-time.ts` 가 단일 원천이다 — 여기서 다시 계산하면 그게 드리프트다.
 */
export function parseRoadmapWindow(
  sp: Record<string, string | string[] | undefined>
): RoadmapWindow {
  const one = (v: string | string[] | undefined): string | undefined => {
    const s = Array.isArray(v) ? v.find(isCalendarDate) : v;
    return s !== undefined && isCalendarDate(s) ? s : undefined;
  };
  const since = one(sp.since);
  const until = one(sp.until);
  const iso = (d: string) => `${d}T00:00:00+09:00`;
  return {
    // daysAgoKstIso(28) = 오늘 KST 자정에서 28일 전. until 은 오늘 KST 자정(= 어제까지, 반개구간).
    since: since ? iso(since) : daysAgoKstIso(28),
    until: until ? iso(until) : startOfTodayKstIso(),
  };
}
