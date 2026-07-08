"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import PopupCard, { type PopupContent } from "./PopupCard";

interface Popup extends PopupContent {
  id: string;
}

/**
 * 어드민 발 안내 팝업 게이트 — 사이트 진입(마운트) 시 1회 미확인 팝업을 조회해
 * 있으면 전체 화면 모달(포털)로 노출. "확인했어"를 눌러야 소멸(서버 ack 기록).
 * 미로그인/미확인 팝업 없음이면 아무것도 렌더하지 않음.
 * AppShell 이 보이는 라우트에만 마운트되므로 /login·/admin·/start 에선 안 뜸.
 */
export default function UserPopupGate() {
  const [popup, setPopup] = useState<Popup | null>(null);
  const [mounted, setMounted] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMounted(true);
    let cancelled = false;
    fetch("/api/popups", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.popup) setPopup(d.popup);
      })
      .catch(() => {
        // 조회 실패는 조용히 무시 — 다음 진입 때 재시도
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!mounted || !popup) return null;

  const ack = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await fetch(`/api/popups/${popup.id}/ack`, { method: "POST" });
    } catch {
      // ack 실패해도 이번 세션에선 닫음 — 서버 기록이 없으니 다음 진입 때 재노출
    }
    setPopup(null);
    setBusy(false);
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-6 bg-night/45 backdrop-blur-[2px] animate-fade-in">
      <PopupCard content={popup} onConfirm={ack} busy={busy} />
    </div>,
    document.body
  );
}
