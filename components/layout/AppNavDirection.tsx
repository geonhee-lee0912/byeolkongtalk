"use client";

// 앱 화면 전환 방향을 <html data-nav> 에 적는다 — 화면에 아무것도 그리지 않는다. 앱 안에서만 리스너를 붙인다.
// 링크 클릭(캡처 단계 — Next Link 의 이동보다 먼저)·기록 뒤로(popstate — Next 의 트랜지션보다 먼저)에 값을 넣고, 화면이 바뀐 뒤 지운다.
// 값이 없으면 app/globals.css 가 애니메이션을 끈다. 판정은 lib/app-shell/nav-direction.ts. 스펙 2026-11-07-앱-화면 §6
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAppInfo } from "@/lib/use-app-info";
import { navKindForClick, navKindForPopstate, takeBackButton, type NavKind } from "@/lib/app-shell/nav-direction";

/** 화면이 바뀐 뒤 data-nav 를 지우기까지 — 전환 애니메이션(최대 0.35초)이 끝날 만큼 */
const CLEAR_AFTER_NAV_MS = 600;
/** 값을 넣었는데 화면이 안 바뀌었을 때(이동이 막힌 링크 등) 지우기까지 — 남아 있으면 다음 화면 안 트랜지션이 미끄러진다 */
const CLEAR_IF_STUCK_MS = 3_000;

let clearTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleClear(ms: number) {
  if (clearTimer) clearTimeout(clearTimer);
  clearTimer = setTimeout(() => {
    delete document.documentElement.dataset.nav;
    clearTimer = null;
  }, ms);
}

function setNav(kind: NavKind, clearMs: number = CLEAR_IF_STUCK_MS) {
  document.documentElement.dataset.nav = kind;
  scheduleClear(clearMs);
}

// ‹ 뒤로 가기 전환 — 브라우저 전환(View Transitions)으로는 못 한다(2026-11-07 크롬 실측 두 가지: React 는 popstate 이동에
// <ViewTransition> 을 걸지 않고, 직접 연 전환도 그 안에서 기록 이동(history.back)이 일어나면 "invalid state" 로 중단된다).
// 그래서 지금 화면을 복제한 덮개를 위에 두고 뒤로 간 뒤 덮개를 밀어낸다 — 아이폰은 오른쪽으로 빠지며 아래 화면이 왼쪽 1/3 에서
// 밝아지며 들어오고, 안드로이드는 덮개가 아래로 가라앉으며 사라진다. 덮개는 헤더(z-50)·탭바(z-40) 아래(z-39)라 둘은 그대로 있다.
// 🔴 안드로이드 하드웨어 뒤로는 앱이 웹뷰 goBack 을 바로 불러 이 길을 못 탄다 — 4단계에서 앱이 웹에 뒤로를 청하게 바꾼다
const IOS_EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";

export function runBackTransition(goBack: () => void): void {
  const page = document.querySelector<HTMLElement>("[data-app-page]");
  const platform = document.documentElement.getAttribute("data-platform");
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (!page || !platform || reduce || typeof page.animate !== "function") {
    goBack();
    return;
  }
  const rect = page.getBoundingClientRect();
  const layer = document.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  layer.style.cssText = "position:fixed;inset:0;z-index:39;overflow:hidden;pointer-events:none;";
  const clone = page.cloneNode(true) as HTMLElement;
  clone.removeAttribute("data-app-page");
  const bodyBg = getComputedStyle(document.body);
  clone.style.cssText += `;position:absolute;left:0;top:${rect.top}px;width:${rect.width}px;margin:0;` +
    `background:${bodyBg.backgroundColor} ${bodyBg.backgroundImage};background-attachment:fixed;` +
    (platform === "ios" ? "box-shadow:-8px 0 24px rgba(31,23,53,0.18);" : "");
  layer.appendChild(clone);
  document.body.appendChild(layer);
  goBack();
  const done = () => layer.remove();
  if (platform === "ios") {
    clone.animate([{ transform: "translateX(0)" }, { transform: "translateX(100%)" }], { duration: 350, easing: IOS_EASE, fill: "forwards" }).onfinish = done;
    page.animate([{ transform: "translateX(-30%)", filter: "brightness(0.82)" }, { transform: "none", filter: "none" }], { duration: 350, easing: IOS_EASE });
  } else {
    clone.animate([{ transform: "none", opacity: 1 }, { transform: "translateY(8%)", opacity: 0 }], { duration: 300, easing: "cubic-bezier(0.3, 0, 0.8, 0.15)", fill: "forwards" }).onfinish = done;
  }
  setTimeout(done, 1_000); // 애니메이션이 끝나지 못해도(탭 전환으로 멈춤 등) 덮개는 반드시 걷는다
}

export default function AppNavDirection() {
  const { app } = useAppInfo();
  const pathname = usePathname();

  useEffect(() => {
    if (!app) return;
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      const url = new URL(a.href, location.href);
      const kind = navKindForClick({
        sameOrigin: url.origin === location.origin,
        target: a.getAttribute("target"),
        download: a.hasAttribute("download"),
        modified: e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0,
        navAttr: a.getAttribute("data-nav"),
        samePath: url.pathname + url.search === location.pathname + location.search,
      });
      if (kind) setNav(kind);
    };
    // popstate 이동은 Next·React 가 이 리스너보다 먼저 동기로 그려 pathname 효과가 이미 지나갔다 — 짧게 지운다
    const onPop = () => setNav(navKindForPopstate(app.platform, takeBackButton()), CLEAR_AFTER_NAV_MS);
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPop);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPop);
    };
  }, [app]);

  useEffect(() => {
    if (document.documentElement.dataset.nav) scheduleClear(CLEAR_AFTER_NAV_MS);
  }, [pathname]);

  return null;
}
