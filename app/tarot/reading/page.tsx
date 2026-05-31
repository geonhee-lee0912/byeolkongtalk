"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import ChatBubble from "@/components/tarot/ChatBubble";
import CardSpreadView from "@/components/tarot/CardSpreadView";
import SafetyBanner from "@/components/safety/SafetyBanner";
import { EMOTION_OPTIONS } from "@/lib/emotions";
import { TAROT_DRAW_KEY, type TarotDrawResult } from "@/lib/tarot/session";
import type { SensitiveCategory } from "@/lib/sensitive";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const TYPING_SPEED = 45;
const THINKING_PROBABILITY = 0.2; // 새 버블 생성 전 "생각 중" pause 확률
const CARD_MARKER_REGEX = /\[CARD:(\d+)\]/g;
const END_MARKER_REGEX = /\[END\]/gi;
// 미완성 마커 (e.g., "[CA", "[CARD:", "[CARD:1", "[E", "[EN", "[END") 제거용 — 버블 깜빡임 방지
const TRAILING_PARTIAL_MARKER =
  /\[(?:C(?:A(?:R(?:D(?::\d*)?)?)?)?|E(?:N(?:D)?)?)?$/;

interface Bubble {
  text: string;
  cardIndex: number | null;
  showCardImage: boolean;
}

/** 원문 버퍼를 문단 + [CARD:n] 마커 기준으로 버블 배열로 파싱 */
function parseIntoBubbles(raw: string): Bubble[] {
  const bubbles: Bubble[] = [];
  const cleaned = raw
    .replace(TRAILING_PARTIAL_MARKER, "")
    .replace(END_MARKER_REGEX, "");
  const tokens = cleaned.split(/(\[CARD:\d+\])/g);
  let currentCardIndex: number | null = null;
  let nextIsFirstInSection = false;

  for (const token of tokens) {
    const markerMatch = /^\[CARD:(\d+)\]$/.exec(token);
    if (markerMatch) {
      currentCardIndex = parseInt(markerMatch[1], 10) - 1;
      nextIsFirstInSection = true;
      continue;
    }
    const paras = token
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
    for (const p of paras) {
      bubbles.push({
        text: p,
        cardIndex: currentCardIndex,
        showCardImage: nextIsFirstInSection,
      });
      nextIsFirstInSection = false;
    }
  }
  return bubbles;
}

/** 버퍼에서 가장 최근에 등장한 [CARD:n] 의 n 반환 (1-based) */
function getLatestCardIndex(text: string): number | null {
  let lastMatch: RegExpExecArray | null = null;
  const regex = new RegExp(CARD_MARKER_REGEX.source, "g");
  let m;
  while ((m = regex.exec(text)) !== null) {
    lastMatch = m;
  }
  return lastMatch ? parseInt(lastMatch[1], 10) : null;
}

export default function TarotReadingPage() {
  return (
    <Suspense
      fallback={
        <main className="flex flex-1 items-center justify-center px-5">
          <p className="text-text-light text-sm">카드를 펼치는 중…</p>
        </main>
      }
    >
      <TarotReadingInner />
    </Suspense>
  );
}

function TarotReadingInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const resumeId = searchParams.get("id");
  const [draw, setDraw] = useState<TarotDrawResult | null>(null);
  const [readingId, setReadingId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingBubbles, setStreamingBubbles] = useState<Bubble[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [showPendingDots, setShowPendingDots] = useState(false);
  const [isEnded, setIsEnded] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [activeCardIndex, setActiveCardIndex] = useState<number | null>(null);
  const [concernExpanded, setConcernExpanded] = useState(false);
  const [safety, setSafety] = useState<{
    category: SensitiveCategory;
    severity: number;
  } | null>(null);

  const startedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bufferRef = useRef("");
  const displayIndexRef = useRef(0);
  const typingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fetchDoneRef = useRef(false);
  const lastScrollRef = useRef(0);
  const pauseUntilRef = useRef(0);
  const lastStableBubbleCountRef = useRef(0);
  const suppressScrollUntilRef = useRef(0);
  const showPendingDotsRef = useRef(false);
  const composingRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // 컨텍스트 로드 + reading 생성 + 첫 풀이 자동 시작
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    // 이어하기 모드 — 기존 reading 을 불러와 대화를 복원 (별 재차감 X)
    if (resumeId) {
      void (async () => {
        try {
          const r = await fetch(`/api/readings/${resumeId}`, {
            cache: "no-store",
          });
          if (!r.ok) {
            router.replace("/readings");
            return;
          }
          const d = await r.json();
          const reading = d.reading as {
            spreadType: TarotDrawResult["spreadType"];
            spreadCategory: TarotDrawResult["spreadCategory"];
            emotionTag: string | null;
            question: string;
            drawnCards: TarotDrawResult["drawnCards"] | null;
          };
          const msgs = (d.messages ?? []) as Message[];
          if (!reading.drawnCards || reading.drawnCards.length === 0) {
            router.replace("/readings");
            return;
          }
          setDraw({
            spreadType: reading.spreadType,
            spreadCategory: reading.spreadCategory,
            emotion: (reading.emotionTag ?? "") as TarotDrawResult["emotion"],
            concern: reading.question,
            drawnCards: reading.drawnCards,
          });
          setReadingId(resumeId);
          setMessages(msgs);
          const lastAssistant = [...msgs]
            .reverse()
            .find((m) => m.role === "assistant");
          if (lastAssistant && END_MARKER_REGEX.test(lastAssistant.content)) {
            setIsEnded(true);
          }
          END_MARKER_REGEX.lastIndex = 0;
          // 복원 직후 마지막 대화가 보이도록 하단으로 스크롤
          setTimeout(() => {
            const el = scrollRef.current;
            if (el) el.scrollTo({ top: el.scrollHeight });
          }, 120);
        } catch {
          router.replace("/readings");
        }
      })();
      return;
    }

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
        // 첫 풀이 — concern 은 messages[0] 로 전송하지만 화면 버블로는 안 그림
        void sendMessage(
          [{ role: "user", content: parsed.concern }],
          data.id
        );
      } catch {
        setError("연결이 잠시 흔들렸어. 다시 시도해줄래?");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, resumeId]);

  useEffect(() => {
    return () => stopTyping();
  }, []);

  const emotionEmoji = useMemo(() => {
    if (!draw) return "✨";
    return (
      EMOTION_OPTIONS.find((e) => e.tag === draw.emotion)?.emoji ?? "✨"
    );
  }, [draw]);

  // 컨테이너 하단 스크롤 — 쓰로틀 + 유저 전송 직후 일시정지 존중
  function scrollToBottom() {
    const el = scrollRef.current;
    if (!el) return;
    const now = Date.now();
    if (now < suppressScrollUntilRef.current) return;
    if (now - lastScrollRef.current < 120) return;
    lastScrollRef.current = now;
    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
    });
  }

  function startTyping() {
    if (typingIntervalRef.current) return;
    pauseUntilRef.current = 0;
    lastStableBubbleCountRef.current = 0;

    typingIntervalRef.current = setInterval(() => {
      const now = Date.now();
      if (now < pauseUntilRef.current) return;

      if (showPendingDotsRef.current) {
        showPendingDotsRef.current = false;
        setShowPendingDots(false);
      }

      const buffer = bufferRef.current;
      const currentIndex = displayIndexRef.current;

      if (currentIndex < buffer.length) {
        const nextIndex = currentIndex + 1;
        const nextVisible = buffer.slice(0, nextIndex);
        const parsed = parseIntoBubbles(nextVisible);

        const isNewBubble =
          parsed.length > lastStableBubbleCountRef.current &&
          lastStableBubbleCountRef.current > 0;

        if (isNewBubble && Math.random() < THINKING_PROBABILITY) {
          pauseUntilRef.current = now + 700 + Math.floor(Math.random() * 700);
          showPendingDotsRef.current = true;
          setShowPendingDots(true);
          lastStableBubbleCountRef.current = parsed.length;
          return;
        }

        lastStableBubbleCountRef.current = parsed.length;
        displayIndexRef.current = nextIndex;
        setStreamingBubbles(parsed);

        const latest = getLatestCardIndex(nextVisible);
        if (latest !== null) setActiveCardIndex(latest - 1);
        scrollToBottom();
      } else if (fetchDoneRef.current) {
        stopTyping();
        finishMessage();
      }
    }, TYPING_SPEED);
  }

  function stopTyping() {
    if (typingIntervalRef.current) {
      clearInterval(typingIntervalRef.current);
      typingIntervalRef.current = null;
    }
  }

  function finishMessage() {
    const finalContent = bufferRef.current;
    if (!finalContent) {
      setIsStreaming(false);
      setStreamingBubbles([]);
      return;
    }

    const hasEnd = END_MARKER_REGEX.test(finalContent);
    END_MARKER_REGEX.lastIndex = 0;

    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: finalContent },
      ]);
      setStreamingBubbles([]);
      setIsStreaming(false);
      setActiveCardIndex(null);
      if (hasEnd) setIsEnded(true);
    }, 80);
  }

  async function sendMessage(history: Message[], rid: string) {
    setMessages(history);
    setIsStreaming(true);
    setStreamingBubbles([]);
    setShowPendingDots(false);
    showPendingDotsRef.current = false;
    bufferRef.current = "";
    displayIndexRef.current = 0;
    fetchDoneRef.current = false;
    setActiveCardIndex(null);
    setError(null);

    startTyping();

    try {
      const r = await fetch("/api/consultations/tarot/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ readingId: rid, messages: history }),
      });
      if (!r.ok || !r.body) {
        const data = await r.json().catch(() => ({}));
        setError(data?.error || "연결이 흔들렸어. 잠시 후 다시 시도해줄래?");
        stopTyping();
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
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bufferRef.current += decoder.decode(value, { stream: true });
      }
      fetchDoneRef.current = true;
    } catch {
      fetchDoneRef.current = true;
      stopTyping();
      setError("연결이 흔들렸어. 잠시 후 다시 시도해줄래?");
      setIsStreaming(false);
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming || isEnded || !readingId) return;
    const text = input.trim();
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";

    const history = [...messages, { role: "user" as const, content: text }];
    void sendMessage(history, readingId);

    // 유저 발화 직후 — 유저 버블이 컨테이너 상단 근처에 오도록 스크롤
    suppressScrollUntilRef.current = Date.now() + 1500;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (!el) return;
        const userBubbles = el.querySelectorAll<HTMLElement>(".justify-end");
        const last = userBubbles[userBubbles.length - 1];
        if (last) {
          el.scrollTo({
            top: Math.max(0, last.offsetTop - 16),
            behavior: "smooth",
          });
        }
      });
    });
  };

  const autoResizeInput = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  if (!draw) {
    return (
      <main className="flex flex-1 items-center justify-center px-5">
        <p className="text-text-light text-sm">카드를 펼치는 중…</p>
      </main>
    );
  }

  return (
    <main
      className="flex flex-col items-stretch w-full min-h-0"
      style={{
        height: "calc(100dvh - 3.5rem - 4rem - env(safe-area-inset-bottom))",
      }}
    >
      {/* 스크롤 영역 — 고민 + 카드 스프레드 + 대화 */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-md mx-auto px-5 py-4">
          {safety && (
            <SafetyBanner
              category={safety.category}
              severity={safety.severity}
              onClose={() => setSafety(null)}
            />
          )}

          {/* 고민 컨텍스트 — 접기/펼치기 토글, 디폴트 접힘 */}
          <button
            type="button"
            onClick={() => setConcernExpanded((v) => !v)}
            className="w-full text-left mb-4 px-4 py-3 bg-cream-warm rounded-2xl border border-lilac-mid/20 hover:border-lilac-mid/40 transition-colors"
            aria-expanded={concernExpanded}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-[14px] shrink-0">{emotionEmoji}</span>
              <span className="text-[12px] font-bold text-text-light tracking-wide shrink-0">
                {draw.emotion}
              </span>
              {!concernExpanded && (
                <span className="text-[12px] text-text-light/70 truncate flex-1 ml-1">
                  · {draw.concern || "지금 내 흐름이 궁금해"}
                </span>
              )}
              <span
                className={`text-text-light text-[14px] shrink-0 transition-transform ml-auto ${
                  concernExpanded ? "rotate-180" : ""
                }`}
              >
                ▾
              </span>
            </div>
            {concernExpanded && (
              <p className="text-[13px] text-eye-purple leading-relaxed whitespace-pre-wrap break-words mt-2">
                {draw.concern || "지금 내 흐름이 궁금해"}
              </p>
            )}
          </button>

          {/* 카드 영역 (다크 배경 + 별 파티클) */}
          <CardSpreadView
            drawnCards={draw.drawnCards}
            spreadType={draw.spreadType}
            activeIndex={activeCardIndex}
          />

          {/* 대화 영역 */}
          <div className="mt-5 flex flex-col">
            {messages.map((msg, msgI) => {
              // 첫 user 메시지(고민)는 위 컨텍스트 박스에 있으므로 버블 생략
              if (msg.role === "user") {
                if (msgI === 0) return null;
                return (
                  <ChatBubble key={msgI} role="user" content={msg.content} />
                );
              }
              const bubbles = parseIntoBubbles(msg.content);
              return bubbles.map((b, bI) => {
                const isTurnFirst = bI === 0;
                return (
                  <ChatBubble
                    key={`${msgI}-${bI}`}
                    role="assistant"
                    content={b.text}
                    showAvatar={isTurnFirst}
                    showName={isTurnFirst}
                    cardIndex={b.cardIndex}
                    showCardImage={b.showCardImage}
                    drawnCards={draw.drawnCards}
                  />
                );
              });
            })}

            {isStreaming &&
              streamingBubbles.map((b, i, arr) => {
                const isLast = i === arr.length - 1;
                const isTurnFirst = i === 0;
                return (
                  <ChatBubble
                    key={`stream-${i}`}
                    role="assistant"
                    content={b.text}
                    showAvatar={isTurnFirst}
                    showName={isTurnFirst}
                    cardIndex={b.cardIndex}
                    showCardImage={b.showCardImage}
                    drawnCards={draw.drawnCards}
                    streaming={isLast && !showPendingDots}
                  />
                );
              })}

            {/* 신규 버블 직전 또는 스트림 시작 직후 dots 인디케이터 */}
            {isStreaming &&
              (showPendingDots || streamingBubbles.length === 0) && (
                <ChatBubble
                  role="assistant"
                  content=""
                  showAvatar={streamingBubbles.length === 0}
                  showName={streamingBubbles.length === 0}
                  drawnCards={draw.drawnCards}
                  streaming
                />
              )}

            {error && (
              <p className="text-[12px] text-red-500 text-center mt-2">
                {error}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* 하단 입력창 또는 종료 CTA */}
      <div className="shrink-0 border-t border-lilac-mid/30 bg-cream">
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
            <form onSubmit={handleSubmit} className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  autoResizeInput();
                }}
                onCompositionStart={() => {
                  composingRef.current = true;
                }}
                onCompositionEnd={() => {
                  composingRef.current = false;
                }}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !e.shiftKey &&
                    !composingRef.current
                  ) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
                rows={1}
                placeholder={
                  isStreaming
                    ? "별콩이가 답하는 중…"
                    : "별콩이에게 더 물어보기 (Shift+Enter 줄바꿈)"
                }
                disabled={isStreaming || !readingId}
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-cream-warm border border-lilac-mid/40 text-eye-purple text-[14px] leading-[22px] placeholder:text-text-light/50 disabled:opacity-60 resize-none scrollbar-hide"
                style={{ minHeight: "44px", maxHeight: "120px" }}
              />
              <button
                type="submit"
                disabled={isStreaming || !input.trim() || !readingId}
                className="shrink-0 h-[44px] px-4 rounded-xl bg-lilac-deep text-white font-bold text-[13px] disabled:opacity-50 disabled:cursor-not-allowed"
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
