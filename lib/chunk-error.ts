// 배포 스큐(deployment skew) 자활 유틸.
//
// 배포가 나가면 이전 빌드의 청크 파일은 더 이상 서빙되지 않는다. 그때까지 열려 있던 탭이
// 라우트 이동(=클라 컴포넌트 청크 지연 로드)을 하면 죽은 URL 을 요청하고, turbopack 런타임의
// <script> onerror 가 `Failed to load chunk <url> from module <id>` 를 던진다.
// Vercel 이 붙이는 `?dpl=` 은 캐시버스터일 뿐 라우팅 키가 아니다(Skew Protection 을 켜야 라우팅됨).
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

/** 현재 문서의 배포 ID — Next 가 deploymentId 설정 시 <html data-dpl-id> 로 주입한다 */
export function documentDeploymentId(): string | null {
  if (typeof document === "undefined") return null;
  return document.documentElement.dataset.dplId ?? null;
}

const RELOAD_KEY = "byeolkong:chunk_reload";

/**
 * 청크 로드 실패면 하드 리로드로 1회 자활을 시도한다.
 *
 * 루프 방지: 리로드를 시도한 배포 ID 를 sessionStorage 에 남기고, 같은 배포에서는 다시 시도하지 않는다.
 * (리로드로도 안 고쳐졌다 = 스큐가 아니라 현 빌드에 청크가 실제로 없다는 뜻 → 폴백 UI 를 보여주는 게 맞다)
 * 배포 ID 가 바뀌면 = 새 스큐이므로 다시 1회 허용된다.
 *
 * @returns 리로드를 시작했으면 true
 */
export function tryRecoverFromChunkError(error: unknown): boolean {
  if (typeof window === "undefined" || !isChunkLoadError(error)) return false;

  const dpl = documentDeploymentId() ?? "unknown";
  try {
    if (sessionStorage.getItem(RELOAD_KEY) === dpl) return false;
    sessionStorage.setItem(RELOAD_KEY, dpl);
  } catch {
    return false; // sessionStorage 불가(프라이빗 모드 등) = 루프를 막을 수단이 없으니 리로드하지 않는다
  }

  window.location.reload();
  return true;
}
