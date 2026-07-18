"use client";

// 싸움 잘잘못 판정(dialogue) 채팅 화면 — 짧게 수렴하는 판정 세션.
// readings 단건 조회(/api/readings/[id])는 기존 범용 라우트 재사용, 채팅은 전용 SSE 라우트.
import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ChatBubble from "@/components/tarot/ChatBubble";
import SafetyBanner from "@/components/safety/SafetyBanner";
import type { SensitiveCategory } from "@/lib/sensitive";

interface Message {
  role: "user" | "assistant";
  content: string;
}

// 세션 첫 진입 시 보이지 않게 전송하는 트리거 — 별콩이가 판정 도입(1단계)을 자동으로 열게 함.
const KICKOFF = "우리 사이에 다툼이 있었어. 잘잘못을 판정받고 싶어.";
const END_MARKER_REGEX = /\[END\]/;
// 스트리밍 중 아직 안 닫힌 마커의 꼬리 — 닫히기 전까지 미리 보여 깜빡이지 않게 숨김
const TRAILING_PARTIAL_MARKER = /\[E?N?D?$/;

function displayText(raw: string): string {
  return raw.replace(TRAILING_PARTIAL_MARKER, "").replace(/\[END\]/g, "").trim();
}

export default function VerdictChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [liveText, setLiveText] = useState("");
  const [sending, setSending] = useState(false);
  const [ended, setEnded] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [safety, setSafety] = useState<{
    category: SensitiveCategory;
    severity: number;
  } | null>(null);

  const startedRef = useRef(false);
  const messagesRef = useRef<Message[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const composingRef = useRef(false);

  useEffect(() => {
    messagesRef.current = messages;
  });

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => el.scrollTo({ top: el.scrollHeight }));
  }, [messages.length, liveText]);

  async function sendTurn(history: Message[]) {
    // history 에는 이번 턴의 새 user 발화까지 포함됨 — 여기서 확정해 messages state 의
    // 단일 진실 원천으로 삼는다 (kickoff 첫 턴도 이 경로를 타야 messages[0] 이 비지 않음).
    setMessages(history);
    setSending(true);
    setLiveText("");
    setError(null);
    try {
      const res = await fetch("/api/relationship/verdict/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          readingId: id,
          messages: history.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      if (!res.ok || !res.body) {
        setSending(false);
        setError("연결이 흔들렸어. 잠시 후 다시 시도해줄래?");
        return;
      }

      const sCat = res.headers.get("X-Sensitive-Category");
      if (sCat) {
        setSafety({
          category: sCat as SensitiveCategory,
          severity: Number(res.headers.get("X-Sensitive-Severity")) || 1,
        });
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setLiveText(acc);
      }

      if (acc.trim()) {
        setMessages((prev) => [...prev, { role: "assistant", content: acc }]);
      }
      setLiveText("");
      setSending(false);
      if (END_MARKER_REGEX.test(acc)) {
        setEnded(true);
      }
    } catch {
      setSending(false);
      setError("연결이 흔들렸어. 잠시 후 다시 시도해줄래?");
    }
  }

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    void (async () => {
      try {
        const res = await fetch(`/api/readings/${id}`, { cache: "no-store" });
        if (res.status === 401) {
          router.replace(`/login?next=/relationship/verdict/${id}`);
          return;
        }
        if (!res.ok) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        const data = await res.json();
        if (data?.reading?.consultationType !== "relationship") {
          setNotFound(true);
          setLoading(false);
          return;
        }
        const msgs = (
          (data.messages ?? []) as { role: "user" | "assistant"; content: string }[]
        ).map((m) => ({ role: m.role, content: m.content }));

        setLoading(false);
        if (msgs.length === 0) {
          // 첫 진입 — 별콩이의 판정 도입을 트리거 (화면엔 안 보이는 kickoff 메시지)
          void sendTurn([{ role: "user", content: KICKOFF }]);
        } else {
          setMessages(msgs);
          const lastAssistant = [...msgs].reverse().find((m) => m.role === "assistant");
          if (lastAssistant && END_MARKER_REGEX.test(lastAssistant.content)) {
            setEnded(true);
          }
        }
      } catch {
        setNotFound(true);
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, router]);

  function send(text: string) {
    if (!text.trim() || sending || ended) return;
    const newHistory = [...messagesRef.current, { role: "user" as const, content: text }];
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    void sendTurn(newHistory);
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    send(text);
  };

  const autoResize = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center px-5">
        <p className="text-text-light text-sm">별콩이가 준비하는 중…</p>
      </main>
    );
  }

  if (notFound) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-5 gap-3">
        <p className="text-text-light text-sm">판정을 찾을 수 없어.</p>
        <Link
          href="/relationship"
          className="text-[13px] font-bold text-lilac-deep underline"
        >
          우리 사이로 돌아가기
        </Link>
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
      <div className="shrink-0 w-full max-w-md mx-auto px-5 pt-4 pb-3 border-b border-lilac-soft flex items-center gap-2.5">
        <Link
          href="/relationship"
          aria-label="뒤로"
          className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-lilac-deep hover:bg-lilac-soft/40 active:scale-95 transition"
        >
          <span aria-hidden className="text-[18px]">
            ‹
          </span>
        </Link>
        <h1 className="text-[15px] font-bold text-eye-purple flex items-center gap-1.5">
          <span aria-hidden>⚖️</span> 싸움 잘잘못 판정
        </h1>
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-md mx-auto px-5 py-4">
          {messages.map((msg, i) => {
            if (msg.role === "user") {
              // 첫 kickoff 메시지(index 0)는 화면에 숨김 — 실제 유저 발화가 아님
              if (i === 0) return null;
              return <ChatBubble key={i} role="user" content={msg.content} />;
            }
            return (
              <ChatBubble
                key={i}
                role="assistant"
                content={displayText(msg.content)}
                showAvatar
                showName
              />
            );
          })}

          {(sending || liveText) && (
            <ChatBubble
              role="assistant"
              content={displayText(liveText)}
              showAvatar
              showName
              streaming={sending}
            />
          )}

          {safety && (
            <SafetyBanner
              category={safety.category}
              severity={safety.severity}
              onClose={() => setSafety(null)}
            />
          )}

          {error && (
            <p className="text-[12px] text-red-500 text-center mt-2">{error}</p>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-lilac-mid/30 bg-white">
        <div className="max-w-md mx-auto px-5 py-3">
          {ended ? (
            <div className="flex flex-col gap-2">
              <p className="text-[12px] text-text-light text-center pb-2.5">
                별콩이의 판정이 끝났어 ✨
              </p>
              <Link
                href="/relationship"
                className="w-full py-3 rounded-xl bg-lilac-deep text-white font-bold text-[14px] text-center"
              >
                대화로 돌아가기 →
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex items-end gap-2">
              <textarea
                ref={inputRef}
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
                    handleSubmit(e);
                  }
                }}
                rows={1}
                placeholder={
                  sending
                    ? "별콩이가 답하는 중…"
                    : "별콩이에게 이야기하기 (Shift+Enter 줄바꿈)"
                }
                disabled={sending}
                maxLength={2000}
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-white border border-lilac-mid/40 text-eye-purple text-[14px] leading-[22px] placeholder:text-text-light/50 disabled:opacity-60 resize-none scrollbar-hide focus:outline-none focus:border-lilac-deep focus:ring-2 focus:ring-lilac-deep/30"
                style={{ minHeight: "44px", maxHeight: "120px" }}
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
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
