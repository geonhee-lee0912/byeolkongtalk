// 앱 화면 동작 판단(순수) — 안드로이드 뒤로 버튼과 아이폰 당겨서 새로고침. 스펙 2026-11-07-앱-화면 §5 ④ · §7.
// 루트 node --test 가 이 파일을 돌린다 — react-native·expo import 금지(웹↔앱 공용 약속 lib/app-bridge/protocol.ts 만 가져온다).
import { isAppTabRoot } from "../../lib/app-bridge/protocol.ts";
import { isOurUrl, pathOf, splitUrl } from "./urls.ts";

export type BackDecision = "consume" | "sendBack" | "goBack" | "exit";

/** 안드로이드 뒤로 버튼 — BackHandler 는 바로 답해야 해서 웹에 물어볼 수 없다. 웹이 미리 알린 겹창 상태(ui.overlay)로 정한다.
 *  consume = 아무것도 안 하고 소비(로그인 마무리 덮개 중) · sendBack = 웹에 ui.back(맨 위 겹창 닫기)
 *  goBack = 웹뷰 뒤로 · exit = OS 기본(앱 닫기). 겹창이 열려 있으면 웹뷰 뒤로는 가지 않는다(기록으로 닫는 시트가 두 칸 뒤로 가지 않게) */
export function decideAndroidBack(s: { covering: boolean; overlayOpen: boolean; canGoBack: boolean }): BackDecision {
  if (s.covering) return "consume";
  if (s.overlayOpen) return "sendBack";
  if (s.canGoBack) return "goBack";
  return "exit";
}

/** 아이폰 웹뷰 기본 당겨서 새로고침을 켤 주소인가 — 우리 사이트의 탭 첫 화면 5개만 */
export function iosPullEnabled(url: string, baseUrl: string): boolean {
  if (!isOurUrl(url, baseUrl)) return false;
  return isAppTabRoot(pathOf(splitUrl(url)?.rest ?? ""));
}

/** onLoadStart 뒤의 겹창 열림 상태 — 새 문서를 읽기 시작할 때만 닫힘으로 되돌린다(새 문서엔 겹창이 없다).
 *  안드로이드 웹뷰는 onLoadStart 를 기록이 바뀔 때마다 보낸다(react-native-webview 14 RNCWebViewClient.doUpdateVisitedHistory —
 *  시트의 pushState·replaceState·뒤로 포함). loading 은 progress != 100 이라 다 읽힌 페이지 안의 기록 변경은 false 로 온다.
 *  매번 되돌리면 별 확인 위에 별 충전(pushState)이 열린 뒤 뒤로 두 번째에 확인창이 떠 있는데 페이지가 뒤로 갔다(4단계 최종 리뷰) */
export function overlayAfterLoadStart(current: boolean, e: { loading: boolean }): boolean {
  return e.loading ? false : current;
}
