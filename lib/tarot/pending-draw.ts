// 타로 로그인 전 맛보기 — 뽑은 카드 진행 저장(localStorage). 로그인·결제·'나중에' 왕복 뒤 /tarot/draw 가 복원한다.
// 저장소를 인자로 받는다(유닛 테스트용 가짜 저장소). 화면에선 localStorage 를 넘긴다 — 탭을 닫아도 같은 브라우저면 남게.
// 고민 원문이 기기에 최대 7일 남는다 — 풀이가 시작되거나(goToReading) 로그아웃·탈퇴하면 지운다.
// 스펙: docs/superpowers/specs/2026-10-11-타로-로그인전-맛보기-design.md §5-2
import { EMOTION_OPTIONS, PENDING_KEY, type EmotionTag, type PendingConsultation } from "../emotions.ts";
import { EMOTION_KEY } from "../consultation-entry.ts";
import { SPREAD_INFO, type DrawnCard, type SpreadCategory, type SpreadType } from "./spreads.ts";
import { TAROT_SPREAD_KEY, type TarotSpreadSelection } from "./session.ts";

export const PENDING_DRAW_KEY = "byeolkong:pending_draw";
/** 홈 태그 → 고민 쓰기가 읽는 감정 태그 키 — 정본은 lib/consultation-entry.ts(app/page.tsx·app/concern/page.tsx 와 같은 문자열). 새로 정의하지 않고 그대로 다시 내보낸다 */
export { EMOTION_KEY };
export const PENDING_DRAW_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface PendingDraw {
  v: 1;
  emotion: EmotionTag;
  concern: string;
  spreadType: SpreadType;
  spreadCategory: SpreadCategory;
  /** 메뉴판에서 가격을 보고 고른 선택(lib/tarot/session TarotSpreadSelection.consented) — 로그인 뒤 잔액이 되면 확인 팝업 없이 시작 */
  consented?: boolean;
  drawnCards: DrawnCard[];
  savedAt: number;
}

type ReadStore = Pick<Storage, "getItem" | "removeItem">;

export function savePendingDraw(
  store: Pick<Storage, "setItem">,
  sel: TarotSpreadSelection,
  drawn: DrawnCard[],
  now: number = Date.now()
): void {
  const p: PendingDraw = {
    v: 1,
    emotion: sel.emotion,
    concern: sel.concern,
    spreadType: sel.spreadType,
    spreadCategory: sel.spreadCategory,
    // 동의 표시는 만들지 않고 그대로 옮긴다 — 만드는 곳은 menu-session.ts 하나다(menu-session.test.ts 소스 스캔 계약: 이 파일에 true 리터럴을 쓰면 걸린다)
    ...(sel.consented ? { consented: sel.consented } : {}),
    drawnCards: drawn,
    savedAt: now,
  };
  try {
    store.setItem(PENDING_DRAW_KEY, JSON.stringify(p));
  } catch {
    // 가득 참·차단 — 저장 못 하면 복원도 없다(뽑기 화면이 pending_draw_missing 으로 잰다)
  }
}

function isDrawnCard(c: unknown): c is DrawnCard {
  const o = (c && typeof c === "object" ? c : null) as Record<string, unknown> | null;
  return (
    !!o &&
    typeof o.position === "number" &&
    typeof o.label === "string" &&
    typeof o.card_id === "number" &&
    (o.direction === "upright" || o.direction === "reversed")
  );
}

/** 서버(/api/consultations/tarot VALID_CATEGORIES)가 받는 카테고리 전부 — Record<SpreadCategory, …> 라 카테고리를 더하면 여기서 컴파일이 막힌다 */
const KNOWN_CATEGORIES: Record<SpreadCategory, true> = {
  love: true,
  interpersonal: true,
  career: true,
  decision: true,
  mental: true,
  worry: true,
  default: true,
};

