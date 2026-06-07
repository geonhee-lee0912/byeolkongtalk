// 타로 운세 리포트 JSON 파싱/직렬화. compat-report.ts와 동일 패턴.
// 저장 형식: messages.content 에 JSON 문자열, v:1.

export interface TarotReportCardAI {
  position: string;
  cardName: string;
  direction: "upright" | "reversed";
  reading: string;
}

export interface TarotReportAI {
  headline: string;
  cards: TarotReportCardAI[];
  summary: string;
  advice: string;
}

export interface TarotReport extends TarotReportAI {
  v: 1;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * AI가 echo 하는 direction은 비권위적(화면은 서버 truth drawnCards.direction을 쓴다).
 * 모델이 주입 카드의 한글 표기("정방향")를 그대로 뱉어도 파싱이 실패하지 않도록 정규화한다.
 * 알 수 없는 값은 정방향으로 폴백 — 이 필드 하나 때문에 리포트 전체를 버리지 않는다.
 */
function normalizeDirection(v: unknown): "upright" | "reversed" {
  if (v === "reversed" || v === "역방향") return "reversed";
  return "upright";
}

/**
 * AI 원문에서 JSON 본문을 잘라 파싱한다. 형식이 어긋나면 null.
 */
export function parseTarotReportJson(raw: string): TarotReportAI | null {
  if (typeof raw !== "string") return null;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const o = parsed as Record<string, unknown>;

  if (!isNonEmptyString(o.headline)) return null;
  if (!isNonEmptyString(o.summary)) return null;
  if (!isNonEmptyString(o.advice)) return null;
  if (!Array.isArray(o.cards) || o.cards.length === 0) return null;

  const cards: TarotReportCardAI[] = [];
  for (const c of o.cards) {
    if (typeof c !== "object" || c === null) return null;
    const cc = c as Record<string, unknown>;
    if (!isNonEmptyString(cc.position)) return null;
    if (!isNonEmptyString(cc.cardName)) return null;
    if (!isNonEmptyString(cc.reading)) return null;
    cards.push({
      position: cc.position.trim(),
      cardName: cc.cardName.trim(),
      direction: normalizeDirection(cc.direction),
      reading: cc.reading.trim(),
    });
  }

  return {
    headline: o.headline.trim(),
    cards,
    summary: o.summary.trim(),
    advice: o.advice.trim(),
  };
}

export function buildTarotReport(ai: TarotReportAI): TarotReport {
  return { v: 1, ...ai };
}

export function serializeTarotReport(report: TarotReport): string {
  return JSON.stringify(report);
}

/**
 * 저장된 content 문자열을 TarotReport로 복원. 실패 시 null.
 */
export function tryParseStoredTarotReport(content: string): TarotReport | null {
  if (typeof content !== "string") return null;
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("{")) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const o = parsed as Record<string, unknown>;
  if (o.v !== 1) return null;
  const ai = parseTarotReportJson(JSON.stringify(o));
  if (!ai) return null;
  return { v: 1, ...ai };
}
