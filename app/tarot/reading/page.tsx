"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ChatBubble from "@/components/saju/ChatBubble";
import SafetyBanner from "@/components/safety/SafetyBanner";
import { getCard, getCardImagePath } from "@/lib/tarot/cards";
import { SPREAD_INFO } from "@/lib/tarot/spreads";
import {
  TAROT_DRAW_KEY,
  type TarotDrawResult,
} from "@/lib/tarot/session";
import type { SensitiveCategory } from "@/lib/sensitive";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const END_MARKER = /\[END\]\s*$/;
const CARD_MARKER = /\[CARD:(\d+)\]/g;
// 화면 끝에 걸린 미완성 마커 ([, [C, [CARD:1, [E, [END …) 임시 숨김
const TRAILING_PARTIAL = /\[[A-Z:0-9]*$/;

function stripForDisplay(raw: string): string {
  return raw
    .replace(CARD_MARKER, "")
    .replace(END_MARKER, "")
    .replace(TRAILING_PARTIAL, "")
    .trimStart();
}

function lastCardIndex(raw: string): number | null {
  let m: RegExpExecArray | null;
  let last: number | null = null;
  const re = new RegExp(CARD_MARKER.source, "g");
  while ((m = re.exec(raw)) !== null) {
    last = Number(m[1]) - 1;
  }
  return last;
}

export default function TarotReadingPage() {
  const router = useRouter();
  const [draw, setDraw] = useState<TarotDrawResult | null>(null);
  const [readingId, setReadingId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isEnded, setIsEnded] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [activeCard, setActiveCard] = useState<number | null>(null);
  const [safety, setSafety] = useState<{
    category: SensitiveCategory;
    severity: number;
  } | null>(null);
  const startedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 컨텍스트 로드 + reading 생성 + 첫 풀이 자동 시작
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const raw =
      typeof window !== "undefined"
        ? sessionStorage.getItem(TAROT_DRAW_KEY)
        : null;
    if (!raw) {
      router.replace("/tarot");
      return;
    }
    let parsed: TarotDrawResult;
    try {
      parsed = JSON.parse(raw) as TarotDrawResult;
    } catch {
      router.replace("/tarot");
      return;
    }
    setDraw(parsed);

    void (async () => {
      try {
        const r = await fetch("/api/consultations/tarot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            spreadType: parsed.spreadType,
            spreadCategory: parsed.spreadCategory,
            emotion: parsed.emotion,
            concern: parsed.concern,
            drawnCards: parsed.drawnCards,
          }),
        });
        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          if (data?.code === "LOGIN_REQUIRED") {
            router.push("/login?next=/tarot");
            return;
          }
          if (data?.code === "INSUFFICIENT_STARS") {
            router.push("/shop");
            return;
          }
          setError(data?.error || "시작이 안 됐어. 잠시 후 다시 시도해줄래?");
          return;
        }
        const data = await r.json();
        setReadingId(data.id);
        void sendMessage(parsed.concern, [
          { role: "user", content: parsed.concern },
        ], data.id);
      } catch {
        setError("연결이 잠시 흔들렸어. 다시 시도해줄래?");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, streamingText]);

  async function sendMessage(
    _userContent: string,
    history: Message[],
    rid: string
  ) {
    setMessages(history);
    setIsStreaming(true);
    setStreamingText("");
    setError(null);

    try {
      const r = await fetch("/api/consultations/tarot/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ readingId: rid, messages: history }),
      });
      if (!r.ok || !r.body) {
        const data = await r.json().catch(() => ({}));
        setError(data?.error || "연결이 흔들렸어. 잠시 후 다시 시도해줄래?");
        setIsStreaming(false);
        return;
      }

      const sCat = r.headers.get("X-Sensitive-Category");
      const sSev = r.headers.get("X-Sensitive-Severity");
      if (sCat) {
        setSafety({
          category: sCat as SensitiveCategory,
          severity: Number(sSev ?? 1),
        });
      }

      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setStreamingText(stripForDisplay(accumulated));
        const idx = lastCardIndex(accumulated);
        if (idx !== null) setActiveCard(idx);
      }

      const ended = END_MARKER.test(accumulated);
      const finalText = stripForDisplay(accumulated);

      setMessages([...history, { role: "assistant", content: finalText }]);
      setStreamingText("");
      setIsStreaming(false);
      setActiveCard(null);
      if (ended) setIsEnded(true);
    } catch {
      setError("연결이 흔들렸어. 잠시 후 다시 시도해줄래?");
      setIsStreaming(false);
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming || isEnded || !readingId) return;
    const text = input.trim();
    setInput("");
    void sendMessage(
      text,
      [...messages, { role: "user", content: text }],
      readingId
    );
  };

  if (!draw) {
    return (
      <main className="flex flex-1 items-center justify-center px-5">
        <p className="text-text-light text-sm">카드를 펼치는 중…</p>
      </main>
    );
  }

  const isFirstAssistantInGroup = (idx: number): boolean => {
    if (messages[idx]?.role !== "assistant") return false;
    if (idx === 0) return true;
    return messages[idx - 1].role !== "assistant";
  };

  return (
    <main className="flex flex-1 flex-col items-stretch w-full">
      {/* 상단 카드 스프레드 (sticky) */}
      <div className="sticky top-0 z-10 bg-night/95 backdrop-blur border-b border-lilac-mid/20">
        <div className="max-w-md mx-auto px-5 py-3 flex items-center justify-between">
          <span className="text-[12px] font-bold text-card-gold">
            {SPREAD_INFO[draw.spreadType].label}
          </span>
          <Link href="/tarot" className="text-[11px] text-white/60">
            ‹ 스프레드 다시 고르기
          </Link>
        </div>
        <div className="max-w-md mx-auto px-5 pb-3">
          <div className="flex flex-wrap justify-center gap-2.5">
            {draw.drawnCards.map((c, i) => {
              const card = getCard(c.card_id);
              const active = activeCard === i;
              return (
                <div key={i} className="flex flex-col items-center gap-1">
                  <div
                    className={`relative w-[44px] aspect-[2/3] rounded-md overflow-hidden border transition-all ${
                      active
                        ? "ring-2 ring-card-gold scale-105 border-card-gold"
                        : "border-white/20 opacity-90"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={getCardImagePath(c.card_id)}
                      alt={card?.name_kr ?? ""}
                      className="w-full h-full object-cover"
                      style={{
                        transform:
                          c.direction === "reversed"
                            ? "rotate(180deg)"
                            : "none",
                      }}
                    />
                  </div>
                  <span
                    className={`text-[9px] leading-tight text-center max-w-[48px] ${
                      active ? "text-card-gold" : "text-white/70"
                    }`}
                  >
                    {c.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 채팅 영역 */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
        style={{ maxHeight: "calc(100vh - 220px)" }}
      >
        <div className="max-w-md mx-auto px-5 py-5">
          {safety && (
            <SafetyBanner
              category={safety.category}
              severity={safety.severity}
              onClose={() => setSafety(null)}
            />
          )}
          {messages.map((m, i) => (
            <ChatBubble
              key={i}
              role={m.role}
              content={m.content}
              isFirstInTurn={isFirstAssistantInGroup(i)}
            />
          ))}
          {isStreaming && (
            <ChatBubble
              role="assistant"
              content={streamingText}
              isFirstInTurn={
                messages.length === 0 ||
                messages[messages.length - 1].role !== "assistant"
              }
              streaming
            />
          )}
          {error && (
            <p className="text-[12px] text-red-500 text-center mt-2">{error}</p>
          )}
        </div>
      </div>

      {/* 하단 입력창 또는 종료 CTA */}
      <div className="border-t border-lilac-mid/30 bg-cream">
        <div className="max-w-md mx-auto px-5 py-3">
          {isEnded ? (
            <div className="flex flex-col gap-2">
              <p className="text-[12px] text-text-light text-center">
                별콩이의 풀이가 마무리됐어 ✨
              </p>
              <Link
                href={readingId ? `/tarot/result?id=${readingId}` : "/mypage"}
                className="w-full py-3 rounded-xl bg-lilac-deep text-white font-bold text-[14px] text-center"
              >
                결과 보기 →
              </Link>
              <Link
                href="/mypage"
                className="w-full py-2.5 text-[12px] text-text-light/70 text-center"
              >
                마이페이지에서 다시 보기
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex items-center gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  isStreaming ? "별콩이가 답하는 중…" : "별콩이에게 더 물어보기"
                }
                disabled={isStreaming || !readingId}
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-cream-warm border border-lilac-mid/40 text-eye-purple text-[14px] placeholder:text-text-light/50 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={isStreaming || !input.trim() || !readingId}
                className="px-4 py-2.5 rounded-xl bg-lilac-deep text-white font-bold text-[13px] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                전송
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
