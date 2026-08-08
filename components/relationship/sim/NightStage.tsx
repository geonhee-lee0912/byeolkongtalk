"use client";
// components/relationship/sim/NightStage.tsx — 밤 무대 시각 셸(FE5) + 3화자 대화 로직(FE6).
// night 배경 + 금색 별 파티클 + 접히는 인형 + 프레임 고지 노트 + say(인형) SSE 소비 +
// X-Sim-* 헤더(강제 디브리핑·민감) + 409 턴캡 + crisis(SafetyBanner) + 하단 입력창(전송·마무리).
import { useEffect, useRef, useState } from "react";
import DollPortrait from "./DollPortrait";
import StageFrame from "./StageFrame";
import ByeolkongNote from "./ByeolkongNote";
import SimBubble from "./SimBubble";
import SafetyBanner from "@/components/safety/SafetyBanner";
import { hideTrailingSendMarker } from "@/lib/relationship/sim-stream";
import type { RelationshipStatus } from "@/lib/relationship/types";
import type { SensitiveCategory } from "@/lib/sensitive";

export interface NightStageProps {
  simReadingId: string;
  status: RelationshipStatus;
  label: string;
  frame: string;
  onDebrief: () => void;
}

// 명시적 who 로 화자 구분 — user(유저 발화) / doll(인형 대사) / note(별콩이 노트).
type Msg = { id: number; who: "user" | "doll" | "note"; text: string };

