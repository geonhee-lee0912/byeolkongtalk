// lib/byeolmaru/pair-report.ts — 별마루 유료 "우리 오늘" 5블록 리포트: 타입·구조화 출력 스키마·파서·빌더(순수).
// 형제 = lib/byeolmaru/card-report.ts(오늘 타로 7블록) · lib/fortune/daily-report.ts(오늘 사주). 같은 규율을 그대로 잇는다.
// 🔴 파싱·검증은 **저장 전에 한 번만**. 캐시 히트는 isPairReport 로 형태만 확인해 그대로 돌려준다.
//
// 🔴 왜 자유 줄글에서 블록으로 바꿨나(2026-09-24, 사용자 결정) — 우리 오늘에도 오늘 사주·오늘 타로와
//    **같은 무료/유료 경계**(PaywallCut 절단선)를 두기 위해서다. 절단선은 블러 위에 "무엇이 더
//    있는지"를 섹션 이름으로 약속하는데, 자유 줄글엔 약속할 이름이 없었다.
//    (lib/byeolmaru/paywall-sections.ts 가 "하드코딩 금지 — 낡은 칩은 그 자리에서 거짓말이 된다"고
//     막고 있어, 이름을 지어낼 수도 없었다.)
//
// 🔴 블록은 새로 발명한 게 아니라 **원래 프롬프트가 암묵적으로 시키던 순서를 명시로 바꾼 것**이다.
//    구 프롬프트: "먼저 오늘 일진이 둘 사이를 어떻게 건드리는지로 열고 → 오늘 신호가 어떤 장면으로
//    나타날지 → 너희 고정된 결이 오늘과 겹쳐 어디를 편하게/걸리게 하는지 → 따뜻한 한 줄로 맺어."
//    today·scene·grain·note 가 그 넷이고, timing 은 마무리에 섞여 있던 '좋은 날' 언급을 독립시킨 것이다.
import { parseReportJson } from "@/lib/fortune/json-recover";
import { stripNoteHeading } from "@/lib/fortune/note-heading";

export interface PairReportBlockMeta {
  key: string;
  title: string;
  icon: string;
  /** 프롬프트 문장 예산(문장 수). 목표 글자수 = 문장 × 50. */
  sentences: number;
}

/** 5블록 — 제목·아이콘·순서는 코드 고정(AI 는 key 별 body 만 채운다). note 는 다크 카드라 아이콘 없음.
 *  `as const satisfies` — card-report.ts 와 같은 이유로 타입 주석이 아니다(주석이면 deep-readonly 가
 *  풀려 `sentences = 99` 같은 대입이 컴파일된다).
 *
 *  🔴 문장 합 26 × 50 = 1,300자 — 구 프롬프트의 "1,100~1,300자"를 그대로 이었다. 분량을 바꿀 땐
 *     여기 sentences 가 아니라 **목표 글자수(PAIR_PAID_CHARS)가 정본**이고 문장 수는 거기 도달하기
 *     위한 수단이다(card-report.ts P6-2 Task10 이 실측으로 배운 것 — 표의 문장 수에 맞추려고
 *     되돌리면 목표 대비 -20~-38% 로 돌아간다).
 *
 *  🔴 `timing` 을 "이번 달 좋은 날"이라 부르지 않는다(의도) — 좋은 날 목록은 **비어 있을 수 있다**
 *     (route 가 이번 달 말일로 클램프해서 월말엔 0개가 흔하다). 스키마가 strict 라 그 블록도 반드시
 *     채워져야 하는데, 이름이 "좋은 날"이면 없는 날을 지어내거나 칩이 거짓말을 한다. "둘 사이
 *     타이밍"은 목록이 있든 없든 참이다. */
export const PAIR_REPORT_BLOCKS = [
  { key: "today", title: "오늘 둘 사이", icon: "🌙", sentences: 6 },
  { key: "scene", title: "오늘 벌어질 장면", icon: "💗", sentences: 7 },
  { key: "grain", title: "너희 고정된 결", icon: "🧭", sentences: 6 },
  { key: "timing", title: "둘 사이 타이밍", icon: "✨", sentences: 4 },
  { key: "note", title: "별콩이의 한마디", icon: "", sentences: 3 },
] as const satisfies readonly PairReportBlockMeta[];

/** key 유니온은 배열에서 역산 — 별도 유니온 리터럴이면 두 쪽이 따로 놀 수 있다(card-report.ts 와 동일). */
export type PairReportBlockKey = (typeof PAIR_REPORT_BLOCKS)[number]["key"];

const BLOCK_KEYS: readonly PairReportBlockKey[] = PAIR_REPORT_BLOCKS.map((b) => b.key);

/** AI 가 채우는 부분 — 5개 문자열. */
export type PairReportAI = Record<PairReportBlockKey, string>;

/** 구조화 출력 스키마(strict). 형태만 강제 — 문장 수·내용은 프롬프트 + 파서 몫. */
export const PAIR_REPORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    today: { type: "string" },
    scene: { type: "string" },
    grain: { type: "string" },
    timing: { type: "string" },
    note: { type: "string" },
  },
  required: ["today", "scene", "grain", "timing", "note"],
} as const;

/** 포맷 버전 — 블록 구성을 바꾸면 올릴 것. interface·buildPairReport·isPairReport 세 곳이 이 상수
 *  하나만 참조하므로 올리는 순간 같이 움직인다(리터럴이 흩어지면 한 곳만 고쳐도 tsc 가 못 잡는다). */
const PAIR_REPORT_V = 1;

/** 저장/렌더 최종 형태(byeolmaru_pair_narrative.report JSONB). v 는 포맷 버전 — 바꾸면 구행은 미스로 취급된다. */
export interface PairReport {
  v: typeof PAIR_REPORT_V;
  blocks: PairReportAI;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/** AI 원문 → 검증된 5블록. 하나라도 비면 null(부분 리포트를 저장하지 않는다). */
export function parsePairReportJson(raw: string): PairReportAI | null {
  const o = parseReportJson(raw);
  if (!o) return null;
  const out = {} as PairReportAI;
  for (const k of BLOCK_KEYS) {
    const v = o[k];
    if (!isNonEmptyString(v)) return null;
    out[k] = k === "note" ? stripNoteHeading(v) : v.trim();
  }
  return out;
}

export function buildPairReport(ai: PairReportAI): PairReport {
  return { v: PAIR_REPORT_V, blocks: ai };
}

/** 캐시(JSONB)에서 읽은 값이 현재 포맷의 PairReport 인가. 버전·5블록을 본다. */
export function isPairReport(v: unknown): v is PairReport {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (o.v !== PAIR_REPORT_V) return false;
  const b = o.blocks as Record<string, unknown> | undefined;
  if (!b) return false;
  return BLOCK_KEYS.every((k) => isNonEmptyString(b[k]));
}
