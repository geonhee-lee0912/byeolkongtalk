"use client";

// 결과 화면의 "다시 볼 날" — 첫 리딩이면 하단 시트로 자동으로 열리고, 그 뒤엔 결과 안의 카드로만 둔다.
// 앱(push 지원) 안에서만 그린다. 소유자 확인은 부르는 쪽 책임. 시안: docs/superpowers/specs/assets/2026-11-06-앱-알림-시안.html ①~④
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { askAppPush, appSupportsPush } from "@/lib/app-push";
import { postToApp } from "@/lib/app-context";
import { useAppInfo } from "@/lib/use-app-info";
import type { PushState } from "@/lib/app-bridge/protocol";
import type { RevisitChoice } from "@/lib/push/schedule";

const CHIPS: { choice: RevisitChoice; label: string }[] = [
  { choice: "3d", label: "3일 뒤" },
  { choice: "1w", label: "1주 뒤" },
  { choice: "2w", label: "2주 뒤" },
];
const FIRST_MOMENT = "first_reading_end";

type Mode = "loading" | "hidden" | "sheet" | "card" | "closed";
type AskAnswer = "accepted" | "later" | "os_denied";

function recordAsk(answer: AskAnswer) {
  void fetch("/api/push/asks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ moment: FIRST_MOMENT, answer }),
  }).catch(() => {});
}

/** "YYYY-MM-DD" → "N월 N일" (Date 변환 없이 문자열로) */
function monthDay(sendOn: string): string {
  const [, m, d] = sendOn.split("-");
  return `${Number(m)}월 ${Number(d)}일`;
}

