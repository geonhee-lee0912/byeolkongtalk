// 배포 스큐(deployment skew) 자활 유틸.
//
// 배포가 나가면 이전 빌드의 청크 파일은 더 이상 서빙되지 않는다. 그때까지 열려 있던 탭이
// 라우트 이동(=클라 컴포넌트 청크 지연 로드)을 하면 죽은 URL 을 요청하고, turbopack 런타임의
// <script> onerror 가 `Failed to load chunk <url> from module <id>` 를 던진다.
// Vercel 이 붙이는 `?dpl=` 은 캐시버스터일 뿐 라우팅 키가 아니다(Skew Protection 을 켜야 라우팅됨).
// 2026-07-28 prod 실측: 죽은 청크는 옛 dpl 이든 현재 dpl 이든 404 → `?dpl=` 라우팅 안 됨 확인.
//
// 이 상태는 reset() 으로 못 고친다 — 같은 런타임이 같은 죽은 URL 을 다시 요청할 뿐이다.
// 유일한 복구는 하드 리로드(새 HTML → 새 청크 URL)다.

const CHUNK_ERROR_RE =
  /Failed to load chunk|ChunkLoadError|Loading chunk [\w-]+ failed|Loading CSS chunk|Failed to fetch dynamically imported module/i;

/** 번들 청크를 못 받아서 난 에러인가 (앱 로직 에러와 구분) */
export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  if (typeof error === "string") return CHUNK_ERROR_RE.test(error);
  const { name, message } = error as { name?: unknown; message?: unknown };
  return CHUNK_ERROR_RE.test(
    `${typeof name === "string" ? name : ""} ${typeof message === "string" ? message : ""}`,
  );
}

/**
 * 실패한 청크 URL 에 박혀 있는 배포 ID (`?dpl=...`) — 즉 **이 탭이 띄운 빌드**의 ID.
 *
 * ⚠️ `document.documentElement.dataset.dplId` 로는 얻을 수 없다. next 런타임
 * (`shared/lib/deployment-id.js`)이 모듈 초기화 시점에 그 속성을 읽고 즉시 `delete` 해서,
 * 앱 코드가 도는 시점엔 DOM 에 이미 없다(raw HTML 에만 있음, 2026-07-28 prod 실측).
 * 그래서 배포 ID 는 에러 메시지에서 뽑는다 — 설정에 의존하지 않는 유일한 경로.
 *
 * 트리아지: 이 값이 현재 prod 배포 ID 와 **다르면** 스큐(정상, 탭이 낡음),
 * **같으면** 현 빌드에 청크가 실제로 없는 것(= 진짜 버그).
 */
export function chunkErrorDeploymentId(error: unknown): string | null {
  const message =
    typeof error === "string"
      ? error
      : typeof (error as { message?: unknown })?.message === "string"
        ? ((error as { message: string }).message)
        : "";
  return /[?&]dpl=([A-Za-z0-9_-]+)/.exec(message)?.[1] ?? null;
}

const RELOAD_KEY = "byeolkong:chunk_reload";
/** 리로드 직후 재발 = 리로드로 안 고쳐진다는 뜻 → 이 창 안에서는 재시도 안 함 */
const REARM_MS = 60_000;
/** 시간이 지나도 한 세션에서 무한 자활은 금지 */
const MAX_ATTEMPTS = 3;

/**
 * 청크 로드 실패면 하드 리로드로 자활을 시도한다.
 *
 * 루프 방지는 **시각 기준**이다. 직전 시도가 REARM_MS 안이면 재시도하지 않고
 * (리로드로 안 고쳐진 것 → 폴백 UI 가 맞다), 그보다 오래 지났으면 새로운 스큐로 보고
 * 다시 1회 허용한다. 세션 누적 MAX_ATTEMPTS 회가 상한.
 *
 * 배포 ID 를 키로 쓰지 않는 이유: 클라이언트에서 현재 배포 ID 를 알 방법이 없다
 * (위 `chunkErrorDeploymentId` 주석 참고). 그걸 키로 쓰면 값이 항상 상수가 되어
 * "세션당 1회"로 조용히 잠긴다 — 2026-07-28 재발의 원인이었다.
 *
 * @returns 리로드를 시작했으면 true
 */
export function tryRecoverFromChunkError(error: unknown): boolean {
  if (typeof window === "undefined" || !isChunkLoadError(error)) return false;

  const now = Date.now();
  try {
    const prev = sessionStorage.getItem(RELOAD_KEY);
    const { at = 0, n = 0 } = prev
      ? (JSON.parse(prev) as { at?: number; n?: number })
      : {};

    if (n >= MAX_ATTEMPTS) return false;
    if (now - at < REARM_MS) return false;

    sessionStorage.setItem(RELOAD_KEY, JSON.stringify({ at: now, n: n + 1 }));
  } catch {
    return false; // sessionStorage 불가(프라이빗 모드 등) = 루프를 막을 수단이 없으니 리로드하지 않는다
  }

  window.location.reload();
  return true;
}
