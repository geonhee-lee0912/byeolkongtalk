// lib/push/unsub-view.ts — 광고 수신거부 화면(/push/unsubscribe)의 결과별 글과 버튼(순수 · 클라 세이프).
// 디자인 다듬기 수신거부 U1(운영자 11-22 '조금 더 성의 있게'): 별콩이 · 제목 · 설명 · (처리 내역) · 주 버튼 · 글자 버튼.
// 처리됨 설명에 '안내 알림은 그대로 간다'를 둔다 — 광고만 끈 거라 다시 볼 날 같은 정보성 알림은 계속 온다(앱 알림 설계 §3).
export type UnsubKind = "working" | "done" | "used" | "bad" | "error";
export type UnsubAction = "home" | "settings" | "retry";

export interface UnsubCopy {
  title: string;
  sub: string;
  /** 처리 내역(법정 통지와 같은 줄)을 화면에도 남길지 */
  showNotice: boolean;
  primary: UnsubAction | null;
  secondary: UnsubAction | null;
}

/** hasNotice — 이번에 실제로 철회됐는가(서버가 결과 통지를 돌려줬는가). 처리됐는데 통지가 없으면 원래 꺼져 있던 것 */
export function unsubCopy(kind: UnsubKind, hasNotice: boolean): UnsubCopy {
  switch (kind) {
    case "working":
      return { title: "수신거부 처리 중이야", sub: "잠깐만 기다려 줘.", showNotice: false, primary: null, secondary: null };
    case "done":
      return hasNotice
        ? {
            title: "광고 알림을 껐어",
            sub: "앞으로 광고 알림은 보내지 않을게.\n다시 볼 날처럼 네가 정한 안내 알림은 그대로 가.",
            showNotice: true,
            primary: "home",
            secondary: "settings",
          }
        : { title: "이미 꺼져 있어", sub: "광고 알림은 지금도 보내지 않고 있어.", showNotice: false, primary: "home", secondary: "settings" };
    case "used":
      return {
        title: "이미 처리됐어",
        sub: "이 알림의 수신거부는 전에 한 번 눌러서 끝났어.\n지금 상태는 알림 설정에서 볼 수 있어.",
        showNotice: false,
        primary: "home",
        secondary: "settings",
      };
    case "bad":
      return { title: "이 링크로는 처리할 수 없어", sub: "알림 설정에서 광고 알림을 바로 끌 수 있어.", showNotice: false, primary: "settings", secondary: "home" };
    case "error":
      return { title: "잠깐 문제가 생겼어", sub: "인터넷 연결을 확인하고 다시 해 줄래?", showNotice: false, primary: "retry", secondary: "settings" };
  }
}
