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
  /** 부재 감지 멘트 — 화면 표시 전용. API/ DB/ 턴 카운트 제외 */
  ephemeral?: boolean;
}

const TYPING_SPEED = 45;
const THINKING_PROBABILITY = 0.2; // 새 버블 생성 전 "생각 중" pause 확률
const DEBOUNCE_FLUSH_MS = 2000;
const IDLE_NUDGE_1_MS = 10000;
const IDLE_NUDGE_2_MS = 40000; // 1단계 멘트 이후 추가 대기
const NUDGE_STAGE_1 = [
  "어디 갔어~? 천천히 생각해도 괜찮아 :)",
  "음, 아직 거기 있어? 별콩이 여기서 기다릴게",
  "다른 거 하는 중이야? 돌아오면 마저 봐줄게",
];
const NUDGE_STAGE_2 = [
  "별콩이 여기 있을게, 천천히 와",
  "급할 거 없어. 마음 정리되면 다시 얘기하자",
];
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

  const messagesRef = useRef<Message[]>([]);
  const pendingFragmentsRef = useRef<string[]>([]);
  const baseHistoryRef = useRef<Message[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleStageRef = useRef(0); // 0=아직, 1=1단계 후, 2=종료
  const flushPendingRef = useRef<() => void>(() => {});
  const runIdleNudgeRef = useRef<() => void>(() => {});

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
          // 메시지가 없으면(이어가기 deep 로 갓 생성됐거나 첫 스트림 도중 이탈해 미저장)
          // 첫 풀이를 자동 생성, 있으면 대화 복원.
          if (msgs.length === 0) {
            void sendMessage(
              [{ role: "user", content: reading.question }],
              resumeId
            );
          } else {
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
          }
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
        const contRaw =
          typeof window !== "undefined"
            ? sessionStorage.getItem("byeolkong:continuation")
            : null;
        let cont: { previousReadingId?: string; mode?: string } = {};
        try {
          cont = contRaw ? JSON.parse(contRaw) : {};
        } catch {
          cont = {};
        }
        const r = await fetch("/api/consultations/tarot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            spreadType: parsed.spreadType,
            spreadCategory: parsed.spreadCategory,
            emotion: parsed.emotion,
            concern: parsed.concern,
            drawnCards: parsed.drawnCards,
            previousReadingId: cont.previousReadingId,
            continuationMode: cont.mode === "fresh" ? "fresh" : undefined,
          }),
        });
        if (typeof window !== "undefined") {
          sessionStorage.removeItem("byeolkong:continuation");
        }
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
    messagesRef.current = messages;
  });

  useEffect(() => {
    flushPendingRef.current = flushPending;
  });

  useEffect(() => {
    runIdleNudgeRef.current = runIdleNudge;
  });

  useEffect(() => {
    return () => {
      stopTyping();
      clearFlushTimer();
      clearIdleTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        // 답변 첫 글자가 뜨는 순간 스크롤 억제 해제 — 첫 말풍선부터 따라 내려가도록
        if (currentIndex === 0) suppressScrollUntilRef.current = 0;
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

  function clearFlushTimer() {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
  }

  function clearIdleTimer() {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }

  function armFlushTimer() {
    clearFlushTimer();
    flushTimerRef.current = setTimeout(
      () => flushPendingRef.current(),
      DEBOUNCE_FLUSH_MS
    );
  }

  function armIdleTimer(delay: number) {
    clearIdleTimer();
    idleTimerRef.current = setTimeout(
      () => runIdleNudgeRef.current(),
      delay
    );
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
      if (hasEnd) {
        setIsEnded(true);
      } else {
        idleStageRef.current = 0;
        armIdleTimer(IDLE_NUDGE_1_MS);
      }
    }, 80);
  }

  async function sendMessage(
    history: Message[],
    rid: string,
    opts?: { forceEnd?: boolean; skipSetMessages?: boolean }
  ) {
    const forceEnd = opts?.forceEnd ?? false;
    clearFlushTimer();
    clearIdleTimer();
    if (!opts?.skipSetMessages) setMessages(history);
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
        body: JSON.stringify({
          readingId: rid,
          // ephemeral(부재 멘트) 제외 + role/content 만 추려 전송.
          // 이어하기로 불러온 메시지에 붙은 created_at 등 DB 필드를 보내면
          // Anthropic API 가 "Extra inputs are not permitted" 로 거절함.
          messages: history
            .filter((m) => !m.ephemeral)
            .map((m) => ({ role: m.role, content: m.content })),
          forceEnd,
        }),
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

  function flushPending() {
    if (pendingFragmentsRef.current.length === 0) return;
    if (input.trim()) return; // 입력창에 글자 남아있으면 보류 (다음 활동 때 재무장)
    if (isStreaming || isEnded || !readingId) return;

    const merged = pendingFragmentsRef.current.join("\n");
    pendingFragmentsRef.current = [];
    clearFlushTimer();

    const apiHistory: Message[] = [
      ...baseHistoryRef.current.filter((m) => !m.ephemeral),
      { role: "user", content: merged },
    ];
    void sendMessage(apiHistory, readingId, { skipSetMessages: true });

    suppressScrollUntilRef.current = Date.now() + 1500;
  }

  function pushNudge(pool: string[]) {
    const text = pool[Math.floor(Math.random() * pool.length)];
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: text, ephemeral: true },
    ]);
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    });
  }

  function runIdleNudge() {
    // 게이트: 대기 조각 없음 + 입력 빔 + 비스트리밍 + 미종료 + 별콩이가 1회 이상 응답
    if (pendingFragmentsRef.current.length > 0) return;
    if (input.trim()) return;
    if (isStreaming || isEnded || !readingId) return;
    const assistantSpoke = messagesRef.current.some(
      (m) => m.role === "assistant" && !m.ephemeral
    );
    if (!assistantSpoke) return;

    const stage = idleStageRef.current;
    if (stage === 0) {
      pushNudge(NUDGE_STAGE_1);
      idleStageRef.current = 1;
      armIdleTimer(IDLE_NUDGE_2_MS);
    } else if (stage === 1) {
      pushNudge(NUDGE_STAGE_2);
      idleStageRef.current = 2;
      // 종료 — 더는 무장하지 않음
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isStreaming || isEnded || !readingId) return;

    // 대기 묶음 시작(0→1) 시점에 현재까지의 히스토리를 base로 스냅샷
    if (pendingFragmentsRef.current.length === 0) {
      baseHistoryRef.current = messagesRef.current;
    }
    pendingFragmentsRef.current.push(text);

    // 화면엔 보낸 대로 user 버블 즉시 표시
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";

    // idle 중단 + 플러시 타이머 재무장
    clearIdleTimer();
    idleStageRef.current = 0;
    armFlushTimer();

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

  const handleFinish = () => {
    if (isStreaming || isEnded || !readingId) return;
    clearFlushTimer();
    clearIdleTimer();
    idleStageRef.current = 0;

    const tail = input.trim();
    const hadPending = pendingFragmentsRef.current.length > 0;
    const base = hadPending ? baseHistoryRef.current : messagesRef.current;
    const frags = [...pendingFragmentsRef.current];

    if (tail) {
      frags.push(tail);
      // 아직 버블이 없는 현재 입력은 화면에도 추가
      setMessages((prev) => [...prev, { role: "user", content: tail }]);
      setInput("");
      if (inputRef.current) inputRef.current.style.height = "auto";
    }
    pendingFragmentsRef.current = [];

    // 마무리 의사 표시 — user 말풍선으로 띄우고 전송 내용에도 포함
    const FINISH_PHRASE = "대화 마무리할게";
    frags.push(FINISH_PHRASE);
    setMessages((prev) => [...prev, { role: "user", content: FINISH_PHRASE }]);

    const merged = frags.join("\n");

    const apiHistory: Message[] = [
      ...base.filter((m) => !m.ephemeral),
      { role: "user", content: merged },
    ];
    void sendMessage(apiHistory, readingId, {
      forceEnd: true,
      skipSetMessages: true,
    });

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
      <div className="shrink-0 border-t border-lilac-mid/30 bg-white">
        <div className="max-w-md mx-auto px-5 py-3">
          {isEnded ? (
            <div className="flex flex-col gap-2">
              <p className="text-[12px] text-text-light text-center pb-2.5">
                별콩이의 풀이가 마무리됐어 ✨
              </p>
              <Link
                href={readingId ? `/tarot/result?id=${readingId}` : "/mypage"}
                className="w-full py-3 rounded-xl bg-lilac-deep text-white font-bold text-[14px] text-center"
              >
                결과 보기 →
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  autoResizeInput();
                  clearIdleTimer();
                  idleStageRef.current = 0;
                  if (pendingFragmentsRef.current.length > 0) armFlushTimer();
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
                maxLength={500}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-lilac-mid/40 text-eye-purple text-[14px] leading-[22px] placeholder:text-text-light/50 disabled:opacity-60 resize-none scrollbar-hide focus:outline-none focus:border-lilac-deep focus:ring-2 focus:ring-lilac-deep/30"
                style={{ minHeight: "44px", maxHeight: "120px" }}
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleFinish}
                  disabled={isStreaming || !readingId}
                  className="flex-1 h-[44px] rounded-xl border border-lilac-deep/40 text-lilac-deep font-bold text-[13px] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  대화 마무리
                </button>
                <button
                  type="submit"
                  disabled={isStreaming || !input.trim() || !readingId}
                  className="flex-1 h-[44px] rounded-xl bg-lilac-deep text-white font-bold text-[13px] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                >
                  전송
                  <span className="text-[11px] font-normal text-white/70">
                    {input.length}/500
                  </span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
