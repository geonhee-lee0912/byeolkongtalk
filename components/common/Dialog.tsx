"use client";

// 공통 확인창 — 가운데 뜨는 창. 모양은 지금 확인창들 그대로(판은 children 이 그린다), 여는 법·닫는 법만 통일한다. 스펙 2026-11-07-앱-화면 §8.
// 뒤 화면 스크롤 잠금과 "맨 위 하나 닫기"는 overlayStack. 법정 통지처럼 버튼으로만 닫아야 하면 dismissible={false}
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { onceClose, overlayStack } from "@/lib/app-shell/overlay-stack";
import { OverlayCloseContext } from "./overlay-close";

export default function Dialog({
  label,
  onClose,
  dismissible = true,
  z = 105,
  role = "dialog",
  children,
}: {
  label: string;
  onClose: () => void;
  dismissible?: boolean;
  z?: number;
  role?: "dialog" | "alertdialog";
  children: ReactNode;
}) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  const requestClose = useMemo(() => onceClose(() => onCloseRef.current()), []);

  useEffect(() => overlayStack.push(requestClose), [requestClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center px-6 animate-fade-in" style={{ zIndex: z }}>
      <div
        className="absolute inset-0 bg-night/45 backdrop-blur-[2px]"
        onClick={dismissible ? requestClose : undefined}
      />
      <div role={role} aria-modal="true" aria-label={label} className="relative w-full max-w-sm">
        <OverlayCloseContext.Provider value={requestClose}>{children}</OverlayCloseContext.Provider>
      </div>
    </div>,
    document.body,
  );
}
