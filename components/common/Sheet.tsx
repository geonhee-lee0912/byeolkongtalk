"use client";

// 공통 시트 — 아래에서 올라오는 창. 스펙 2026-11-07-앱-화면 §8.
// 웹(브라우저)은 지금 시트 모양 그대로(겉 페이드, 손잡이·끌기 없음). 앱에서만 손잡이가 생기고, 아래에서 올라왔다 내려가며,
// 손잡이 쪽 띠(위 44px)를 끌어내려 닫는다(app/globals.css 의 .sheet-*). 뒤 화면 스크롤 잠금과 "맨 위 하나 닫기"는 overlayStack.
// 부모가 보여 줄 때만 그린다(조건부 렌더). 안쪽 버튼은 useOverlayClose() 로 닫기를 요청한다.
// 웹 모양을 지금대로 두려고 판·배경막 모양과 정렬(align="bottom" = 데스크톱에서도 아래)을 넘겨받는다.
// 앱 손잡이 띠는 판에 p-6 이 있을 때만 음수 여백으로 판 위 끝에 붙인다(패딩 없는 판은 그대로 맨 위에 놓인다)
import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useAppInfo } from "@/lib/use-app-info";
import { onceClose, shouldDismissSheet } from "@/lib/app-shell/overlay-stack";
import { OverlayCloseContext } from "./overlay-close";
import { REARM_MS, useMountedRef, useOverlayEntry } from "./use-overlay-entry";

const PANEL_DEFAULT =
  "bg-cream rounded-t-3xl sm:rounded-3xl p-6 pb-[max(env(safe-area-inset-bottom),24px)] sm:pb-6 max-h-[88vh] overflow-y-auto overscroll-contain";
const BACKDROP_DEFAULT = "bg-night/50 backdrop-blur-sm";

/** 내려가는 움직임 길이 — globals.css 의 .sheet-root[data-closing] 과 같다 */
const EXIT_MS = { ios: 250, android: 200 } as const;

type Drag = { y0: number; dy: number; lastY: number; lastT: number; v: number };

export default function Sheet({
  label,
  onClose,
  dismissible = true,
  z = 80,
  align = "responsive",
  panelClassName,
  backdropClassName = BACKDROP_DEFAULT,
  children,
}: {
  label: string;
  onClose: () => void;
  dismissible?: boolean;
  z?: number;
  align?: "responsive" | "bottom";
  panelClassName?: string;
  backdropClassName?: string;
  children: ReactNode;
}) {
  const { app } = useAppInfo();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  const [closing, setClosing] = useState(false);
  const mounted = useMountedRef();

  const requestClose = useMemo(() => {
    // 부모가 닫기를 거절해(처리 중 등) 창이 남았으면 다시 올라와 누를 수 있게 — 안 그러면 내려간 판 대신 배경막이 화면 누르기를 다 삼킨다
    const callParent = () => {
      onCloseRef.current();
      setTimeout(() => {
        if (!mounted.current) return;
        setClosing(false);
        c.reset();
      }, REARM_MS);
    };
    const c = onceClose(() => {
      const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (!app || reduce) {
        callParent();
        return;
      }
      setClosing(true);
      setTimeout(callParent, EXIT_MS[app.platform]);
    });
    return c;
  }, [app, mounted]);

  // 스택에 한 번 올리고(첫 창이면 뒤 화면 스크롤 잠금), 사라질 때 뺀다 — 닫기 요청 없이 부모가 지워도 잠금이 남지 않는다
  useOverlayEntry(requestClose, dismissible);

  const drag = useRef<Drag | null>(null);
  const canDrag = !!app && dismissible;
  const panel = panelClassName ?? PANEL_DEFAULT;
  const padded = /(^|\s)p-6(\s|$)/.test(panel);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!canDrag || !panelRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { y0: e.clientY, dy: 0, lastY: e.clientY, lastT: e.timeStamp, v: 0 };
    panelRef.current.style.transition = "none";
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || !panelRef.current) return;
    d.dy = Math.max(0, e.clientY - d.y0);
    d.v = (e.clientY - d.lastY) / Math.max(1, e.timeStamp - d.lastT);
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
    panelRef.current.style.transform = `translateY(${d.dy}px)`;
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    const panel = panelRef.current;
    if (!d || !panel) return;
    if (shouldDismissSheet(d.dy, d.v)) {
      requestClose(); // 내려가는 움직임은 지금 끌어내린 자리에서 이어진다(애니메이션에 시작값이 없어 인라인 transform 에서 출발)
      return;
    }
    panel.style.transition = "transform 0.2s ease-out";
    panel.style.transform = "";
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className={`sheet-root fixed inset-0 flex items-end ${align === "responsive" ? "sm:items-center" : ""} justify-center animate-fade-in`}
      style={{ zIndex: z }}
      data-closing={closing ? "" : undefined}
      // 포털 안 클릭은 React 트리로 겹창을 그린 부모까지 번진다 — 부모의 onClick(닫기 등)이 안쪽 버튼에 불리지 않게 여기서 끊는다
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className={`sheet-backdrop absolute inset-0 ${backdropClassName}`}
        onClick={dismissible ? requestClose : undefined}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`sheet-panel relative w-full max-w-md mx-auto ${panel}`}
      >
        {/* 앱 전용 손잡이 + 끌어내리기 띠(44px) — 시트 안 스크롤과 다투지 않게 여기서만 끈다 */}
        <div
          className={`app-only ${padded ? "-mx-6 -mt-6 mb-1" : ""} h-11 flex items-start justify-center pt-2.5 touch-none`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          aria-hidden
        >
          <span className="h-1.5 w-10 rounded-full bg-lilac-mid/60" />
        </div>
        <OverlayCloseContext.Provider value={requestClose}>{children}</OverlayCloseContext.Provider>
      </div>
    </div>,
    document.body,
  );
}
