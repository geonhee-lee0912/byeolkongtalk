// 오픈 리다이렉트 방어 — 로그인 next·결제 returnTo 등 "내부 경로로만 돌아가야 하는"
// 리다이렉트 값의 공용 검증기. 서버·클라 공용 순수 함수(env 의존 없음).
//
// 왜 접두사 문자열 검사가 아니라 URL 파서인가:
// sink(서버 new URL / 클라 router.replace)가 백슬래시·탭/개행·dot-segment 를 정규화한다.
// 같은 파서로 판정해야 "검사는 통과했는데 실제로는 외부로 나가는" 구멍이 구조적으로 막힌다.
// 2차 파싱은 정규화 결과(`/.//x` → `//x`)가 다시 authority 로 해석되는 재탈출을 막는다.

const PROBE_ORIGIN = "https://byeolkong.invalid";

function parseOk(raw: string): string | null {
  if (typeof raw !== "string" || !raw.startsWith("/")) return null;
  let u: URL;
  try {
    u = new URL(raw, PROBE_ORIGIN);
  } catch {
    return null;
  }
  // //x, /\x, /<tab>/x 등은 authority(호스트)로 해석돼 origin 이 바뀐다 → 거부
  if (u.origin !== PROBE_ORIGIN) return null;
  return u.pathname + u.search + u.hash;
}

/**
 * 통과하면 origin 을 뗀 내부 경로(정규화됨), 아니면 null.
 * null 은 "안전한 목적지가 아님" — 호출처가 이동 안 함/기본값/버튼 숨김 등으로 처리.
 */
export function safeInternalPath(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const once = parseOk(raw);
  if (once == null) return null;
  const twice = parseOk(once);
  if (twice == null || twice !== once) return null;
  return once;
}

/** next 전용 래퍼 — 안전하지 않으면 홈("/"). */
export function safeNextPath(raw: string | null | undefined): string {
  return safeInternalPath(raw) ?? "/";
}
