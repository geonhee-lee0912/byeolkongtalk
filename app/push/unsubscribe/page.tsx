"use client";

// 광고 알림의 [수신거부] 버튼이 여는 화면(설계 §4-7) — 로그인 없이, 알림에 실린 표(#t=)로 바로 철회하고 결과 통지를 띄운다.
// 버튼을 못 찾는 사람을 위해 알림을 눌러 열린 화면에도 같은 철회 줄이 있다(components/push/PushGate).
// 모양: 별콩이 · 제목 · 설명 · (처리 내역) · 주 버튼 · 글자 버튼 — 결과별 글과 버튼은 lib/push/unsub-view
// (디자인 다듬기 수신거부 U1, 운영자 11-22 '조금 더 성의 있게'). 오류일 때 '다시 시도'가 생겼다(예전엔 다시 할 길이 없었다).
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import AdConsentNotice, { noticeLines, type ConsentNotice } from "@/components/push/AdConsentNotice";
import { unsubCopy, type UnsubAction } from "@/lib/push/unsub-view";

type View = { kind: "working" } | { kind: "done"; notice: ConsentNotice | null } | { kind: "used" } | { kind: "bad" } | { kind: "error" };

export default function PushUnsubscribePage() {
  const [view, setView] = useState<View>({ kind: "working" });
  const [popup, setPopup] = useState<ConsentNotice | null>(null);
  const started = useRef(false);
  // 표는 주소에서 바로 지우므로(아래) 다시 시도할 때 쓰려고 들고 있는다
  const tokenRef = useRef<string | null>(null);

  const run = useCallback(async (token: string) => {
    setView({ kind: "working" });
    try {
      const r = await fetch("/api/push/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, source: "unsubscribe_button" }),
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
  }, []);

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
    tokenRef.current = m[1];
    void run(m[1]);
  }, [run]);

  const copy = unsubCopy(view.kind, view.kind === "done" && view.notice !== null);

  const action = (a: UnsubAction, primary: boolean) => {
    const cls = primary ? "btn btn-primary btn-lg" : "mt-2 btn btn-text btn-md";
    if (a === "retry") {
      return (
        <button key={a} type="button" className={cls} onClick={() => tokenRef.current && void run(tokenRef.current)}>
          다시 시도
        </button>
      );
    }
    if (a === "settings") {
      return (
        <Link key={a} href="/mypage/notifications" className={cls}>
          {primary ? "알림 설정 열기" : "알림 설정 보기"}
        </Link>
      );
    }
    return (
      <Link key={a} href="/" className={cls}>
        별콩톡으로 가기
      </Link>
    );
  };

  return (
    <main className="flex flex-1 flex-col items-center py-10 w-full animate-fade-in">
      <div className="w-full max-w-md mx-auto px-5 pt-[4dvh] flex flex-col items-center text-center">
        <Image src="/byeolkong-main.png" alt="별콩이" width={96} height={96} priority />
        <h1 className="mt-3 font-display text-20 text-eye-purple">{copy.title}</h1>
        <p className="mt-2 text-14 text-text-light leading-relaxed break-keep whitespace-pre-line">{copy.sub}</p>
        {copy.showNotice && view.kind === "done" && view.notice && (
          <dl className="mt-5 w-full rounded-2xl bg-white border border-lilac-mid/35 px-4 py-3 text-13 leading-relaxed text-left">
            <p className="text-11 font-bold text-text-light mb-1">처리 내역</p>
            {noticeLines(view.notice).map((l) => (
              <div key={l.label} className="flex gap-3 py-0.5">
                <dt className="shrink-0 w-[64px] text-text-light">{l.label}</dt>
                <dd className="font-bold">{l.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {copy.primary && <div className="mt-6 w-full">{action(copy.primary, true)}</div>}
        {copy.secondary && action(copy.secondary, false)}
      </div>
      {popup && <AdConsentNotice notice={popup} onClose={() => setPopup(null)} />}
    </main>
  );
}
