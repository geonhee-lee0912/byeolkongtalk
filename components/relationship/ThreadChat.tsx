"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import ChatBubble from "@/components/tarot/ChatBubble";
import SafetyBanner from "@/components/safety/SafetyBanner";
import type { SensitiveCategory } from "@/lib/sensitive";
import { EXTEND_COST, EXTEND_TURNS } from "@/lib/relationship/types";
import { getSkill } from "@/lib/relationship/skills";
import { useSkillLaunch } from "@/lib/relationship/useSkillLaunch";
import SkillSheet from "./SkillSheet";
import { listActiveSkills } from "@/lib/relationship/skills";

export interface ThreadChatMsg {
  role: "user" | "assistant";
  content: string;
}

// 완성된 마커 — 화면에 절대 노출 금지 (백엔드 전용 기록/제안 마커)
const MARKER_REGEX = /\[(?:SKILL:[a-z_]+|CHECKIN:[^\]]+)\]/g;
// 스트리밍 중 아직 안 닫힌 마커의 꼬리 — 닫히기 전까지 미리보여 깜빡이지 않게 숨김
const TRAILING_PARTIAL_MARKER =
  /\[(?:S(?:K(?:I(?:L(?:L(?::[a-z_]*)?)?)?)?)?|C(?:H(?:E(?:C(?:K(?:I(?:N(?::[^\]]*)?)?)?)?)?)?)?)?$/;
// 완성된 [SKILL:key] 캡처용 — 마커 존재 시 그 자리에 실행 칩을 띄우기 위해 key 를 뽑아낸다.
const SKILL_MARKER_CAPTURE = /\[SKILL:([a-z_]+)\]/;

function displayText(raw: string): string {
  return raw.replace(TRAILING_PARTIAL_MARKER, "").replace(MARKER_REGEX, "").trim();
}

function extractSkillKey(raw: string): string | null {
  const m = SKILL_MARKER_CAPTURE.exec(raw);
  return m ? m[1] : null;
}

interface ThreadChatProps {
  relationshipId: string;
  initialMessages: ThreadChatMsg[];
  /** 활성 패스가 있어 자유대화 입력을 받을 수 있는지 (S3). false면 입력 숨김(S2) — 단, capReached가 true면 그보다 우선해 연장 칩을 보여준다(S4). */
  canSend: boolean;
  /** 마운트 시점 기준 오늘 소프트캡 도달 여부(S4). 이후 전환은 내부 상태로 관리. */
  capReached: boolean;
  /** [SKILL:key] 마커 칩 실행(useSkillLaunch)에 필요 — compat 궁합용 자기/상대 프로필 id. */
  selfProfileId?: string | null;
  partnerProfileId?: string | null;
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
  selfProfileId = null,
  partnerProfileId = null,
  onDailyCapReached,
  onExtended,
  onPassRequired,
  className = "",
}: ThreadChatProps) {
  const router = useRouter();
  const { launch, busyKey, toastMsg } = useSkillLaunch({
    relationshipId,
    selfProfileId,
    partnerProfileId,
  });
  const [messages, setMessages] = useState<ThreadChatMsg[]>(initialMessages);
  const [liveText, setLiveText] = useState("");
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  // capReached prop은 마운트 시점 초기값일 뿐 — 이후 전환(캡 도달/연장)은 이 상태가 단일 진실 원천.
  const [capReachedLocal, setCapReachedLocal] = useState(capReached);
  const [extending, setExtending] = useState(false);
  const [extendError, setExtendError] = useState<string | null>(null);
  // 위기 시그널 — chat 라우트가 X-Sensitive-* 헤더로 알림 (타로/사주와 동일 안전망)
  const [safety, setSafety] = useState<{ category: SensitiveCategory; severity: number } | null>(null);
  const [showSkills, setShowSkills] = useState(false);

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

          {messages.map((msg, i) => {
            if (msg.role === "user") {
              return <ChatBubble key={i} role="user" content={msg.content} />;
            }
            // 완료된 assistant 메시지에 [SKILL:key] 마커가 있으면 그 자리에 실행 칩 노출.
            const skillKey = extractSkillKey(msg.content);
            const skill = skillKey ? getSkill(skillKey) : null;
            return (
              <div key={i}>
                <ChatBubble
                  role="assistant"
                  content={displayText(msg.content)}
                  showAvatar
                  showName
                />
                {skill && skill.active && (
                  <div className="flex justify-start pl-10 -mt-1 mb-3">
                    <button
                      type="button"
                      onClick={() => launch(skill.key)}
                      disabled={busyKey === skill.key}
                      className="flex items-center gap-1.5 rounded-full border border-lilac-mid/30 bg-white px-3 py-1.5 whitespace-nowrap active:scale-[0.97] transition disabled:opacity-60"
                    >
                      <span aria-hidden>{skill.emoji}</span>
                      <span className="text-[12px] font-bold text-eye-purple">
                        {busyKey === skill.key ? "여는 중…" : skill.label}
                      </span>
                      <span className="text-[11px] font-bold text-lilac-deep">
                        ⭐{skill.starCost}
                      </span>
                    </button>
                  </div>
                )}
              </div>
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
            <p className="text-[12px] text-red-500 text-center mt-2">
              {error}
            </p>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-lilac-mid/30 bg-white">
        <div className="max-w-md mx-auto px-5 py-3">
          {capReachedLocal ? (
            <div className="flex flex-col items-center gap-1.5 py-1">
              <button
                type="button"
                onClick={() => void handleExtend()}
                disabled={extending}
                className="inline-flex items-center gap-1.5 rounded-full bg-lilac-deep text-white font-bold text-[12.5px] px-4 py-2.5 active:scale-[0.97] transition disabled:opacity-60"
              >
                <span aria-hidden>💬</span>
                {extending
                  ? "연장하는 중…"
                  : `오늘 대화 추가 구매 · ⭐${EXTEND_COST}로 ${EXTEND_TURNS}번 더`}
              </button>
              <p className="text-[11px] text-text-light text-center">
                오늘은 여기까지 · 내일 자정에 다시 채워져
              </p>
              {extendError && <p className="text-[11px] text-red-500">{extendError}</p>}
            </div>
          ) : canSend ? (
            <form onSubmit={handleSubmit} className="flex items-end gap-2">
              <button
                type="button"
                onClick={() => setShowSkills(true)}
                aria-label="스킬 열기"
                className="shrink-0 h-[44px] w-[44px] rounded-xl bg-lilac-soft/50 text-lilac-deep flex items-center justify-center active:scale-95 transition"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M11,15H6L13,1V9H18L11,23V15Z" />
                </svg>
              </button>
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

      {toastMsg &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed bottom-24 inset-x-0 z-[90] flex justify-center px-8 pointer-events-none">
            <div className="max-w-xs text-center bg-night/90 text-cream text-[12.5px] rounded-full px-4 py-2.5 shadow-lg animate-fade-in">
              {toastMsg}
            </div>
          </div>,
          document.body
        )}

      {showSkills && (
        <SkillSheet
          skills={listActiveSkills()}
          busyKey={busyKey}
          onLaunch={(k) => {
            setShowSkills(false);
            launch(k);
          }}
          onClose={() => setShowSkills(false)}
        />
      )}
    </div>
  );
}
