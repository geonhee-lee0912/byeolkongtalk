"use client";
// components/relationship/sim/NightStage.tsx — 밤 무대 시각 셸(FE5) + 3화자 대화 로직(FE6).
// night 배경 + 금색 별 파티클 + 접히는 인형 + 프레임 고지 노트 + say(인형)/note(별콩이) SSE 소비 +
// X-Sim-* 헤더(자동노트·강제 디브리핑·민감) + 409 턴캡 + crisis(SafetyBanner) + 하단 입력창(💭 도움/정리하기).
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
  // say 스트림과 note 스트림이 같은 live 슬롯에 동시에 쓰면 화면이 뒤섞인다 — 자동노트가 매 3턴마다
  // sendSay 종료 직후 이어 호출되므로(sending 은 이미 false) sending 만으로는 못 막는다.
  // live!==null 도 함께 묶어 say/note 두 스트림을 항상 직렬화한다.
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
      const autonote = res.headers.get("X-Sim-Autonote") === "1";
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
      if (autonote && !sensitive) await fetchNote(); // 자동 노트(민감 턴엔 X)
    } catch {
      setLive(null);
      setSending(false);
      setError("연결이 끊겼어. 다시 시도해줘.");
    }
  }

  async function fetchNote() {
    if (live) return; // say/note 스트림 진행 중엔 중복 호출 방지(같은 live 슬롯 경합 차단)
    setError(null);
    try {
      const res = await fetch("/api/relationship/sim/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ simReadingId: props.simReadingId, action: "note" }),
      });
      if (!res.ok || !res.body) return;
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      setLive({ who: "note", text: "" });
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setLive({ who: "note", text: hideTrailingSendMarker(acc) });
      }
      setMessages((m) => [...m, { id: Date.now() + 2, who: "note", text: acc }]);
      setLive(null);
    } catch {
      setLive(null);
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
            <SimBubble key={m.id} content={m.text} />
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
      <div className="relative z-10 border-t border-lilac-mid/20 bg-night-deep/80 px-4 py-2.5 flex items-center gap-2">
        <button
          type="button"
          onClick={() => void fetchNote()}
          disabled={busy}
          className="shrink-0 text-lilac-soft text-sm px-1 disabled:opacity-40"
        >
          💭 도움
        </button>
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
          className="flex-1 px-3.5 py-2.5 rounded-xl bg-night/60 border border-lilac-mid/30 text-cream-warm text-[14px] leading-[22px] placeholder:text-lilac/50 disabled:opacity-60 resize-none scrollbar-hide focus:outline-none focus:border-gold/50 focus:ring-2 focus:ring-gold/20"
          style={{ minHeight: "44px", maxHeight: "120px" }}
        />
        <button
          type="button"
          onClick={() => void sendSay(input)}
          disabled={busy || !input.trim()}
          className="shrink-0 w-9 h-9 rounded-full bg-gold text-night-deep flex items-center justify-center text-lg font-bold disabled:opacity-40"
          aria-label="보내기"
        >
          ↑
        </button>
        <button
          type="button"
          onClick={props.onDebrief}
          className={`shrink-0 text-sm px-1 py-1.5 ${
            forceDebrief ? "text-gold font-bold animate-pulse-soft" : "text-gold-soft"
          }`}
        >
          정리하기
        </button>
      </div>
      </div>
    </StageFrame>
  );
}
