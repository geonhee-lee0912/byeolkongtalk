"use client";
// components/relationship/sim/SimDebrief.tsx — 디브리핑 화면(FE7).
// 마운트 시 action:"debrief" 1회 호출(JSON) → 로딩 → 통찰/💌보낼말/마무리 + 보낼 말 복사 + 스레드 CTA.
// 다크 톤(무대와 일관) + 경량 마크다운 렌더(**볼드**·*이탤릭*).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import StageFrame from "./StageFrame";

/** 디브리핑 본문의 인라인 마크다운(**볼드**·*이탤릭*)만 경량 렌더. 줄바꿈은 whitespace-pre-wrap 이 담당. */
function renderMd(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith("**")) parts.push(<strong key={key++} className="text-gold-soft">{t.slice(2, -2)}</strong>);
    else parts.push(<em key={key++} className="text-cream-warm/70">{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export default function SimDebrief({
  simReadingId,
  initialDebrief,
  initialSendMessage,
}: {
  simReadingId: string;
  /** 완료 판 재열람 — 저장된 디브리핑 프리로드(있으면 생성 fetch 스킵). */
  initialDebrief?: string;
  initialSendMessage?: string | null;
}) {
  const router = useRouter();
  const [state, setState] = useState<"loading" | "done" | "error">("loading");
  const [debrief, setDebrief] = useState("");
  const [sendMessage, setSendMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    // 재열람: 저장 디브리핑 프리로드 → chat 라우트(생성) 안 부름(완료 판은 409).
    if (initialDebrief != null) {
      setDebrief(initialDebrief);
      setSendMessage(initialSendMessage ?? null);
      setState("done");
      return;
    }
    (async () => {
      try {
        const res = await fetch("/api/relationship/sim/chat", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ simReadingId, action: "debrief" }),
        });
        if (!res.ok) { setState("error"); return; }
        const d = await res.json();
        setDebrief(d.debrief ?? "");
        setSendMessage(d.sendMessage ?? null);
        setState("done");
      } catch { setState("error"); }
    })();
  }, [simReadingId, initialDebrief, initialSendMessage]);

  if (state === "loading")
    return (
      <StageFrame stage>
        <div className="min-h-dvh flex flex-col items-center justify-center gap-3 text-cream-warm">
          <span className="inline-block w-6 h-6 rounded-full border-2 border-gold/30 border-t-gold animate-spin" />
          <p className="text-lilac text-sm">별콩이가 오늘 무대를 정리하고 있어…</p>
        </div>
      </StageFrame>
    );
  if (state === "error")
    return (
      <StageFrame stage>
        <div className="min-h-dvh flex flex-col items-center justify-center gap-3 text-cream-warm px-6 text-center">
          <p>정리 중 문제가 생겼어. 잠시 후 다시 시도해줘.</p>
          <button onClick={() => router.replace("/relationship")} className="text-gold-soft">파일로 돌아가기</button>
        </div>
      </StageFrame>
    );

  async function copySend() {
    if (!sendMessage) return;
    try { await navigator.clipboard.writeText(sendMessage); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* noop */ }
  }

  return (
    <div className="min-h-dvh bg-gradient-to-b from-night to-night-deep text-cream-warm animate-fade-in">
      <div className="px-5 py-8 max-w-lg mx-auto">
        <h1 className="font-display text-xl text-cream-warm text-center mb-6">오늘 무대, 정리해볼게</h1>
        <div className="rounded-2xl bg-night/50 border border-lilac-mid/25 p-5 whitespace-pre-wrap leading-relaxed text-[15px] text-cream-warm/95">
          {renderMd(debrief)}
        </div>
        {sendMessage && (
          <div className="mt-4 rounded-2xl border border-gold/50 bg-gold/10 p-4">
            <div className="text-gold-soft text-[12px] font-bold mb-1.5">💌 이 사람에게 보낼 말</div>
            <p className="text-cream-warm text-[15px] leading-relaxed">{sendMessage}</p>
            <button onClick={copySend} className="mt-3 w-full rounded-xl py-2.5 bg-lilac-deep text-white font-bold text-sm">{copied ? "복사됐어 ✓" : "보낼 말 복사하기"}</button>
          </div>
        )}
        <button onClick={() => router.push("/relationship")} className="mt-6 w-full rounded-xl py-3 bg-cream-warm text-eye-purple font-bold hover:bg-white transition-colors">별콩이랑 더 얘기하기 →</button>
      </div>
    </div>
  );
}
