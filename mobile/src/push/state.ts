// 알림 권한·알림 data 읽기 — 순수 함수(테스트 state.test.ts). 루트 node --test 가 돌린다 — react-native·expo import 금지.
// OS 호출은 register.ts.
import type { PushState } from "../../../lib/app-bridge/protocol.ts";
import { safeAppPath } from "../urls.ts";

/** OS 권한 → 웹에 알릴 상태. denied 라도 다시 물을 수 있으면(안드로이드 첫 거부) undetermined — 웹이 '알림 받을래'로 다시 물을 수 있게.
 *  다시 못 묻는 거부만 denied(웹은 설정 열기로 안내한다) */
export function toPushState(p: { status: "granted" | "denied" | "undetermined"; canAskAgain: boolean }): PushState {
  if (p.status === "granted") return "granted";
  if (p.status === "denied" && !p.canAskAgain) return "denied";
  return "undetermined";
}

/** 알림 data → 웹뷰가 열 내부 경로. 우리 경로(/ 로 시작, // 아님)만 — 딥링크와 같은 검사(safeAppPath)를 쓴다 */
export function pathFromNotificationData(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const path = (data as Record<string, unknown>).path;
  return typeof path === "string" ? safeAppPath(path) : null;
}
