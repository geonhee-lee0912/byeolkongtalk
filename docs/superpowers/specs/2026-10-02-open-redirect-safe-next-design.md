# 오픈 리다이렉트 수정 — 공용 내부경로 검증기 (`safeInternalPath`)

> 2026-10-02. 로그인 `next`·결제 `returnTo` 등 "내부 경로로만 돌아가야 하는" 리다이렉트 값의
> 오픈 리다이렉트 결함을 공용 헬퍼 하나로 닫는다. 범위 C(결함 식 전부 제거 + 회귀 잠금).

## 문제

가드 식 `v.startsWith("/") && !v.startsWith("//")` 가 **파서 규칙을 문자열 검사로 흉내 내다가** 빠진 구멍이 있다. 브라우저·`new URL`·Next 라우터는 백슬래시·탭/개행·dot-segment 를 정규화하는데, 이 문자열 검사는 그걸 모른다.

### 실측 재현 (2026-10-02, dev 서버 `localhost:3001` + 브라우저. 목적지는 예약 도메인 `example.com`)

| 경로 | 피해자 | 동작 | 결과 | 확인 |
|---|---|---|---|---|
| **V1** `/api/auth/login/kakao` → `/api/auth/kakao` | 비로그인 | 카카오 버튼 | `state` 에 `/\example.com` 무검증 적재 → 콜백 리다이렉트에 전파 | curl, 실서버 |
| **V2** `/login` 페이지 | **이미 로그인** | **클릭 0회**(링크만 열면) | `router.replace("/\\example.com")` → `https://example.com/` 하드 이동 | 브라우저, host 변경 |
| **V3** `/shop?status=fail&returnTo=…` | 로그인 | "대화로 돌아가기" 1클릭 | `https://example.com/` 이동 | 브라우저, host 변경 |

- 현행 가드가 **통과시키는** 외부행 입력: `/\x`(`%2F%5C`), `/<TAB>/x`, `/<LF>/x`, `/\/x`.
- 현행 가드가 **막는데** 설계상 막혀야 할 것: `//x`, `\x`, 절대 URL, `javascript:`, 빈 값, 앞 공백.
- 🔴 **고치다 생길 수 있는 회귀**: `/.//x`·`/%2e//x`·`/a/..//x` 는 현행 가드에선 same-origin 경로(`//x`)로 **안전**한데, "정규화 후 pathname 반환" naive 수정은 이를 `//x` → `https://x/` 로 만들어 **새 구멍**이 된다. → 헬퍼는 정규화 결과를 한 번 더 파싱해 이를 막는다.

## 헬퍼 설계 — 방안 1 (URL 파서 + 재검증)

`lib/safe-internal-path.ts` (서버·클라 공용 순수 함수, env 의존 없음):

```ts
const PROBE = "https://byeolkong.invalid";

function parseOk(raw: string): string | null {
  if (typeof raw !== "string" || !raw.startsWith("/")) return null;
  let u: URL;
  try { u = new URL(raw, PROBE); } catch { return null; }
  if (u.origin !== PROBE) return null;        // //, /\, /<tab>/ 등 authority 탈출 차단
  return u.pathname + u.search + u.hash;
}

/** 통과하면 origin 을 뗀 내부 경로(정규화됨), 아니면 null. */
export function safeInternalPath(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const once = parseOk(raw);
  if (once == null) return null;
  const twice = parseOk(once);                // 정규화 결과(`/.//x`→`//x`)의 2차 탈출 차단
  if (twice == null || twice !== once) return null;
  return once;
}

/** next 전용 — 실패 시 홈. */
export function safeNextPath(raw: string | null | undefined): string {
  return safeInternalPath(raw) ?? "/";
}
```

**판정 4단계**: ①`/` 로 시작 안 하면 거부(절대 URL·`javascript:`·빈 값·앞 공백·`\x`) → ②가상 origin 기준 파싱, throw 하거나 origin 바뀌면 거부(`//`·`/\`·`/<tab>/`) → ③정규화 결과를 다시 파싱(`/.//x`→`//x` 재탈출 차단) → ④통과 시 `pathname+search+hash`, 아니면 `null`.