export default function NightStage(props: NightStageProps) {
  // 첫 유저 발화 후 인형이 sticky 소형으로 접힘.
  const [started, setStarted] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [live, setLive] = useState<{ who: "doll" | "note"; text: string } | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [forceDebrief, setForceDebrief] = useState(false);
  const [crisis, setCrisis] = useState<{ category: string; severity: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const composingRef = useRef(false);
  // 전송(say)·민감 복귀(note) 스트림이 같은 live 슬롯을 공유 — sending 뿐 아니라 live!==null 도
  // 묶어 스트림 진행 중 입력·재전송을 막는다(두 스트림 직렬화).
  const busy = sending || live !== null;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => el.scrollTo({ top: el.scrollHeight }));
  }, [messages.length, live?.text]);

  const autoResize = () => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  async function sendSay(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    setInput("");
    if (taRef.current) taRef.current.style.height = "auto";
    setSending(true);
    setError(null);
    setMessages((m) => [...m, { id: Date.now(), who: "user", text: t }]);
    try {
      const res = await fetch("/api/relationship/sim/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ simReadingId: props.simReadingId, message: t, action: "say" }),
      });
      if (res.status === 409) {
        setSending(false);
        setForceDebrief(true); // 턴캡 도달 → 정리하기 유도
        return;
      }
      if (!res.ok || !res.body) {
        setSending(false);
        setError("잠깐 문제가 생겼어. 다시 시도해줘.");
        return;
      }
      const sensitive = res.headers.get("X-Sim-Sensitive") === "1";
      if (sensitive) {
        setCrisis({
          category: res.headers.get("X-Sensitive-Category") ?? "other",
          severity: Number(res.headers.get("X-Sensitive-Severity") ?? "1"),
        });
      }
      const forceDeb = res.headers.get("X-Sim-Force-Debrief") === "1";
      const liveWho: "doll" | "note" = sensitive ? "note" : "doll"; // 민감 시 별콩이(crisis) 복귀
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      setLive({ who: liveWho, text: "" });
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setLive({ who: liveWho, text: hideTrailingSendMarker(acc) });
      }
      setMessages((m) => [...m, { id: Date.now() + 1, who: liveWho, text: acc }]);
      setLive(null);
      setStarted(true);
      setSending(false);
      if (forceDeb) setForceDebrief(true);
    } catch {
      setLive(null);
      setSending(false);
      setError("연결이 끊겼어. 다시 시도해줘.");
    }
  }

  // 인형 대사 피드백(👍/👎) → 상대 성격 즉시 반영. 성공 시 true(SimBubble 이 완료 표시).
  async function sendFeedback(kind: "up" | "down", note: string): Promise<boolean> {
    try {
      const res = await fetch("/api/relationship/sim/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ simReadingId: props.simReadingId, kind, note }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  return (
    <StageFrame stage>
      <div className="relative flex flex-col" style={{ height: "100dvh" }}>
        <div className="sticky top-0 z-10 bg-gradient-to-b from-night/70 to-transparent px-5 pt-3 pb-2">
        <DollPortrait status={props.status} label={props.label} collapsed={started} />
        {crisis && (
          <SafetyBanner
            category={crisis.category as SensitiveCategory}
            severity={crisis.severity}
            onClose={() => setCrisis(null)}
          />
        )}
      </div>
      <div
        ref={scrollRef}
        className="relative z-10 flex-1 overflow-y-auto px-5 py-3 flex flex-col gap-3"
      >
        <ByeolkongNote text={props.frame} kind="frame" />
        <p className="self-center text-[11px] text-lilac-soft/50 -mt-1">인형 대사에 👍 맞아요 · 👎 달라요로 알려줄 수 있어</p>
        {messages.map((m) =>
          m.who === "note" ? (
            <ByeolkongNote key={m.id} text={m.text} />
          ) : m.who === "user" ? (
            <div
              key={m.id}
              className="max-w-[82%] self-end rounded-2xl rounded-tr-sm bg-lilac-deep text-white px-3.5 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap"
            >
              {m.text}
            </div>
          ) : (
            <SimBubble key={m.id} content={m.text} onFeedback={sendFeedback} />
          )
        )}
        {live &&
          (live.who === "note" ? (
            <ByeolkongNote text={live.text} streaming />
          ) : (
            <SimBubble content={live.text} streaming />
          ))}
        {error && <p className="self-center text-[13px] text-rose-300">{error}</p>}
      </div>
      <div className="relative z-10 border-t border-lilac-mid/20 bg-night-deep/80 px-4 pt-2.5 pb-3">
        {/* 입력창 + 내부 전송 버튼 */}
        <div className="relative">
          <textarea
            ref={taRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              autoResize();
            }}
            onCompositionStart={() => {
              composingRef.current = true;
            }}
            onCompositionEnd={() => {
              composingRef.current = false;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !composingRef.current) {
                e.preventDefault();
                void sendSay(input);
              }
            }}
            rows={1}
            maxLength={8000}
            placeholder={busy ? "별콩이가 답하는 중…" : "편하게 말 걸어봐"}
            disabled={busy}
            className="w-full pl-3.5 pr-12 py-2.5 rounded-xl bg-night/60 border border-lilac-mid/30 text-cream-warm text-[14px] leading-[22px] placeholder:text-lilac/50 disabled:opacity-60 resize-none scrollbar-hide focus:outline-none focus:border-gold/50 focus:ring-2 focus:ring-gold/20"
            style={{ minHeight: "44px", maxHeight: "120px" }}
          />
          <button
            type="button"
            onClick={() => void sendSay(input)}
            disabled={busy || !input.trim()}
            className="absolute right-2 bottom-2 w-8 h-8 rounded-full bg-gold text-night-deep flex items-center justify-center disabled:opacity-40"
            aria-label="보내기"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden>
              <path d="M3.4 20.4l17.45-7.48a1 1 0 000-1.84L3.4 3.6a1 1 0 00-1.4.92V9.5c0 .5.37.93.87.99L15 12 2.87 13.51a1 1 0 00-.87.99v4.98a1 1 0 001.4.92z" />
            </svg>
          </button>
        </div>
        {/* 하단 액션 행 — 마무리(답변 생성 유료 기능은 후속) */}
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={props.onDebrief}
            className={`rounded-lg px-3.5 py-1.5 text-[13px] font-bold border transition-colors ${
              forceDebrief
                ? "bg-gold text-night-deep border-gold animate-pulse-soft"
                : "text-gold-soft border-gold/40 hover:bg-gold/10"
            }`}
          >
            마무리
          </button>
        </div>
      </div>
      </div>
    </StageFrame>
  );
}