export default function RevisitSheet({ readingId }: { readingId: string }) {
  const { ready } = useAppInfo();
  const [mode, setMode] = useState<Mode>("loading");
  const [firstSheet, setFirstSheet] = useState(false); // 이번 방문에 자동 시트로 열렸는지 — ask 기록은 이때만
  const [perm, setPerm] = useState<PushState>("undetermined");
  const [sendOn, setSendOn] = useState<string | null>(null);
  const [alreadySent, setAlreadySent] = useState(false);
  const [picked, setPicked] = useState<RevisitChoice | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!ready) return;
    if (!appSupportsPush()) {
      setMode("hidden");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const [rv, asks, status] = await Promise.all([
          fetch(`/api/push/revisit?readingId=${encodeURIComponent(readingId)}`, { cache: "no-store" }),
          fetch("/api/push/asks", { cache: "no-store" }),
          askAppPush("push.status"),
        ]);
        if (!rv.ok || !asks.ok || !status) {
          if (!cancelled) setMode("hidden");
          return;
        }
        const rvBody = (await rv.json()) as {
          revisit: { sendOn: string; status: "pending" | "sent" | "skipped" } | null;
        };
        const asksBody = (await asks.json()) as { moments: string[] };
        if (cancelled) return;
        setPerm(status);
        const rev = rvBody.revisit;
        if (rev) {
          if (rev.status === "pending") setSendOn(rev.sendOn);
          else setAlreadySent(true);
          setMode("card");
          return;
        }
        const first = !asksBody.moments.includes(FIRST_MOMENT);
        setFirstSheet(first);
        setMode(first ? "sheet" : "card");
      } catch {
        if (!cancelled) setMode("hidden");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, readingId]);

  /** 권한 확인(필요하면 OS 창) → 예약. 카드는 칩을 누르는 즉시, 시트는 [알림 받을래] 로 부른다 */
  async function commit(choice: RevisitChoice) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setFailed(false);
    try {
      let state = perm;
      if (state === "undetermined") {
        const asked = await askAppPush("push.request");
        if (!asked) {
          setFailed(true);
          return;
        }
        state = asked;
        setPerm(asked);
      }
      if (state !== "granted") {
        if (firstSheet) recordAsk("os_denied");
        return;
      }
      const r = await fetch("/api/push/revisit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ readingId, choice }),
      });
      if (r.status === 409) {
        setAlreadySent(true);
        setSendOn(null);
        setMode("card");
        return;
      }
      if (!r.ok) {
        setFailed(true);
        return;
      }
      const body = (await r.json()) as { sendOn: string };
      setSendOn(body.sendOn);
      setPicked(choice);
      if (firstSheet) {
        recordAsk("accepted");
        setFirstSheet(false);
      }
      setMode("card"); // 시트였다면 예약된 카드로 바뀐다
    } catch {
      setFailed(true);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function later() {
    if (firstSheet) recordAsk("later");
    setFirstSheet(false);
    setMode("closed");
  }

  if (mode === "loading" || mode === "hidden" || mode === "closed") return null;

  const denied = perm === "denied";
  const warn = (
    <div className="mt-3 rounded-2xl bg-white border border-lilac-mid/35 px-3 py-2.5 text-[12.5px] leading-relaxed">
      알림이 꺼져 있어서 그날 못 알려줘.
      <br />
      <button
        type="button"
        onClick={() => postToApp("push.openSettings")}
        className="mt-2 inline-block px-3.5 py-2 rounded-full text-[12px] font-bold text-eye-purple bg-lilac-soft"
      >
        설정 열기
      </button>
    </div>
  );
  const retry = failed ? <p className="mt-2 text-[12px] text-text-light">잘 안 됐어. 한 번 더 눌러 줄래?</p> : null;

  const chipClass = (on: boolean, small: boolean) =>
    `${small ? "px-3 py-[7px] text-[12px]" : "px-[15px] py-[9px] text-[13px]"} rounded-full font-bold border-[1.5px] transition-colors disabled:opacity-50 ${
      on ? "bg-eye-purple border-eye-purple text-white shadow-md" : "bg-white border-lilac-mid text-eye-purple"
    }`;

  // ── 시트(① 자동으로 열림)
  if (mode === "sheet") {
    return createPortal(
      <div
        className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-night/50 backdrop-blur-sm animate-fade-in"
        onClick={later}
      >
        <div
          role="dialog"
          aria-label="다시 볼 날"
          className="w-full max-w-md mx-auto bg-cream rounded-t-3xl sm:rounded-3xl p-6 pb-[max(env(safe-area-inset-bottom),24px)] sm:pb-6 max-h-[88vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col items-center text-center">
            <div className="relative w-[52px] h-[52px] mb-2">
              <div className="absolute inset-0 bg-gold/30 rounded-full blur-lg scale-110" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/profile.png" alt="" className="relative w-full h-full object-contain" />
            </div>
            <p className="text-[17px] font-black tracking-tight">이 고민, 언제 다시 볼까?</p>
            <p className="text-[12.5px] text-text-light mt-1.5 leading-normal">그날 별콩이가 알려줄게. 알림을 켜 줘.</p>
          </div>
          {denied ? (
            warn
          ) : (
            <>
              <div className="flex gap-2 justify-center mt-[18px] mb-1.5">
                {CHIPS.map((c) => (
                  <button
                    key={c.choice}
                    type="button"
                    disabled={busy}
                    onClick={() => setPicked(c.choice)}
                    className={chipClass(picked === c.choice, false)}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                disabled={!picked || busy}
                onClick={() => picked && void commit(picked)}
                className="block w-full mt-4 py-3.5 rounded-full text-[14px] font-bold text-white bg-eye-purple shadow-lg disabled:opacity-40"
              >
                알림 받을래
              </button>
              {retry}
            </>
          )}
          <button type="button" onClick={later} className="block w-full mt-1.5 py-2.5 text-[13px] font-bold text-lilac-deep">
            나중에
          </button>
        </div>
      </div>,
      document.body,
    );
  }

  // ── 카드(②③④ 결과 화면 안)
  return (
    <div className="w-full max-w-md mx-auto px-5 mt-4">
      <div className="bg-cream-warm border border-lilac-mid/35 rounded-[20px] p-4">
        {alreadySent ? (
          <p className="text-[14px] font-black">이 리딩은 이미 알려줬어</p>
        ) : (
          <>
            {sendOn ? (
              <>
                <p className="flex items-center gap-2 text-[14px] font-black">
                  <span className="text-gold text-[18px]">✦</span>
                  {monthDay(sendOn)}에 알려줄게
                </p>
                <p className="text-[12px] text-text-light mt-1.5">날짜 바꾸기</p>
              </>
            ) : (
              <div className="flex items-center gap-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/profile.png" alt="" className="w-[34px] h-[34px] object-contain" />
                <div>
                  <p className="text-[14px] font-black">이 고민, 언제 다시 볼까?</p>
                  {!denied && <p className="text-[12px] text-text-light mt-0.5">그날 별콩이가 알려줄게.</p>}
                </div>
              </div>
            )}
            {denied && !sendOn ? (
              warn
            ) : (
              <>
                <div className="flex gap-2 mt-3">
                  {CHIPS.map((c) => (
                    <button
                      key={c.choice}
                      type="button"
                      disabled={busy}
                      onClick={() => void commit(c.choice)}
                      className={chipClass(sendOn !== null && picked === c.choice, true)}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
                {denied && warn}
                {retry}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
