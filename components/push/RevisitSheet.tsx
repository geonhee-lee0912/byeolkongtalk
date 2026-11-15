"use client";

// 결과 화면의 "다시 볼 날" — 결과 안엔 한 줄(F3: 한마디 카드 맨 아래), 누르면 달력 시트. 첫 리딩이면(또는 '나중에' 뒤 다시 묻는 리딩이면)
// 같은 시트가 저절로 열린다(그때만 '나중에'와 질문 기록). 디자인 다듬기 /tarot/result ⑩ 운영자 11-15:
//  - 시트는 빠른 칩(3일·1주·2주) + 우리 달력(내일~30일 뒤). 고르기 전엔 버튼이 회색 '날짜를 골라 줘'
//  - 광고성 정보 수신 동의 체크칸은 두지 않는다 — 광고 동의는 다른 묻는 순간(PushAskSheet)과 마이페이지 알림 설정에서 받는다
//  - '나중에'를 눌러도 줄은 남는다(가벼운 한 줄이라 — 언제든 정할 수 있게)
// 앱(push 지원) 안에서만 그린다. 소유자 확인은 부르는 쪽 책임.
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { askAppPush, appSupportsPush } from "@/lib/app-push";
import { postToApp } from "@/lib/app-context";
import { useAppInfo } from "@/lib/use-app-info";
import type { PushState } from "@/lib/app-bridge/protocol";
import { revisitDateRange, revisitSendOn, type RevisitChoice } from "@/lib/push/schedule";
import { fetchAsk, postAsk } from "./api";
import Sheet from "@/components/common/Sheet";
import Icon from "@/components/common/Icon";
import LaterButton from "./LaterButton";
import RevisitCalendar from "./RevisitCalendar";

const CHIPS: { choice: RevisitChoice; label: string }[] = [
  { choice: "3d", label: "3일 뒤" },
  { choice: "1w", label: "1주 뒤" },
  { choice: "2w", label: "2주 뒤" },
];
const MSG_SENT = "이 리딩은 이미 알려줬어";
const MSG_SKIPPED = "이 리딩의 다시 볼 날은 지났어";

type Mode = "loading" | "hidden" | "row";
/** 시트가 저절로 열린 순간 — 첫 상담 끝(첫 질문) 또는 '나중에' 뒤 다음 리딩 끝(다시 묻기 ①, 설계 §4-3) */
type SheetMoment = "first_reading_end" | "reading_end";

