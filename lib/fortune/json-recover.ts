// 운세 리포트 JSON 파싱 공용 복구 유틸.
// 모델이 프롬프트의 "줄바꿈 넣지 마" 지시를 어기고 긴 free-text 필드에 escape 안 된
// 실제 개행/탭을 뱉으면 JSON.parse 가 깨진다. 모든 리포트 파서(daily/monthly/saju_full/
// compat/tarot)가 이 복구 단계를 공유해, 리포트 종류가 늘어도 같은 버그가 재발하지 않게 한다.

/**
 * 문자열 리터럴 안의 raw 제어문자(개행·탭)를 escape 시퀀스로 바꾼다.
 * 문자열 밖(구조)의 개행/공백은 건드리지 않으므로 정상 JSON 은 그대로 통과한다.
 */
export function escapeRawControlCharsInStrings(json: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (const ch of json) {
    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      out += ch;
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      out += ch;
      continue;
    }
    if (inString) {
      if (ch === "\n") { out += "\\n"; continue; }
      if (ch === "\r") { out += "\\r"; continue; }
      if (ch === "\t") { out += "\\t"; continue; }
    }
    out += ch;
  }
  return out;
}

/**
 * AI 원문에서 첫 '{' ~ 마지막 '}' 를 잘라 파싱한다(코드펜스/잡텍스트 허용).
 * 1차 실패 시 문자열 안 raw 제어문자를 복구해 재파싱. 그래도 실패면 null.
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
      parsed = JSON.parse(escapeRawControlCharsInStrings(slice));
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object") return null;
  return parsed as Record<string, unknown>;
}
