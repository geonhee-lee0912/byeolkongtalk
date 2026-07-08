// components/admin/PopupSend.tsx — 유저 상세용 개별 팝업 발송 폼 (client).
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function PopupSend({ userId }: { userId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  async function send() {
    if (!title.trim() || !body.trim()) return;
    if (!confirm("이 유저에게 팝업을 보낼까요?")) return;
    setBusy(true);
    const res = await fetch("/api/admin/popups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body, targetUserId: userId }),
    });
    setBusy(false);
    if (!res.ok) {
      alert("실패: " + ((await res.json().catch(() => ({}))).error ?? res.status));
      return;
    }
    setTitle("");
    setBody("");
    router.refresh();
  }

  return (
    <div className="space-y-2 rounded-xl bg-white/5 p-4">
      <div className="text-sm font-bold">팝업 메시지 보내기</div>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="제목 (최대 100자)"
        maxLength={100}
        className="w-full bg-white/10 rounded px-2 py-1.5 text-sm"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="내용 (최대 2000자) — 유저가 다음 접속 때 팝업으로 봅니다"
        maxLength={2000}
        rows={3}
        className="w-full bg-white/10 rounded px-2 py-1.5 text-sm resize-y"
      />
      <button
        onClick={send}
        disabled={busy || !title.trim() || !body.trim()}
        className="bg-gold text-black px-4 py-1.5 rounded text-sm font-bold disabled:opacity-50"
      >
        보내기
      </button>
    </div>
  );
}
