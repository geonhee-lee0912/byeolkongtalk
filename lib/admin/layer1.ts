// lib/admin/layer1.ts — 1층 지표 산식. 순수(DB·React import 0).
//
// RPC 는 **원시 분자/분모만** 준다. 비율을 SQL 안에서 만들면 "이 숫자가 왜 이렇게 나왔나"를
// 유닛 테스트로 물을 수 없고, 소표본 게이트에 필요한 n(분모)도 잃는다.
import {
  GUARDRAILS,
  METRICS,
  isAlerting,
  isMetricKey,
  sampleGate,
  type MetricKey,
} from "@/lib/admin-metrics";

export interface UnitRow {
  signups: number;
  payers: number;
  revenueWon: number;
  adSpendWon: number;
}

export interface UnitMetrics {
  /** 퍼센트(0~100). 분모 0 이면 null. */
  payRate: number | null;
  arppuWon: number | null;
  cacWon: number | null;
  revPerSignup: number | null;
}

/** 0 나눗셈은 null — Infinity·NaN 이 화면까지 새는 걸 막는다. */
const div = (a: number, b: number): number | null => (b > 0 ? a / b : null);

/**
 * 퍼센트를 **소수 1자리 정확값**으로 만든다. 비율 지표는 전부 이걸 쓴다.
 *
 * 🔴 `num / den * 100` 을 먼저 하면 그 double 이 **이미 참값이 아니다** — `23/80*100` 은
 *    `28.749999999999996` 이라 뒤에서 어떤 반올림을 해도 `28.8` 이 안 나온다. 포맷 함수에서
 *    고칠 수 있는 문제가 아니고, 나눗셈 자리에서 고쳐야 한다.
 *    스케일(×1000)을 **먼저** 곱해 나눗셈을 한 번만 하면 `23000/80 = 287.5` 로 정확히 떨어진다.
 *
 * 근거: Task 1 코드 리뷰가 BigInt 정확 유리수 반올림과 전수 대조해 확인했다 — 분모가 80의
 * 배수인 계열(80·160·240·400·2000…)에서 **체계적으로** 발생하고, 그건 이 서비스의 평범한
 * 표본 크기다(1층 가드레일 지표 대부분이 `count/count*100` 형태다).
 *
 * 부수 효과(의도한 것): `isAlerting` 이 보는 값과 화면에 찍히는 값이 **같아진다.** raw 를
 * 넘기면 "80.0% 인데 왜 빨강이지?"(참값 79.96)가 생긴다.
 */
const pct1 = (num: number, den: number): number | null =>
  den > 0 ? Math.round((num * 1000) / den) / 10 : null;

export function computeUnit(r: UnitRow): UnitMetrics {
  return {
    payRate: pct1(r.payers, r.signups), // 퍼센트는 pct1 — div 로 만들면 표시가 0.1 어긋난다
    arppuWon: div(r.revenueWon, r.payers), // 금액은 포맷이 정수로 반올림하므로 div 로 충분
    cacWon: div(r.adSpendWon, r.signups),
    revPerSignup: div(r.revenueWon, r.signups),
  };
}

/** RPC `admin_layer1_guard` 의 한 행. 카운트 지표는 den=0 으로 온다. */
export interface GuardRow {
  metric: string;
  num: number;
  den: number;
}

export interface GuardView {
  key: MetricKey;
  label: string;
  /** null = 그 지표 행이 없었다(조회 실패 또는 해당 없음). */
  value: number | null;
  /** 소표본 게이트의 표본 크기. */
  n: number;
  alerting: boolean;
  show: boolean;
  note?: string;
}

/**
 * 가드레일 6종을 GUARDRAILS 순서대로 항상 6개 반환한다.
 * 행이 없어도 자리를 비우지 않는 이유: 가드레일이 조용히 사라지면 "이상 없음"으로 오독된다.
 */
export function computeGuardrails(rows: GuardRow[]): GuardView[] {
  const byKey = new Map<string, GuardRow>();
  for (const r of rows) {
    if (isMetricKey(r.metric)) byKey.set(r.metric, r); // enum 밖 값은 버린다
  }
  return GUARDRAILS.map((key) => {
    const row = byKey.get(key);
    const m = METRICS[key];
    // 🔴 `percent` 만 나눈다. 구 코드는 "count 가 아니면 전부 비율"이라 won·ratio 지표가
    //    GUARDRAILS 에 들어오는 순간 100배 어긋났다(아직 그런 지표가 없어 미도달이었다).
    const value =
      row === undefined ? null : m.unit === "percent" ? pct1(row.num, row.den) : row.num;
    const n = row?.den ?? 0;
    // 🔴 unit 으로 우회하지 않는다. 카운트 지표는 minSample 이 0 이라 den 이 0 이어도 통과하고,
    //    훗날 표본 게이트가 필요한 카운트 지표가 생기면 den 이 **존중된다.**
    //    (구 코드는 `unit === "count" ? 0 : n` 이었는데, 그 분기는 오늘 동작에 기여하는 게 없으면서
    //     den 을 버려서 그런 지표를 영원히 "판단 보류"로 가두는 경로였다 — 코드 리뷰 실측.)
    const gate = sampleGate(key, n);
    return {
      key,
      label: m.label,
      value,
      n,
      alerting: gate.show && isAlerting(key, value),
      show: gate.show,
      note: gate.note,
    };
  });
}
