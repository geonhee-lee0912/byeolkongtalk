"use client";
// components/relationship/sim/NightStage.tsx — 밤 무대 셸 + 3화자 대화.
// night 배경 + 접히는 인형 + 프레임 고지 노트 + say(인형) SSE 소비 + X-Sim-* 헤더(강제 디브리핑·민감) +
// 409 턴캡 + crisis(SafetyBanner) + 하단 한 줄(답변 추천·입력창+전송·마무리) + 답변 추천(유료 SIM_SUGGEST_COST).
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import DollPortrait from "./DollPortrait";
import StageFrame from "./StageFrame";
import ByeolkongNote from "./ByeolkongNote";
import SimBubble from "./SimBubble";
import SafetyBanner from "@/components/safety/SafetyBanner";
import StarConfirmModal from "@/components/common/StarConfirmModal";
import { hideTrailingSendMarker } from "@/lib/relationship/sim-stream";
import { SIM_SUGGEST_COST, type RelationshipStatus } from "@/lib/relationship/types";
import type { SensitiveCategory } from "@/lib/sensitive";

export interface NightStageProps {
  simReadingId: string;
  status: RelationshipStatus;
  label: string;
  frame: string;
  balance: number;
  onDebrief: () => void;
  /** 재진입 시 이전 대화 시드(프레임 제외). 없으면 새 판(빈 상태). */
  initialMessages?: { who: "user" | "doll" | "note"; text: string }[];
  /** 완료 판 재열람 — 하단 입력바 숨기고 '정리 보기'만, 인형 피드백(👍👎) 숨김. */
  readOnly?: boolean;
}

// 명시적 who 로 화자 구분 — user(유저 발화) / doll(인형 대사) / note(별콩이 노트=민감 복귀).
type Msg = { id: number; who: "user" | "doll" | "note"; text: string };

