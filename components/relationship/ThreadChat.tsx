"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ChatBubble from "@/components/tarot/ChatBubble";
import { EXTEND_COST, EXTEND_TURNS } from "@/lib/relationship/types";

export interface ThreadChatMsg {
  role: "user" | "assistant";
  content: string;
}

// 완성된 마커 — 화면에 절대 노출 금지 (백엔드 전용 기록/제안 마커)
const MARKER_REGEX = /\[(?:SKILL:[a-z_]+|CHECKIN:[^\]]+)\]/g;
// 스트리밍 중 아직 안 닫힌 마커의 꼬리 — 닫히기 전까지 미리보여 깜빡이지 않게 숨김
const TRAILING_PARTIAL_MARKER =
  /\[(?:S(?:K(?:I(?:L(?:L(?::[a-z_]*)?)?)?)?)?|C(?:H(?:E(?:C(?:K(?:I(?:N(?::[^\]]*)?)?)?)?)?)?)?)?$/;

function displayText(raw: string): string {
  return raw.replace(TRAILING_PARTIAL_MARKER, "").replace(MARKER_REGEX, "").trim();
}

interface ThreadChatProps {
  relationshipId: string;
  initialMessages: ThreadChatMsg[];
  /** 활성 패스가 있어 자유대화 입력을 받을 수 있는지 (S3). false면 입력 숨김(S2) — 단, capReached가 true면 그보다 우선해 연장 칩을 보여준다(S4). */
  canSend: boolean;
  /** 마운트 시점 기준 오늘 소프트캡 도달 여부(S4). 이후 전환은 내부 상태로 관리. */
  capReached: boolean;
  /** 이번 턴 응답으로 오늘 캡에 새로 도달했을 때(S3→S4) — 부모가 잔여 턴 표시 등을 새로고침하도록 알림 */
  onDailyCapReached?: () => void;
  /** 연장 구매 성공(S4→S3) — 부모가 상태를 새로고침하도록 알림 */
  onExtended?: () => void;
  /** 전송 중 패스가 필요하다는 응답(402)을 받았을 때 — 부모가 상태를 새로고침해 패스 패널을 보여주도록 알림 */
  onPassRequired?: () => void;
  className?: string;
}

export default function ThreadChat({
  relationshipId,
  initialMessages,
  canSend,
  capReached,
  onDailyCapReached,
  onExtended,
  onPassRequired,
  className = "",
}: ThreadChatProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<ThreadChatMsg[]>(initialMessages);
  const [liveText, setLiveText] = useState("");
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  // capReached prop은 마운트 시점 초기값일 뿐 — 이후 전환(캡 도달/연장)은 이 상태가 단일 진실 원천.
  const [capReachedLocal, setCapReachedLocal] = useState(capReached);
  const [extending, setExtending] = useState(false);
  const [extendError, setExtendError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const composingRef = useRef(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => el.scrollTo({ top: el.scrollHeight }));
  }, [messages.length, liveText]);

  const autoResize = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  const send = async (text: string) => {
    if (!text.trim() || sending || capReachedLocal || !canSend) return;
    setError(null);
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    setSending(true);
    setLiveText("");

    try {
      const res = await fetch("/api/relationship/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ relationshipId, message: text }),
      });

      if (res.status === 402) {
        setSending(false);
        setError("패스가 필요해 — 대화를 이어가려면 패스를 구매해줘.");
        onPassRequired?.();
        return;
      }
      if (!res.ok || !res.body) {
        setSending(false);
        setError("연결이 흔들렸어. 잠시 후 다시 시도해줄래?");
        return;
      }

      const capHeader = res.headers.get("X-Daily-Cap");

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

      if (capHeader === "reached") {
        setCapReachedLocal(true);
        onDailyCapReached?.();
      }
    } catch {
      setSending(false);
      // liveText는 지우지 않음 — 이미 스트리밍된 내용은 화면에 남기고 에러만 아래에 표기
      setError("연결이 흔들렸어. 잠시 후 다시 시도해줄래?");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    void send(text);
  };

  const handleExtend = async () => {
    if (extending) return;
    setExtending(true);
    setExtendError(null);
    try {
      const res = await fetch("/api/relationship/extend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ relationshipId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 402) {
        if (data?.error === "INSUFFICIENT_STARS") {
          router.push("/shop");
        } else {
          setExtendError("패스가 만료됐어 — 다시 등록해줄래?");
          onPassRequired?.();
        }
        return;
      }
      if (!res.ok) {
        setExtendError("연장이 안 됐어. 잠시 후 다시 시도해줄래?");
        return;
      }
      setCapReachedLocal(false);
      onExtended?.();
    } catch {
      setExtendError("연결이 흔들렸어. 잠시 후 다시 시도해줄래?");
    } finally {
      setExtending(false);
    }
  };

  const showStarter = messages.length === 0 && !sending && !liveText;

  return (
    <div className={`flex flex-col ${className}`}>
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-md mx-auto px-5 py-4">
          {showStarter && (
            <div className="flex flex-col items-center text-center py-10 px-4 animate-fade-in">
              <span className="text-[28px] mb-2" aria-hidden>
                💬
              </span>
              <p className="text-[14px] font-bold text-eye-purple mb-1">
                별콩이랑 얘기 시작하기
              </p>
              <p className="text-[12.5px] text-text-light leading-relaxed">
                지금 마음 편하게 이야기해봐 — 별콩이가 다 기억할게.
              </p>
            </div>
          )}

          {messages.map((msg, i) =>
            msg.role === "user" ? (
              <ChatBubble key={i} role="user" content={msg.content} />
            ) : (
              <ChatBubble
                key={i}
                role="assistant"
                content={displayText(msg.content)}
                showAvatar
                showName
              />
            )
          )}

          {(sending || liveText) && (
            <ChatBubble
              role="assistant"
              content={displayText(liveText)}
              showAvatar
              showName
              streaming={sending}
            />
          )}

          {error && (
            <p className="text-[12px] text-red-500 text-center mt-2">
              {error}
            </p>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-lilac-mid/30 bg-white">
        <div className="max-w-md mx-auto px-5 py-3">
          {capReachedLocal ? (
            <div className="flex flex-col items-center gap-2 py-1">
              <button
                type="button"
                onClick={() => void handleExtend()}
                disabled={extending}
                className="w-full py-3 rounded-xl bg-gold text-night font-bold text-[13.5px] disabled:opacity-60"
              >
                {extending
                  ? "연장하는 중…"
                  : `오늘 대화는 여기까지 · ${EXTEND_COST}별로 ${EXTEND_TURNS}번 더 이어가기`}
              </button>
              <p className="text-[11px] text-text-light text-center">
                내일 자정에 다시 채워져
              </p>
              {extendError && (
                <p className="text-[11px] text-red-500">{extendError}</p>
              )}
            </div>
          ) : canSend ? (
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
                  sending
                    ? "별콩이가 답하는 중…"
                    : "별콩이에게 이야기하기 (Shift+Enter 줄바꿈)"
                }
                disabled={sending}
                maxLength={8000}
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
          ) : null}
        </div>
      </div>
    </div>
  );
}
