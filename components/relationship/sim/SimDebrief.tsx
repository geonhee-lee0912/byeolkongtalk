"use client";
// components/relationship/sim/SimDebrief.tsx — 디브리핑 화면(FE7).
// 마운트 시 action:"debrief" 1회 호출(JSON, 스트림 아님) → 로딩 → 통찰/💌보낼말/마무리 3블록 + 보낼 말 복사 + 스레드 CTA.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import StageFrame from "./StageFrame";

export default function SimDebrief({ simReadingId }: { simReadingId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"loading" | "done" | "error">("loading");
  const [debrief, setDebrief] = useState("");
  const [sendMessage, setSendMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
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
  }, [simReadingId]);

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
    <div className="min-h-dvh bg-gradient-to-b from-night-deep to-cream text-eye-purple animate-fade-in">
      <div className="px-5 py-8 max-w-lg mx-auto">
        <h1 className="font-display text-xl text-cream-warm text-center mb-1">오늘 무대, 정리해볼게</h1>
        <div className="mt-6 rounded-2xl bg-cream-warm border border-lilac-mid/20 p-5 whitespace-pre-wrap leading-relaxed text-[15px]">{debrief}</div>
        {sendMessage && (
          <div className="mt-4 rounded-2xl border border-gold/50 bg-gold/10 p-4">
            <div className="text-gold-soft text-[12px] font-bold mb-1.5">💌 이 사람에게 보낼 말</div>
            <p className="text-eye-purple text-[15px] leading-relaxed">{sendMessage}</p>
            <button onClick={copySend} className="mt-3 w-full rounded-xl py-2.5 bg-lilac-deep text-white font-bold text-sm">{copied ? "복사됐어 ✓" : "보낼 말 복사하기"}</button>
          </div>
        )}
        <button onClick={() => router.push("/relationship")} className="mt-6 w-full rounded-xl py-3 border border-lilac-mid/40 text-eye-purple font-medium">별콩이랑 더 얘기하기 →</button>
      </div>
    </div>
  );
}