**원 제안과 다른 점**: (a) 반환을 `string|null` 로 — 결제/start 는 실패 시 "/"가 아니라 "이동 안 함"이어야 함. 로그인은 `safeNextPath` 로 `?? "/"`. (b) `baseUrl` 인자 제거 — `/` 입력만 받으므로 기준 origin 무관, env 없는 호출처(클라·로그인 라우트)도 동일 사용. (c) 2차 파싱 추가 — 위 회귀 차단.

**트레이드오프**: 출력이 정규화된다(한글 경로 → 퍼센트 인코딩). 가리키는 곳은 동일. same-origin 절대 URL 도 거부 → "내부 상대경로만" 원칙은 현행과 동일.

검증: 23개 케이스(재현 4 + `%5C`/`%09`/`%0A`/`javascript:`/절대URL/빈값/`/\/` 변형 + dot-segment + 쿼리·해시 보존 + null/undefined) 전부 통과(scratchpad 로직 검증 완료, 구현 시 유닛으로 고정).

## 적용 지점 (7파일, 범위 C)

| # | 파일:라인 | 값 출처 | 교체 |
|---|---|---|---|
| 1 | `app/api/auth/login/kakao/route.ts:16-17` | 쿼리 `next`(공격자) | `safeNextPath(rawNext)` |
| 2 | `app/api/auth/kakao/route.ts:37-38` | state `next`(공격자) | `safeNextPath(stateNext)`; `:78`·`:223` 의 `next.startsWith("/")?next:"/"` 는 `next` 로 단순화(이미 안전) |
| 3 | `app/login/page.tsx:25-26`·`:47` | 쿼리 `next`(공격자) | `safeNextPath(rawNext)`; kakaoHref 용 `next` 도 `safeNextPath` |
| 4 | `lib/use-toss-payment.ts:99-104`·`:112` | opts.returnTo | `safeInternalPath` → null 이면 파라미터 생략 |
| 5 | `app/shop/page.tsx:156-162` | 쿼리 returnTo(공격자) | `safeInternalPath` → null 이면 기본 경로 |
| 6 | `app/shop/page.tsx:302-308` | 쿼리 returnTo(공격자) | `safeInternalPath` → null 이면 버튼 숨김 |
| 7 | `app/start/page.tsx:118-124` | sessionStorage href | `safeInternalPath` → null 이면 push 안 함 |

4·7 은 현재 공격자가 값을 못 넣지만(내부 값), 결함 식을 **다음 코드의 본보기로 남기지 않기 위해** 같이 바꾼다.

## 회귀 잠금 (계약 테스트)

1. `lib/safe-internal-path.test.ts` — 헬퍼 동작 계약(위 23케이스).
2. `lib/no-open-redirect-guard.test.ts` — `app/`·`lib/` 소스에서 안티패턴 `startsWith("//")` 가 **헬퍼 파일 밖에 0건**임을 단언. 복붙으로 결함 식이 되살아나는 걸 막는다.

## 테스트 방식

- TDD: `node --import tsx --test`(기존 `lib/*.test.ts` 관례), 테스트는 `.ts` 확장자로 import.
- dev 실물: 수정 후 V1(curl)·V2·V3(브라우저 세션주입, QA봇 센티넬 `11111111-…`)을 재실행해 **전부 `example.com` 미도달 + 내부 경로 정상 복귀** 확인.
- 실제 카카오 왕복은 dev 사이트에서(로컬 `KAKAO_REDIRECT_URI` 가 `dev.byeolkongtalk.com` 고정이라 push 후 확인).

## 범위 밖 (별건, 이번 커밋 아님 — 사용자 결정 대기)

세션 점검에서 나온 것들: 서명 없는 `byeolkong_user_id`(설계상 의도), popups 필터 주입(`app/api/popups/route.ts:18`), 토스 customerKey=user_id 원문, localStorage id 사본, anon RLS 실호출 확인. 공개 리포 PAT 는 폐기 완료.

## 주의

- 같은 워킹트리를 다른 세션이 동시 사용 → `git add -A`·`--amend` 금지, 자기 파일만 경로 명시 커밋.
- AGENTS.md OAuth 절(state nonce·open redirect 방지)과 정합 — 이 수정은 그 "open redirect 방지"를 실제로 구현하는 것.
