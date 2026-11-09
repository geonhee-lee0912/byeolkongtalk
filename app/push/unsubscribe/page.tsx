"use client";

// 광고 알림의 [수신거부] 버튼이 여는 화면(설계 §4-7) — 로그인 없이, 알림에 실린 표(#t=)로 바로 철회하고 결과 통지를 띄운다.
// 버튼을 못 찾는 사람을 위해 알림을 눌러 열린 화면에도 같은 철회 줄이 있다(components/push/PushGate).
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import AdConsentNotice, { noticeLines, type ConsentNotice } from "@/components/push/AdConsentNotice";

type View = { kind: "working" } | { kind: "done"; notice: ConsentNotice | null } | { kind: "used" } | { kind: "bad" } | { kind: "error" };

export default function PushUnsubscribePage() {
  const [view, setView] = useState<View>({ kind: "working" });
  const [popup, setPopup] = useState<ConsentNotice | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const m = /(?:^#|&)t=([A-Za-z0-9._-]{1,80})(?:&|$)/.exec(window.location.hash);
    try {
      window.history.replaceState(window.history.state, "", window.location.pathname); // 표를 주소에 남기지 않는다
    } catch {
      // 주소를 못 고쳐도 처리는 한다
    }
    if (!m) {
      setView({ kind: "bad" });
      return;
    }
    void (async () => {
      try {
        const r = await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: m[1], source: "unsubscribe_button" }),
        });
        const b = (await r.json().catch(() => null)) as { notice?: ConsentNotice | null } | null;
        if (r.ok) {
          setView({ kind: "done", notice: b?.notice ?? null });
          if (b?.notice) setPopup(b.notice);
        } else if (r.status === 409) setView({ kind: "used" });
        else if (r.status === 403 || r.status === 400) setView({ kind: "bad" });
        else setView({ kind: "error" });
      } catch {
        setView({ kind: "error" });
      }
    })();
  }, []);

  const text =
    view.kind === "working"
      ? "수신거부 처리 중이야…"
      : view.kind === "done"
        ? view.notice
          ? "광고 알림 수신거부가 처리됐어."
          : "이미 광고 알림을 받지 않고 있어."
        : view.kind === "used"
          ? "이 알림의 수신거부는 이미 처리됐어."
          : view.kind === "bad"
            ? "이 수신거부 링크는 쓸 수 없어."
            : "잘 안 됐어. 잠시 뒤 다시 해 줄래?";

  return (
    <main className="flex flex-1 flex-col items-center py-10 w-full animate-fade-in">
      <div className="w-full max-w-md mx-auto px-5">
        {/* 앱에선 앱 헤더(‹ 광고 수신거부)와 겹쳐 숨긴다 */}
        <h1 className="web-only text-17 font-black">광고 알림 수신거부</h1>
        <p className="mt-3 text-14">{text}</p>
        {view.kind === "done" && view.notice && (
          <dl className="mt-4 rounded-2xl bg-white border border-lilac-mid/35 px-4 py-3 text-13 leading-relaxed">
            {noticeLines(view.notice).map((l) => (
              <div key={l.label} className="flex gap-3 py-0.5">
                <dt className="shrink-0 w-[64px] text-text-light">{l.label}</dt>
                <dd className="font-bold">{l.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {view.kind !== "working" && (
          <p className="mt-4 text-13 text-text-light leading-relaxed">
            지금 상태는 마이 → 알림 설정에서 보고 바꿀 수 있어.{" "}
            <Link href="/mypage/notifications" className="underline">
              알림 설정
            </Link>
          </p>
        )}
      </div>
      {popup && <AdConsentNotice notice={popup} onClose={() => setPopup(null)} />}
    </main>
  );
}
