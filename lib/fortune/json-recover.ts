// 운세 리포트 JSON 파싱 공용 복구 유틸.
// 모델이 프롬프트의 "줄바꿈 넣지 마" 지시를 어기고 긴 free-text 필드에 escape 안 된
// 실제 개행/탭을 뱉으면 JSON.parse 가 깨진다. 모든 리포트 파서(daily/monthly/saju_full/
// compat/tarot)가 이 복구 단계를 공유해, 리포트 종류가 늘어도 같은 버그가 재발하지 않게 한다.

/**
 * 문자열 리터럴 안의 raw 제어문자 + escape 안 된 내부 큰따옴표를 한 번에 복구한다.
 * 모델이 조언 등에 대화 인용("요즘 어때?")을 escape 없이 넣으면 문자열이 조기 종료돼
 * JSON.parse 가 깨진다("Expected ',' or '}'..."). 내부 따옴표 판별은 look-ahead:
 * 닫는 따옴표라면 그 뒤 첫 non-ws 가 구조 토큰(: , } ])이어야 한다 — 아니면 내용 따옴표로
 * 보고 escape 한다. 정상 JSON 은 그대로 통과(내부 따옴표가 없으므로 분기 안 탐).
 */
export function recoverModelJson(json: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < json.length; i++) {
    const ch = json[i];
    if (escaped) { out += ch; escaped = false; continue; }
    if (ch === "\\") { out += ch; escaped = true; continue; }
    if (!inString) {
      if (ch === '"') { inString = true; }
      out += ch;
      continue;
    }
    // inString
    if (ch === '"') {
      let k = i + 1;
      while (k < json.length && (json[k] === " " || json[k] === "\n" || json[k] === "\r" || json[k] === "\t")) k++;
      const nxt = json[k];
      if (nxt === undefined || nxt === ":" || nxt === "," || nxt === "}" || nxt === "]") {
        out += '"';
        inString = false;
      } else {
        out += '\\"'; // 내용 따옴표 — escape 하고 문자열 계속
      }
      continue;
    }
    if (ch === "\n") { out += "\\n"; continue; }
    if (ch === "\r") { out += "\\r"; continue; }
    if (ch === "\t") { out += "\\t"; continue; }
    if (ch.charCodeAt(0) < 0x20) { out += "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0"); continue; }
    out += ch;
  }
  return out;
}

/**
 * AI 원문에서 첫 '{' ~ 마지막 '}' 를 잘라 파싱한다(코드펜스/잡텍스트 허용).
 * 1차 실패 시 문자열 안 raw 제어문자·내부 따옴표를 복구해 재파싱. 그래도 실패면 null.
 * 반환은 검증 전 raw 객체 — 필드 검증은 각 파서가 담당한다.
 */
export function parseReportJson(raw: string): Record<string, unknown> | null {
  if (typeof raw !== "string") return null;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;

  const slice = raw.slice(start, end + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(slice);
  } catch {
    try {
      parsed = JSON.parse(recoverModelJson(slice));
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object") return null;
  return parsed as Record<string, unknown>;
}