export default function NightStage(props: NightStageProps) {
  const router = useRouter();
  // 첫 유저 발화 후 인형이 sticky 소형으로 접힘.
  const [started, setStarted] = useState((props.initialMessages?.length ?? 0) > 0);
  const [messages, setMessages] = useState<Msg[]>(
    () => (props.initialMessages ?? []).map((m, i) => ({ id: i + 1, who: m.who, text: m.text }))
  );
  const [live, setLive] = useState<{ who: "doll" | "note"; text: string } | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [forceDebrief, setForceDebrief] = useState(false);
  const [crisis, setCrisis] = useState<{ category: string; severity: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 답변 추천(유료) — 결제 확인 모달 · 생성 중 · 결과 3개 · 잔액.
  const [balance, setBalance] = useState(props.balance);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<{ say: string; why: string }[]>([]);

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
    setSuggestions([]); // 새 발화 시작 → 이전 추천 칩 정리
    setMessages((m) => [...m, { id: Date.now(), who: "user", text: t }]);
    try {
      const res = await fetch("/api/relationship/sim/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ simReadingId: props.simReadingId, message: t, action: "say" }),
      });
      if (res.status === 409) {
        setSending(false);
        setForceDebrief(true); // 턴캡 도달 → 마무리 유도
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

  // 답변 추천(유료) — 5별 소모 후 유저가 지금 할 만한 말 3개 받기. 결과는 입력창 위 칩으로.
  async function fetchSuggest() {
    if (suggesting) return;
    setSuggesting(true);
    setError(null);
    try {
      const res = await fetch("/api/relationship/sim/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ simReadingId: props.simReadingId, action: "suggest" }),
      });
      if (res.status === 402) {
        setSuggesting(false);
        setSuggestOpen(false);
        router.push("/shop?reason=sim_suggest");
        return;
      }
      if (!res.ok) {
        setSuggesting(false);
        setSuggestOpen(false);
        setError("추천을 받지 못했어. 다시 시도해줘.");
        return;
      }
      const d = await res.json();
      setSuggestions(Array.isArray(d.suggestions) ? d.suggestions : []);
      if (typeof d.balance === "number") setBalance(d.balance);
      setSuggesting(false);
      setSuggestOpen(false);
    } catch {
      setSuggesting(false);
      setSuggestOpen(false);
      setError("연결이 끊겼어. 다시 시도해줘.");
    }
  }

  // 추천 칩 탭 → 입력창에 채우고 포커스(유저가 다듬어 전송).
  function useSuggestion(s: string) {
    setInput(s);
    setSuggestions([]);
    requestAnimationFrame(() => {
      taRef.current?.focus();
      autoResize();
    });
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
              <SimBubble key={m.id} content={m.text} onFeedback={props.readOnly ? undefined : sendFeedback} />
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

        {/* 하단 한 줄 — readOnly(완료 재열람)면 '정리 보기'만, 아니면 입력바 */}
        {props.readOnly ? (
          <div className="relative z-10 border-t border-lilac-mid/20 bg-night-deep/80 px-3 py-3">
            <button
              type="button"
              onClick={props.onDebrief}
              className="w-full h-11 rounded-xl text-gold-soft border border-gold/40 font-bold text-[13px] hover:bg-gold/10 transition-colors"
            >
              🌙 정리 보기
            </button>
          </div>
        ) : (
        <div className="relative z-10 border-t border-lilac-mid/20 bg-night-deep/80 px-3 pt-2.5 pb-3">
          <div className="flex items-stretch gap-1.5">
            {/* 답변 추천(유료) */}
            <button
              type="button"
              onClick={() => setSuggestOpen(true)}
              disabled={busy || suggesting}
              className="shrink-0 self-end flex flex-col items-center justify-center gap-0.5 w-12 h-11 rounded-xl text-gold-soft border border-gold/30 disabled:opacity-40"
              aria-label="답변 추천"
            >
              <span className="text-base leading-none">{suggesting ? "⏳" : "💡"}</span>
              <span className="text-[10px] leading-none">추천</span>
            </button>
            {/* 입력창 + 내부 전송(원형 없이 아이콘만) */}
            <div className="relative flex-1">
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
                className="block w-full pl-3.5 pr-11 py-2.5 rounded-xl bg-night/60 border border-lilac-mid/30 text-cream-warm text-[14px] leading-[22px] placeholder:text-lilac/50 disabled:opacity-60 resize-none scrollbar-hide focus:outline-none focus:border-gold/50 focus:ring-2 focus:ring-gold/20"
                style={{ minHeight: "44px", maxHeight: "120px" }}
              />
              <button
                type="button"
                onClick={() => void sendSay(input)}
                disabled={busy || !input.trim()}
                className="absolute right-1.5 bottom-0 flex items-center justify-center w-9 h-11 text-gold disabled:opacity-30"
                aria-label="보내기"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden>
                  <path d="M3.4 20.4l17.45-7.48a1 1 0 000-1.84L3.4 3.6a1 1 0 00-1.4.92V9.5c0 .5.37.93.87.99L15 12 2.87 13.51a1 1 0 00-.87.99v4.98a1 1 0 001.4.92z" />
                </svg>
              </button>
            </div>
            {/* 마무리 */}
            <button
              type="button"
              onClick={props.onDebrief}
              className={`shrink-0 self-end inline-flex items-center h-11 rounded-xl px-3 text-[13px] font-bold border transition-colors ${
                forceDebrief
                  ? "bg-gold text-night-deep border-gold animate-pulse-soft"
                  : "text-gold-soft border-gold/40 hover:bg-gold/10"
              }`}
            >
              마무리
            </button>
          </div>
        </div>
        )}
      </div>

      {suggestions.length > 0 && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-night-deep/60"
          onClick={() => setSuggestions([])}
        >
          <div
            className="w-full max-w-md bg-night rounded-t-3xl border-t border-lilac-mid/30 p-5 pb-[max(env(safe-area-inset-bottom),20px)] animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-cream-warm font-bold text-[15px]">이렇게 말해보는 건 어때?</h3>
              <button type="button" onClick={() => setSuggestions([])} className="text-lilac-soft/60 text-[13px]">
                닫기
              </button>
            </div>
            <div className="flex flex-col gap-2.5">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => useSuggestion(s.say)}
                  className="text-left rounded-2xl bg-gold/10 border border-gold/30 p-3.5 hover:bg-gold/15 active:scale-[0.99] transition"
                >
                  <p className="text-cream-warm text-[14px] leading-relaxed">{s.say}</p>
                  {s.why && (
                    <p className="text-gold-soft/75 text-[12px] mt-1.5 leading-relaxed">💡 {s.why}</p>
                  )}
                </button>
              ))}
            </div>
            <p className="text-center text-lilac-soft/50 text-[11px] mt-3">
              탭하면 입력창에 담겨 — 자유롭게 다듬어 보내
            </p>
          </div>
        </div>
      )}

      {suggestOpen && (
        <StarConfirmModal
          cost={SIM_SUGGEST_COST}
          balance={balance}
          loading={suggesting}
          accent="#E8C26A"
          title="답변 추천 받기"
          subtitle="지금 걔한테 할 만한 말 3가지를 골라줄게"
          confirmLabel="추천 받기"
          onConfirm={fetchSuggest}
          onCharge={() => router.push("/shop?reason=sim_suggest")}
          onClose={() => {
            if (!suggesting) setSuggestOpen(false);
          }}
        />
      )}
    </StageFrame>
  );
}
