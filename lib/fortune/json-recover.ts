// 운세 리포트 JSON 파싱 공용 복구 유틸.
// 모델이 프롬프트의 "줄바꿈 넣지 마" 지시를 어기고 긴 free-text 필드에 escape 안 된
// 실제 개행/탭을 뱉으면 JSON.parse 가 깨진다. 모든 리포트 파서(daily/monthly/saju_full/
// compat/tarot)가 이 복구 단계를 공유해, 리포트 종류가 늘어도 같은 버그가 재발하지 않게 한다.
//
// 2026-08-13 하드닝: 절단이 아니라 "모델이 JSON 형식 자체를 위반"하는 3개 패턴을 추가로
// 복구한다 — (1) 문자열 값 뒤에 짝 안 맞는 ']'/'}' 가 끼어드는 stray bracket, (2) 객체/배열
// 끝 직전의 trailing comma, (3) 모델이 한 번 잘못 뱉고 "**수정본**" 같은 텍스트 뒤에 두 번째
// 객체를 다시 뱉는 correction 재출력. 전부 string-aware 스캔 — 문자열 값 "안"의 내용은
// 절대 구조 토큰으로 오인하지 않는다. 절단(truncation)은 이 유틸의 책임이 아니다 — 최상위
// 객체가 끝까지 안 닫히면 그 후보는 채택하지 않고 null 을 반환한다(가짜 완성 금지).

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

/** 문자열 안 j 위치의 '"' 가 진짜 닫는 따옴표인지 look-ahead 로 판별(recoverModelJson과 동일 기준). */
function isRealClosingQuote(s: string, j: number): boolean {
  let k = j + 1;
  while (k < s.length && (s[k] === " " || s[k] === "\n" || s[k] === "\r" || s[k] === "\t")) k++;
  const nxt = s[k];
  return nxt === undefined || nxt === ":" || nxt === "," || nxt === "}" || nxt === "]";
}

/**
 * raw 안에서 최상위 '{...}' 객체를 등장 순서대로 전부 찾아 반환한다(string-aware — 문자열
 * 값 내부의 '{'/'}'/'['/']' 는 절대 구조로 세지 않는다). 스캔 중 지금 열려 있는 컨테이너와
 * 안 맞는 닫는 괄호(예: 객체 안인데 ']' 가 나오는 stray bracket, 패턴 1)를 만나면 버린다 —
 * 정상 JSON 이라면 여는 괄호와 항상 짝이 맞으므로 이 분기는 이미 깨진 입력에서만 발동해
 * 안전하다(정상 입력은 절대 이 분기를 타지 않음). 최상위 객체가 끝까지 안 닫히면(절단)
 * 후보로 채택하지 않는다 — 가짜 완성을 만들지 않는다.
 * "correction 재출력"(패턴 3)처럼 같은 텍스트에 완결된 객체가 여러 번 나오면 전부 담아
 * 순서대로 반환 — 어느 걸 쓸지는 호출부(parseReportJson)가 파싱 성공 여부로 판단한다.
 */
function extractTopLevelObjects(raw: string): string[] {
  const results: string[] = [];
  const n = raw.length;
  let i = 0;
  while (i < n) {
    const openIdx = raw.indexOf("{", i);
    if (openIdx < 0) break;

    let out = "";
    let inString = false;
    let escaped = false;
    const stack: string[] = [];
    let j = openIdx;
    let closed = false;
    for (; j < n; j++) {
      const ch = raw[j];
      if (escaped) { out += ch; escaped = false; continue; }
      if (ch === "\\") { out += ch; escaped = true; continue; }
      if (inString) {
        if (ch === '"') {
          out += ch;
          if (isRealClosingQuote(raw, j)) inString = false;
        } else {
          out += ch;
        }
        continue;
      }
      if (ch === '"') { inString = true; out += ch; continue; }
      if (ch === "{" || ch === "[") { stack.push(ch); out += ch; continue; }
      if (ch === "}" || ch === "]") {
        const want = ch === "}" ? "{" : "[";
        if (stack[stack.length - 1] === want) {
          stack.pop();
          out += ch;
          if (stack.length === 0) { j++; closed = true; break; } // 최상위 객체 완결
          continue;
        }
        continue; // 짝 안 맞는 닫는 괄호 — stray, 버림
      }
      out += ch;
    }
    if (closed) {
      results.push(out);
      i = j;
    } else {
      i = openIdx + 1; // 못 닫혔으면(절단) 이 후보는 버리고 다음 '{' 부터 재시도
    }
  }
  return results;
}

/**
 * 최상위(문자열 밖) 콤마 중 뒤에(공백 무시) '}' 나 ']' 가 오는 trailing comma 를 제거한다.
 * string-aware — 문자열 값 안의 콤마는 애초에 이 분기를 안 탄다(inString 이면 그대로 통과).
 */
function stripTrailingCommas(json: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < json.length; i++) {
    const ch = json[i];
    if (escaped) { out += ch; escaped = false; continue; }
    if (ch === "\\") { out += ch; escaped = true; continue; }
    if (inString) {
      out += ch;
      if (ch === '"' && isRealClosingQuote(json, i)) inString = false;
      continue;
    }
    if (ch === '"') { inString = true; out += ch; continue; }
    if (ch === ",") {
      let k = i + 1;
      while (k < json.length && (json[k] === " " || json[k] === "\n" || json[k] === "\r" || json[k] === "\t")) k++;
      if (json[k] === "}" || json[k] === "]") continue; // trailing comma — 버림
    }
    out += ch;
  }
  return out;
}

/**
 * AI 원문에서 최상위 JSON 객체를 찾아 파싱한다(코드펜스/잡텍스트 허용). string-aware 로
 * 최상위 '{...}' 후보를 등장 순서대로 찾고(문자열 내부는 구조로 안 셈 + 짝 안 맞는 닫는
 * 괄호는 stray 로 보고 제거 — 패턴 1), 후보마다 "원본 → recoverModelJson → trailing comma
 * 제거 → 둘 다" 순서로 시도해 가장 먼저 성공하는(그리고 빈 객체가 아닌) 결과를 쓴다.
 * "correction 재출력"(패턴 3)처럼 같은 텍스트에 완결된 객체가 여러 번 나오면, 앞 객체가
 * 전부 실패할 때만 다음 객체로 넘어간다. 전부 실패하면 null(→ 상위에서 재시도) — 애매한
 * 복구를 강제하는 것보다 안전하다.
 * 반환은 검증 전 raw 객체 — 필드 검증은 각 파서가 담당한다.
 */
export function parseReportJson(raw: string): Record<string, unknown> | null {
  if (typeof raw !== "string") return null;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;

  for (const candidate of extractTopLevelObjects(raw)) {
    const attempts = [
      candidate,
      recoverModelJson(candidate),
      stripTrailingCommas(candidate),
      stripTrailingCommas(recoverModelJson(candidate)),
    ];
    for (const attempt of attempts) {
      try {
        const parsed: unknown = JSON.parse(attempt);
        if (parsed && typeof parsed === "object" && Object.keys(parsed).length > 0) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        // 다음 시도로
      }
    }
  }
  return null;
}