/** "YYYY-MM-DD" → "N월 N일" (Date 변환 없이 문자열로) */
function monthDay(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(m)}월 ${Number(d)}일`;
}

/** 시트 제목·둘째 줄과 결과 안 한 줄 — 기본은 사주 결과가 쓰는 글. 타로 결과는 다시 뽑기 값을 밝힌 글을 넘긴다
 *  (디자인 다듬기 /tarot/result ⑩ W3 — 공짜 상담처럼 보였다가 돌아와서 결제가 나오지 않게). 휴대폰 알림 문구는 그대로 중립 */
export type RevisitCopy = { title: string; sub: string; row: string };
const DEFAULT_COPY: RevisitCopy = {
  title: "이 고민, 언제 다시 볼까?",
  sub: "그날 아침에 별콩이가 알려줄게.",
  row: "이 고민, 언제 다시 볼까?",
};

/** autoOpen=false 면 첫 상담이어도 시트를 저절로 열지 않고 줄로만 둔다(위기 안내가 나간 상담 — 운영자 결정 11-06).
 *  이때는 질문을 기록하지 않아서, 다음 보통 상담의 결과 화면에서 첫 시트가 다시 열린다.
 *  inline 이면 부르는 쪽 카드 안 맨 아래 줄로(위에 얇은 선), 아니면 혼자 선 안쪽 칸으로 그린다 */
export default function RevisitSheet({
  readingId,
  autoOpen = true,
  copy = DEFAULT_COPY,
  inline = false,
}: {
  readingId: string;
  autoOpen?: boolean;
  copy?: RevisitCopy;
  inline?: boolean;
}) {
  const { ready } = useAppInfo();
  const [mode, setMode] = useState<Mode>("loading");
  // 시트 — "auto" 는 저절로 열린 질문 시트('나중에' 있음), "pick" 은 줄에서 연 시트
  const [sheet, setSheet] = useState<"auto" | "pick" | null>(null);
  // 이번 방문에 저절로 열린 시트의 순간 — 질문 기록은 이때만. 한 번 답하면 null
  const [askMoment, setAskMoment] = useState<SheetMoment | null>(null);
  const [perm, setPerm] = useState<PushState>("undetermined");
  const [sendOn, setSendOn] = useState<string | null>(null);
  // 이 리딩의 예약이 끝났을 때(보냄·건너뜀) 줄에 보일 말
  const [done, setDone] = useState<string | null>(null);
  // 알림 설정에서 다시 볼 날이 꺼져 있다 — 예약해도 안 간다. 설정 안내(설정을 저절로 켜지 않는다)
  const [prefOff, setPrefOff] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [chip, setChip] = useState<RevisitChoice | null>(null);
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
        setMode("row");
        const rev = rvBody.revisit;
        if (rev) {
          if (rev.status === "pending") setSendOn(rev.sendOn);
          else setDone(rev.status === "skipped" ? MSG_SKIPPED : MSG_SENT);
          return;
        }
        // 설정이 꺼져 있거나 위기 안내가 나간 상담이면 시트를 저절로 열지 않는다(질문도 기록하지 않는다) — 줄로만
        if (rvBody.revisitPref === false || !autoOpen) return;
        let moment: SheetMoment | null = first.ask === "push" ? "first_reading_end" : null;
        if (!moment) {
          const again = await fetchAsk("reading_end", status);
          if (cancelled) return;
          if (again?.ask === "push") moment = "reading_end";
        }
        setAskMoment(moment);
        if (moment) setSheet("auto");
      } catch {
        if (!cancelled) setMode("hidden");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, readingId, autoOpen]);

  function openPick() {
    setPicked(sendOn);
    setChip(null);
    setFailed(false);
    setSheet("pick");
  }

  /** 권한 확인(필요하면 OS 창) → 예약. 시트의 [N월 N일에 알려줘] 로 부른다 */
  async function commit(date: string) {
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
      if (state !== "granted") return; // 시트에 '알림이 꺼져 있어' 안내가 뜬다
      const r = await fetch("/api/push/revisit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ readingId, date }),
      });
      if (r.status === 409) {
        setDone(MSG_SENT);
        setSendOn(null);
        setSheet(null);
        return;
      }
      if (!r.ok) {
        setFailed(true);
        return;
      }
      const body = (await r.json()) as { sendOn: string };
      setSendOn(body.sendOn);
      setSheet(null);
    } catch {
      setFailed(true);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function closeSheet() {
    if (busyRef.current) return; // 예약·권한 요청 중엔 닫지 않는다
    // 저절로 열린 시트를 그냥 닫으면 '나중에' — OS 창은 띄우지 않는다(아껴 둔다, §4-2)
    if (sheet === "auto" && askMoment) postAsk(askMoment, "push", "later");
    setAskMoment(null);
    setSheet(null);
  }

  if (mode !== "row") return null;

  const denied = perm === "denied";
  const now = new Date();
  const { min, max } = revisitDateRange(now);
  const todayKst = new Date(now.getTime() + 9 * 3600e3).toISOString().slice(0, 10);

  // ── 결과 안 한 줄: 왼쪽 말 + 오른쪽 할 일
  const action = (label: string, onClick: () => void) => (
    <button type="button" onClick={onClick} className="flex items-center gap-0.5 text-13 font-bold text-accent shrink-0">
      {label}
      <Icon name="chev_r" size={14} />
    </button>
  );
  let left: ReactNode;
  let right: ReactNode = null;
  if (done) {
    left = <span className="text-13 text-text-light">{done}</span>;
  } else if (prefOff) {
    left = <span className="text-13 text-text-light">알림 설정에서 다시 볼 날이 꺼져 있어</span>;
    right = (
      <Link href="/mypage/notifications" className="flex items-center gap-0.5 text-13 font-bold text-accent shrink-0">
        알림 설정
        <Icon name="chev_r" size={14} />
      </Link>
    );
  } else if (denied) {
    left = <span className="text-13 text-text-light">알림이 꺼져 있어서 그날 못 알려줘</span>;
    right = action("설정 열기", () => postToApp("push.openSettings"));
  } else if (sendOn) {
    left = <span className="text-13 font-bold text-eye-purple">{monthDay(sendOn)}에 알려줄게</span>;
    right = action("바꾸기", openPick);
  } else {
    left = <span className="text-13 text-text-light">{copy.row}</span>;
    right = action("날짜 정하기", openPick);
  }
  const row = (
    <div className={`flex items-center justify-between gap-2 ${inline ? "border-t border-lilac-mid/35 mt-4 pt-3" : ""}`}>
      {left}
      {right}
    </div>
  );

  return (
    <>
      {inline ? (
        row
      ) : (
        <div className="w-full max-w-md mx-auto px-5 mt-4">
          <div className="card-inner">{row}</div>
        </div>
      )}
      {sheet && (
        <Sheet label="다시 볼 날" onClose={closeSheet} dismissible={!busy} z={80}>
          <div className="flex flex-col items-center text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/profile.png" alt="" className="w-11 h-11 object-contain mb-1.5" />
            <p className="text-17 font-black tracking-tight">{copy.title}</p>
            <p className="text-13 text-text-light mt-1 leading-normal">{copy.sub}</p>
          </div>
          {denied ? (
            <div className="card-inner mt-4 text-13 leading-relaxed">
              알림이 꺼져 있어서 그날 못 알려줘.
              <br />
              <button type="button" onClick={() => postToApp("push.openSettings")} className="btn btn-secondary btn-sm mt-2">
                설정 열기
              </button>
            </div>
          ) : (
            <>
              <div className="flex gap-2 justify-center mt-4 mb-3">
                {CHIPS.map((c) => (
                  <button
                    key={c.choice}
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setChip(c.choice);
                      setPicked(revisitSendOn(c.choice, new Date()));
                    }}
                    className={`px-3.5 py-2 rounded-full text-13 font-bold border-[1.5px] transition-colors disabled:opacity-50 ${
                      chip === c.choice ? "bg-accent border-accent text-white" : "bg-white border-lilac-mid text-eye-purple"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <RevisitCalendar
                today={todayKst}
                min={min}
                max={max}
                value={picked}
                disabled={busy}
                onChange={(d) => {
                  setChip(null);
                  setPicked(d);
                }}
              />
              <button
                type="button"
                disabled={busy || !picked}
                onClick={() => picked && void commit(picked)}
                className="btn btn-primary btn-lg mt-3.5"
              >
                {picked ? `${monthDay(picked)}에 알려줘` : "날짜를 골라 줘"}
              </button>
              {failed && <p className="mt-2 text-12 text-text-light text-center">잘 안 됐어. 한 번 더 눌러 줄래?</p>}
            </>
          )}
          {sheet === "auto" && <LaterButton disabled={busy} />}
        </Sheet>
      )}
    </>
  );
}
