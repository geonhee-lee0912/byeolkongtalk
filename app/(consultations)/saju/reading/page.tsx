"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import SajuIdentityRow, { sajuCaption } from "@/components/saju/SajuIdentityRow";
import ChatBubble from "@/components/saju/ChatBubble";
import SafetyBanner from "@/components/safety/SafetyBanner";
import type { SajuResult } from "@/lib/saju/calc";
import type { SensitiveCategory } from "@/lib/sensitive";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ReadingProfile {
  displayName: string;
  relationType: string;
  birthDate: string;
  birthTime: string | null;
}

interface CurrentReading {
  readingId: string;
  saju: SajuResult;
  question: string;
  /** 표시용 — 구버전 세션 핸드오프엔 없을 수 있음 */
  profile?: ReadingProfile;
}

const RELATION_LABEL: Record<string, string> = {
  family: "가족",
  friend: "친구",
  partner: "연인",
  other: "기타",
};

const END_MARKER = /\[END\]\s*$/;
const TRAILING_PARTIAL = /\[E?N?D?\]?\s*$/;

export default function ReadingPage() {
  return (
    <Suspense
      fallback={
        <main className="flex flex-1 items-center justify-center px-5">
          <p className="text-text-light text-sm">잠시만…</p>
        </main>
      }
    >
      <ReadingInner />
    </Suspense>
  );
}

function ReadingInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const resumeId = searchParams.get("id");
  const [ctx, setCtx] = useState<CurrentReading | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingText, setStreamingText] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isEnded, setIsEnded] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showSajuBoard, setShowSajuBoard] = useState(true);
  const [safety, setSafety] = useState<{
    category: SensitiveCategory;
    severity: number;
  } | null>(null);
  const startedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 컨텍스트 로드 + 첫 풀이 자동 시작
  useEffect(() => {
    // 이어하기 모드 — 기존 reading 을 불러와 대화를 복원 (별 재차감 X).
    // 메시지가 있으면 startedRef 로 자동 첫 풀이를 막고, 비어 있으면(첫 스트림 도중
    // 이탈해 미저장) 그대로 둬서 아래 자동 시작 effect 가 첫 풀이를 복구한다.
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
            sajuData: SajuResult | null;
            question: string;
            consultationType?: string;
          };
          if (!reading?.sajuData || reading.consultationType === "tarot") {
            router.replace("/readings");
            return;
          }
          const rawMsgs = (d.messages ?? []) as Message[];
          if (rawMsgs.length > 0) {
            startedRef.current = true;
            const restored = rawMsgs.map((m) => ({
              role: m.role,
              content: m.content.replace(/\[END\]/g, "").trim(),
            }));
            setMessages(restored);
            const lastAssistant = [...rawMsgs]
              .reverse()
              .find((m) => m.role === "assistant");
            if (lastAssistant && /\[END\]/.test(lastAssistant.content)) {
              setIsEnded(true);
            }
          }
          const p = d.profile as {
            display_name: string;
            relation_type: string;
            birth_date: string;
            birth_time: string | null;
          } | null;
          setCtx({
            readingId: resumeId,
            saju: reading.sajuData,
            question: reading.question,
            profile: p
              ? {
                  displayName: p.display_name,
                  relationType: p.relation_type,
                  birthDate: p.birth_date,
                  birthTime: p.birth_time,
                }
              : undefined,
          });
        } catch {
          router.replace("/readings");
        }
      })();
      return;
    }

    try {
      const raw = sessionStorage.getItem("byeolkong:current_reading");
      if (!raw) {
        router.replace("/saju");
        return;
      }
      const c = JSON.parse(raw) as CurrentReading;
      if (!c?.readingId || !c?.saju || !c?.question) {
        router.replace("/saju");
        return;
      }
      setCtx(c);
    } catch {
      router.replace("/saju");
    }
  }, [router, resumeId]);

  useEffect(() => {
    if (!ctx) return;
    if (startedRef.current) return;
    startedRef.current = true;
    // 첫 풀이: question 을 user 메시지로 전송 → 별콩이가 자동 응답
    void sendMessage(ctx.question, [{ role: "user", content: ctx.question }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx]);

  // 메시지 추가 시 하단 스크롤
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, streamingText]);

  async function sendMessage(_userContent: string, history: Message[]) {
    if (!ctx) return;
    setMessages(history);
    setIsStreaming(true);
    setStreamingText("");
    setError(null);

    try {
      const r = await fetch("/api/consultations/saju/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ readingId: ctx.readingId, messages: history }),
      });
      if (!r.ok || !r.body) {
        const data = await r.json().catch(() => ({}));
        setError(data?.error || "연결이 흔들렸어. 잠시 후 다시 시도해줄래?");
        setIsStreaming(false);
        return;
      }

      // sensitive 응답 헤더 확인 (서버가 박은 경우만 존재)
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
        // 미완성 [END] 마커 임시 제거 (스트리밍 깜빡임 방지)
        const display = accumulated.replace(TRAILING_PARTIAL, "");
        setStreamingText(display);
      }

      const ended = END_MARKER.test(accumulated);
      const finalText = accumulated.replace(END_MARKER, "").trim();

      setMessages([...history, { role: "assistant", content: finalText }]);
      setStreamingText("");
      setIsStreaming(false);
      if (ended) setIsEnded(true);
    } catch {
      setError("연결이 흔들렸어. 잠시 후 다시 시도해줄래?");
      setIsStreaming(false);
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming || isEnded) return;
    const text = input.trim();
    setInput("");
    void sendMessage(text, [...messages, { role: "user", content: text }]);
  };

  if (!ctx) {
    return (
      <main className="flex flex-1 items-center justify-center px-5">
        <p className="text-text-light text-sm">잠시만…</p>
      </main>
    );
  }

  // assistant 턴별 첫 메시지 판정 (연속 같은 role 이면 첫 메시지에만 아바타)
  const isFirstAssistantInGroup = (idx: number): boolean => {
    if (messages[idx]?.role !== "assistant") return false;
    if (idx === 0) return true;
    return messages[idx - 1].role !== "assistant";
  };

  return (
    <main className="flex flex-1 flex-col items-stretch w-full">
      {/* 상단 사주판 thumbnail (접기/펼치기) */}
      <div className="sticky top-0 z-10 bg-cream/95 backdrop-blur border-b border-lilac-mid/20">
        <div className="max-w-md mx-auto px-5 py-2.5 flex items-center justify-between">
          <button
            onClick={() => setShowSajuBoard((v) => !v)}
            className="flex items-center gap-2 text-[12px] text-eye-purple"
          >
            <span className="font-bold">사주판</span>
            <span className="text-text-light/70">
              {showSajuBoard ? "접기 ▴" : "펼치기 ▾"}
            </span>
          </button>
          <Link
            href="/saju"
            className="text-[11px] text-text-light/70"
          >
            ‹ 처음으로
          </Link>
        </div>
        {showSajuBoard && (
          <div className="max-w-md mx-auto px-5 pb-3">
            <div className="bg-white rounded-2xl p-3 border border-lilac-mid/20 shadow-[0_2px_10px_rgba(159,138,208,0.07)] flex items-center gap-3">
              <SajuIdentityRow
                saju={ctx.saju}
                title={
                  ctx.profile
                    ? ctx.profile.relationType === "self"
                      ? "내 사주"
                      : ctx.profile.displayName
                    : `${ctx.saju.dayStem}${ctx.saju.dayElement} 일간`
                }
                badge={
                  ctx.profile && ctx.profile.relationType !== "self"
                    ? (RELATION_LABEL[ctx.profile.relationType] ?? "지인")
                    : null
                }
                caption={
                  ctx.profile
                    ? sajuCaption(ctx.saju, ctx.profile)
                    : [
                        ctx.saju.input.inputCalendar === "lunar" ? "음력" : "양력",
                        ...(ctx.saju.input.hourKnown ? [] : ["시간 모름"]),
                      ].join(" · ")
                }
              />
            </div>
          </div>
        )}
      </div>

      {/* 채팅 영역 */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
        style={{ maxHeight: "calc(100vh - 180px)" }}
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
                href={`/saju/result?id=${ctx.readingId}`}
                className="w-full py-3 rounded-xl bg-lilac-deep text-white font-bold text-[14px] text-center"
              >
                결과 보기 →
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
                disabled={isStreaming}
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-cream-warm border border-lilac-mid/40 text-eye-purple text-[14px] placeholder:text-text-light/50 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={isStreaming || !input.trim()}
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
