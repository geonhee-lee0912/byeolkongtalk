"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";

interface Popup {
  id: string;
  title: string;
  body: string;
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
      <div className="w-full max-w-sm bg-cream rounded-3xl border border-lilac-mid/40 shadow-2xl p-6 text-center">
        <div className="flex justify-center mb-3">
          <Image
            src="/byeolkong-main.png"
            alt="별콩이"
            width={72}
            height={72}
          />
        </div>
        <h2 className="font-display text-[20px] text-eye-purple mb-2">
          {popup.title}
        </h2>
        <p className="text-[13px] text-text-light leading-relaxed whitespace-pre-wrap text-left mb-5">
          {popup.body}
        </p>
        <button
          onClick={ack}
          disabled={busy}
          className="w-full py-3 bg-lilac-deep text-white rounded-full text-[14px] font-bold hover:bg-lilac-deep/90 transition-colors disabled:opacity-60"
        >
          확인했어
        </button>
      </div>
    </div>,
    document.body
  );
}
