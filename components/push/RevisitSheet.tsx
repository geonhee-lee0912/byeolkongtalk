"use client";

// 결과 화면의 "다시 볼 날" — 첫 리딩이면(또는 '나중에' 뒤 다시 묻는 리딩이면) 하단 시트로 자동으로 열리고, 그 뒤엔 결과 안의 카드로만 둔다.
// 이 시트엔 광고성 정보 수신 동의 체크칸을 두지 않는다(디자인 다듬기 /tarot/result ⑩ 운영자 11-15 — 설계 §4-2 의 체크칸을 뺌).
// 광고 동의는 다른 묻는 순간(PushAskSheet)과 마이페이지 알림 설정에서 받는다.
// 앱(push 지원) 안에서만 그린다. 소유자 확인은 부르는 쪽 책임. 시안: docs/superpowers/specs/assets/2026-11-06-앱-알림-시안.html ①~④
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { askAppPush, appSupportsPush } from "@/lib/app-push";
import { postToApp } from "@/lib/app-context";
import { useAppInfo } from "@/lib/use-app-info";
import type { PushState } from "@/lib/app-bridge/protocol";
import { revisitDateRange, type RevisitChoice } from "@/lib/push/schedule";
import { fetchAsk, postAsk } from "./api";
import Sheet from "@/components/common/Sheet";
import LaterButton from "./LaterButton";

const CHIPS: { choice: RevisitChoice; label: string }[] = [
  { choice: "3d", label: "3일 뒤" },
  { choice: "1w", label: "1주 뒤" },
  { choice: "2w", label: "2주 뒤" },
];
const MSG_SENT = "이 리딩은 이미 알려줬어";
const MSG_SKIPPED = "이 리딩의 다시 볼 날은 지났어";

type Mode = "loading" | "hidden" | "sheet" | "card" | "closed";
/** 시트가 저절로 열린 순간 — 첫 상담 끝(첫 질문) 또는 '나중에' 뒤 다음 리딩 끝(다시 묻기 ①, 설계 §4-3) */
type SheetMoment = "first_reading_end" | "reading_end";

/** "YYYY-MM-DD" → "N월 N일" (Date 변환 없이 문자열로) */
function monthDay(sendOn: string): string {
  const [, m, d] = sendOn.split("-");
  return `${Number(m)}월 ${Number(d)}일`;
}

/** 시트·카드 위 두 줄 — 기본은 사주 결과가 쓰는 글. 타로 결과는 다시 뽑기 값을 밝힌 글을 넘긴다
 *  (디자인 다듬기 /tarot/result ⑩ W3, 운영자 11-15 — 공짜 상담처럼 보였다가 돌아와서 결제가 나오지 않게). 알림 문구는 그대로 중립 */
type RevisitCopy = { title: string; sub: string; /** 시트에서만 쓰는 둘째 줄(없으면 sub) */ sheetSub?: string };
const DEFAULT_COPY: RevisitCopy = {
  title: "이 고민, 언제 다시 볼까?",
  sub: "그날 별콩이가 알려줄게.",
  sheetSub: "그날 별콩이가 알려줄게. 알림을 켜 줘.",
};

/** 고른 것 — 칩("3d"·"1w"·"2w") 또는 달력에서 고른 날("YYYY-MM-DD") */
type Pick = RevisitChoice | string;
const isDate = (p: Pick) => /^\d{4}-\d{2}-\d{2}$/.test(p);

/** 칩 줄 끝의 '날짜 고르기' — 휴대폰 기본 날짜 선택창(내일~30일 뒤). 고르면 칩 글이 그 날로 바뀐다.
 *  투명한 날짜 입력칸을 칩 위에 겹쳐 둔다 — 아이폰은 눌러서 바로 열리고, 안드로이드·PC 는 showPicker 로 연다 */
function DateChip({ picked, disabled, className, onPick }: { picked: Pick | null; disabled: boolean; className: string; onPick: (date: string) => void }) {
  const { min, max } = revisitDateRange(new Date());
  return (
    <span className={`relative ${className}`}>
      {picked && isDate(picked) ? monthDay(picked) : "날짜 고르기"}
      <input
        type="date"
        aria-label="날짜 고르기"
        min={min}
        max={max}
        disabled={disabled}
        value={picked && isDate(picked) ? picked : ""}
        onClick={(e) => {
          try {
            e.currentTarget.showPicker?.();
          } catch {
            // 이미 열려 있거나 막힌 곳 — 아이폰은 눌러서 열린다
          }
        }}
        onChange={(e) => {
          if (e.target.value) onPick(e.target.value);
        }}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-default"
      />
    </span>
  );
}

