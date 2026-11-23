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

/** 광고 알림의 [수신거부] 버튼 — 서버(lib/push/dispatch.ts)가 categoryId "ad" 에 싣는 버튼과 같은 이름 */
export const UNSUBSCRIBE_ACTION = "unsubscribe";
/** 수신거부 표 모양 — 서버 lib/push/unsub-token.ts 와 같다(v1.<발송 번호>.<서명 22자>) */
const UNSUB_RE = /^v1\.[1-9][0-9]{0,15}\.[A-Za-z0-9_-]{22}$/;

/** 알림 누름 → 웹뷰가 열 경로. 본문 누름(기본 동작)은 data.path, [수신거부] 버튼은 수신거부 화면(로그인 없이 표로 철회, 설계 §4-7).
 *  다른 버튼·모양이 틀린 표는 null */
export function pathFromNotificationResponse(actionId: string, defaultActionId: string, data: unknown): string | null {
  if (actionId === defaultActionId) return pathFromNotificationData(data);
  if (actionId !== UNSUBSCRIBE_ACTION || !data || typeof data !== "object") return null;
  const unsub = (data as Record<string, unknown>).unsub;
  return typeof unsub === "string" && UNSUB_RE.test(unsub) ? `/push/unsubscribe#t=${unsub}` : null;
}
