"use client";

// 공통 확인창 — 가운데 뜨는 창. 모양은 지금 확인창들 그대로(판은 children 이 그린다), 여는 법·닫는 법만 통일한다. 스펙 2026-11-07-앱-화면 §8.
// 뒤 화면 스크롤 잠금·ESC·"맨 위 하나 닫기"는 overlayStack(useOverlayEntry). 법정 통지처럼 버튼으로만 닫아야 하면 dismissible={false}
// 웹 모양을 지금대로 두려고 배경막·폭·겉 여백을 넘겨받는다(기본값 = 2단계 알림 확인창)
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { onceClose } from "@/lib/app-shell/overlay-stack";
import { OverlayCloseContext } from "./overlay-close";
import { REARM_MS, useMountedRef, useOverlayEntry } from "./use-overlay-entry";

export default function Dialog({
  label,
  onClose,
  dismissible = true,
  z = 105,
  role = "dialog",
  backdropClassName = "bg-night/50 backdrop-blur-sm",
  widthClassName = "max-w-sm",
  gutterClassName = "px-6",
  children,
}: {
  label: string;
  onClose: () => void;
  dismissible?: boolean;
  z?: number;
  role?: "dialog" | "alertdialog";
  backdropClassName?: string;
  widthClassName?: string;
  gutterClassName?: string;
  children: ReactNode;
}) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  const mounted = useMountedRef();
  const requestClose = useMemo(() => {
    const c = onceClose(() => {
      onCloseRef.current();
      // 부모가 거절해 창이 남았으면 다시 받을 수 있게
      setTimeout(() => {
        if (mounted.current) c.reset();
      }, REARM_MS);
    });
    return c;
  }, [mounted]);

  useOverlayEntry(requestClose, dismissible, z);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className={`fixed inset-0 flex items-center justify-center ${gutterClassName} animate-fade-in`}
      style={{ zIndex: z }}
      // 포털 안 클릭은 React 트리로 겹창을 그린 부모까지 번진다 — 부모의 onClick(닫기 등)이 안쪽 버튼에 불리지 않게 여기서 끊는다
      onClick={(e) => e.stopPropagation()}
    >
      <div className={`absolute inset-0 ${backdropClassName}`} onClick={dismissible ? requestClose : undefined} />
      <div role={role} aria-modal="true" aria-label={label} className={`relative w-full ${widthClassName}`}>
        <OverlayCloseContext.Provider value={requestClose}>{children}</OverlayCloseContext.Provider>
      </div>
    </div>,
    document.body,
  );
}