/** autoOpen=false 면 첫 상담이어도 시트를 저절로 열지 않고 카드로만 둔다(위기 안내가 나간 상담 — 운영자 결정 11-06).
 *  이때는 질문을 기록하지 않아서, 다음 보통 상담의 결과 화면에서 첫 시트가 다시 열린다 */
export default function RevisitSheet({
  readingId,
  autoOpen = true,
  copy = DEFAULT_COPY,
}: {
  readingId: string;
  autoOpen?: boolean;
  copy?: RevisitCopy;
}) {
  const { ready } = useAppInfo();
  const [mode, setMode] = useState<Mode>("loading");
  // 이번 방문에 저절로 열린 시트의 순간 — 질문 기록은 이때만. 한 번 답하면 null
  const [askMoment, setAskMoment] = useState<SheetMoment | null>(null);
  const [perm, setPerm] = useState<PushState>("undetermined");
  const [sendOn, setSendOn] = useState<string | null>(null);
  // 이 리딩의 예약이 끝났을 때(보냄·건너뜀) 칩 대신 보일 한 줄
  const [done, setDone] = useState<string | null>(null);
  // 알림 설정에서 다시 볼 날이 꺼져 있다 — 예약해도 안 간다. 칩 대신 설정 안내(설정을 저절로 켜지 않는다)
  const [prefOff, setPrefOff] = useState(false);
  const [picked, setPicked] = useState<Pick | null>(null);
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
        const [rv, status] = await Promise.all([
          fetch(`/api/push/revisit?readingId=${encodeURIComponent(readingId)}`, { cache: "no-store" }),
          askAppPush("push.status"),
        ]);
        if (!rv.ok || !status) {
          if (!cancelled) setMode("hidden");
          return;
        }
        const rvBody = (await rv.json()) as {
          revisit: { sendOn: string; status: "pending" | "sent" | "skipped" } | null;
          revisitPref: boolean;
        };
        // 첫 질문인지, 아니면 '나중에' 뒤 다시 물을 때인지 — 서버가 질문 기록·동의로 판정한다(lib/push/asks.ts)
        const first = await fetchAsk("first_reading_end", status);
        if (!first) {
          if (!cancelled) setMode("hidden");
          return;
        }
        if (cancelled) return;
        setPerm(status);
        setPrefOff(rvBody.revisitPref === false);
        const rev = rvBody.revisit;
        if (rev) {
          if (rev.status === "pending") setSendOn(rev.sendOn);
          else setDone(rev.status === "skipped" ? MSG_SKIPPED : MSG_SENT);
          setMode("card");
          return;
        }
        // 설정이 꺼져 있거나 위기 안내가 나간 상담이면 시트를 저절로 열지 않는다(질문도 기록하지 않는다) — 카드로만
        if (rvBody.revisitPref === false || !autoOpen) {
          setMode("card");
          return;
        }
        let moment: SheetMoment | null = first.ask === "push" ? "first_reading_end" : null;
        if (!moment) {
          const again = await fetchAsk("reading_end", status);
          if (cancelled) return;
          if (again?.ask === "push") moment = "reading_end";
        }
        setAskMoment(moment);
        setMode(moment ? "sheet" : "card");
      } catch {
        if (!cancelled) setMode("hidden");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, readingId, autoOpen]);

  /** 권한 확인(필요하면 OS 창) → 예약.
   *  카드는 칩을 누르는 즉시, 시트는 [알림 받을래] 로 부른다 — 시트에선 날짜를 안 골라도 누를 수 있다(§4-2) */
  async function commit(choice: Pick | null) {
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
      const moment = askMoment;
      if (moment) {
        postAsk(moment, "push", state === "granted" ? "accepted" : "os_denied");
        setAskMoment(null); // 이 시트의 질문은 한 번만 기록
      }
      if (state !== "granted") return;
      if (choice === null) {
        setMode("card"); // 날짜 없이 알림만 켰다 — 카드에서 언제든 고를 수 있다
        return;
      }
      const r = await fetch("/api/push/revisit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isDate(choice) ? { readingId, date: choice } : { readingId, choice }),
      });
      if (r.status === 409) {
        setDone(MSG_SENT);
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
      setMode("card"); // 시트였다면 예약된 카드로 바뀐다
    } catch {
      setFailed(true);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function later() {
    if (busyRef.current) return; // 예약·권한 요청 중엔 닫지 않는다
    if (askMoment) postAsk(askMoment, "push", "later"); // '나중에' — OS 창은 띄우지 않는다(아껴 둔다, §4-2)
    setAskMoment(null);
    setMode("closed");
  }

  if (mode === "loading" || mode === "hidden") return null;
  if (mode === "closed") return null;

  const denied = perm === "denied";
  const warn = (
    <div className="card-inner mt-3 text-13 leading-relaxed">
      알림이 꺼져 있어서 그날 못 알려줘.
      <br />
      <button
        type="button"
        onClick={() => postToApp("push.openSettings")}
        className="btn btn-secondary btn-sm mt-2"
      >
        설정 열기
      </button>
    </div>
  );
  const retry = failed ? <p className="mt-2 text-12 text-text-light">잘 안 됐어. 한 번 더 눌러 줄래?</p> : null;

  const chipClass = (on: boolean, small: boolean) =>
    `${small ? "px-3 py-[7px] text-12" : "px-[15px] py-[9px] text-13"} rounded-full font-bold border-[1.5px] transition-colors disabled:opacity-50 ${
      on ? "bg-eye-purple border-eye-purple text-white" : "bg-white border-lilac-mid text-eye-purple"
    }`;

  // ── 시트(① 자동으로 열림) — 공통 시트 틀(components/common/Sheet). 예약·권한 요청 중엔 바깥 누르기·끌어내리기로 닫지 않는다
  if (mode === "sheet") {
    return (
      <>
        <Sheet label="다시 볼 날" onClose={later} dismissible={!busy} z={80}>
          <div className="flex flex-col items-center text-center">
            <div className="relative w-[52px] h-[52px] mb-2">
              <div className="absolute inset-0 bg-gold/30 rounded-full blur-lg scale-110" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/profile.png" alt="" className="relative w-full h-full object-contain" />
            </div>
            <p className="text-17 font-black tracking-tight">{copy.title}</p>
            <p className="text-13 text-text-light mt-1.5 leading-normal">{copy.sheetSub ?? copy.sub}</p>
          </div>
          {denied ? (
            warn
          ) : (
            <>
              <div className="flex flex-wrap gap-2 justify-center mt-[18px] mb-1.5">
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
                <DateChip picked={picked} disabled={busy} className={chipClass(picked !== null && isDate(picked), false)} onPick={setPicked} />
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void commit(picked)}
                className="btn btn-primary btn-lg mt-4"
              >
                알림 받을래
              </button>
              {retry}
            </>
          )}
          <LaterButton disabled={busy} />
        </Sheet>
      </>
    );
  }

  // ── 카드(②③④ 결과 화면 안)
  return (
    <>
    <div className="w-full max-w-md mx-auto px-5 mt-4">
      <div className="card-inner">
        {done ? (
          <p className="text-14 font-black">{done}</p>
        ) : prefOff ? (
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/profile.png" alt="" className="w-[34px] h-[34px] object-contain" />
            <div>
              <p className="text-14 font-black">알림 설정에서 다시 볼 날이 꺼져 있어</p>
              <Link
                href="/mypage/notifications"
                className="btn btn-secondary btn-sm mt-2"
              >
                알림 설정
              </Link>
            </div>
          </div>
        ) : (
          <>
            {sendOn ? (
              <>
                <p className="flex items-center gap-2 text-14 font-black">
                  
                  {monthDay(sendOn)}에 알려줄게
                </p>
                <p className="text-12 text-text-light mt-1.5">날짜 바꾸기</p>
              </>
            ) : (
              <div className="flex items-center gap-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/profile.png" alt="" className="w-[34px] h-[34px] object-contain" />
                <div>
                  <p className="text-14 font-black">{copy.title}</p>
                  {!denied && <p className="text-12 text-text-light mt-0.5">{copy.sub}</p>}
                </div>
              </div>
            )}
            {denied && !sendOn ? (
              warn
            ) : (
              <>
                <div className="flex flex-wrap gap-2 mt-3">
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
                  <DateChip
                    picked={picked}
                    disabled={busy}
                    className={chipClass(sendOn !== null && picked !== null && isDate(picked), true)}
                    onPick={(d) => void commit(d)}
                  />
                </div>
                {denied && warn}
                {retry}
              </>
            )}
          </>
        )}
      </div>
    </div>
    </>
  );
}