function isPendingDraw(p: unknown): p is PendingDraw {
  const o = (p && typeof p === "object" ? p : null) as Record<string, unknown> | null;
  return (
    !!o &&
    o.v === 1 &&
    typeof o.emotion === "string" &&
    // 현행 감정 태그만 — 풀이 요청 서버(VALID_EMOTIONS)가 현행만 받는다. 이름이 바뀐 뒤 남은 저장(구 태그 포함)을 받으면 로그인·결제를 다 마치고서야 400 으로 막다른 길이 된다.
    // 프로토타입 키("constructor" 등)는 설정 조회에서 죽는다 — getMenu 의 MENU[태그].items 가 TypeError(normalizeEmotionTag 가 LEGACY_EMOTION_TAGS["constructor"] 를 그대로 돌려준다)
    EMOTION_OPTIONS.some((e) => e.tag === o.emotion) &&
    typeof o.concern === "string" &&
    o.concern.length > 0 &&
    typeof o.spreadType === "string" &&
    // 모르는 종류(배포로 이름이 바뀐 뒤 남은 저장·손으로 고친 값)는 거른다 — 복원값을 뽑기 화면이 SPREAD_INFO[…].accent 로 곧장 읽어 죽는다.
    // `in` 이 아니라 hasOwnProperty: `in` 은 "constructor" 같은 프로토타입 키까지 통과시키고 hasOwnProperty 는 막는다(lib/tarot/thresholds.ts 와 같은 관용구)
    Object.prototype.hasOwnProperty.call(SPREAD_INFO, o.spreadType) &&
    typeof o.spreadCategory === "string" &&
    // 카테고리도 같다 — 모르는 이름은 getPositionLabels 의 `|| map.default` 폴백이 받지만 프로토타입 키는 그 폴백을 뚫고 배열이 아닌 값을 돌려준다
    Object.prototype.hasOwnProperty.call(KNOWN_CATEGORIES, o.spreadCategory) &&
    // 동의 표시는 있으면 boolean — 문자열이 truthy 로 복원돼 TarotSpreadSelection.consented?: boolean 타입을 속이지 않게(없는 건 정상: 동의 없이 저장한 판)
    (o.consented === undefined || typeof o.consented === "boolean") &&
    typeof o.savedAt === "number" &&
    Array.isArray(o.drawnCards) &&
    // 뽑은 장수 = 그 스프레드 장수 — 손으로 고친 값·스프레드 정의가 바뀐 뒤 남은 저장이 공개 화면 라벨 수·풀이 요청(서버가 장수를 대조해 400)과 어긋나지 않게. 0장도 이 검사가 거른다
    o.drawnCards.length === SPREAD_INFO[o.spreadType as SpreadType].cardCount &&
    o.drawnCards.every(isDrawnCard)
  );
}

/** 유효하고 7일 안이면 돌려준다. 깨졌거나 만료면 지우고 null. 저장소가 던지면 null. */
export function loadPendingDraw(store: ReadStore, now: number = Date.now()): PendingDraw | null {
  let raw: string | null;
  try {
    raw = store.getItem(PENDING_DRAW_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  if (!isPendingDraw(parsed) || now - parsed.savedAt > PENDING_DRAW_TTL_MS) {
    clearPendingDraw(store);
    return null;
  }
  return parsed;
}

export function clearPendingDraw(store: Pick<Storage, "removeItem">): void {
  try {
    store.removeItem(PENDING_DRAW_KEY);
  } catch {
    // noop
  }
}

/** 같은 판인가 — 이어가기 표시 없이 돌아온 경우(옛 결제 링크 등) 지금 선택과 맞춰 본다 */
export function matchesSelection(
  p: PendingDraw,
  sel: Pick<TarotSpreadSelection, "spreadType" | "concern"> | null
): boolean {
  return !!sel && sel.spreadType === p.spreadType && sel.concern === p.concern;
}

/** 복원 — 기존 화면들이 읽는 sessionStorage 키를 다시 채워 지금 코드 경로를 그대로 탄다(뒤로 가기 → /tarot · /concern 포함). 복원한 선택을 돌려준다 */
export function restoreSession(session: Pick<Storage, "setItem">, p: PendingDraw): TarotSpreadSelection {
  const sel: TarotSpreadSelection = {
    spreadType: p.spreadType,
    spreadCategory: p.spreadCategory,
    emotion: p.emotion,
    concern: p.concern,
    ...(p.consented ? { consented: p.consented } : {}), // 옮기기만 한다(위 savePendingDraw 주석)
  };
  const pending: PendingConsultation = { emotion: p.emotion, concern: p.concern, type: "tarot" };
  session.setItem(EMOTION_KEY, p.emotion);
  session.setItem(PENDING_KEY, JSON.stringify(pending));
  session.setItem(TAROT_SPREAD_KEY, JSON.stringify(sel));
  return sel;
}

/** 이 화면에 돌아온 길 — 로그인 창(login) · 충전(payment) · 홈 '아까 뽑은 카드'(home) */
export type ResumeVia = "login" | "payment" | "home";

export function resumeHref(via: ResumeVia): string {
  return `/tarot/draw?resume=${via}`;
}

export function parseResume(search: string): ResumeVia | null {
  const v = new URLSearchParams(search).get("resume");
  return v === "login" || v === "payment" || v === "home" ? v : null;
}
