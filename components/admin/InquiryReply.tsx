// components/admin/InquiryReply.tsx — 어드민 문의 답변 입력
"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function InquiryReply({ id, initial }: { id: string; initial?: string }) {
  const router = useRouter();
  const [answer, setAnswer] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (answer.trim().length < 1) return;
    setBusy(true);
    const res = await fetch(`/api/admin/inquiries/${id}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer: answer.trim() }),
    });
    setBusy(false);
    if (!res.ok) {
      alert("답변 저장 실패");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        rows={6}
        placeholder="사용자에게 보낼 답변을 작성하세요."
        className="w-full bg-night-deep border border-white/15 rounded-lg p-3 text-sm text-white/90 resize-none"
      />
      <button
        onClick={submit}
        disabled={busy || answer.trim().length < 1}
        className="self-end bg-gold text-black font-bold px-4 py-1.5 rounded text-sm disabled:opacity-50"
      >
        {busy ? "저장 중…" : "답변 전송"}
      </button>
    </div>
  );
}
