import type { AppInfo } from "../app-bridge/protocol.ts";

/** Meta 픽셀을 불러도 되는지 — 앱이 아니라고 확인된 브라우저에서만.
 *  앱(웹뷰) 안에서는 광고 측정이 애플 기준 ATT 없는 '추적'이라 부르지 않는다(5.1.2, 운영자 결정 2026-11-23).
 *  앱인지 아직 모르는 하이드레이션 첫 그림(ready=false)에도 부르지 않는다 — 앱에서 한 번이라도 나가지 않게 */
export function pixelAllowed(state: { ready: boolean; app: AppInfo | null }): boolean {
  return state.ready && state.app === null;
}
