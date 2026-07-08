// components/admin/PopupSend.tsx — 유저 상세용 개별 팝업 발송 (client).
"use client";
import { useRouter } from "next/navigation";
import { PopupComposer } from "./PopupComposer";

export function PopupSend({ userId }: { userId: string }) {
  const router = useRouter();

  async function send(p: {
    title: string;
    body?: string;
    imageUrl?: string;
  }): Promise<boolean> {
    const res = await fetch("/api/admin/popups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...p, targetUserId: userId }),
    });
    if (!res.ok) {
      alert(
        "실패: " + ((await res.json().catch(() => ({}))).error ?? res.status)
      );
      return false;
    }
    router.refresh();
    return true;
  }

  return (
    <div className="space-y-2 rounded-xl bg-white/5 p-4">
      <div className="text-sm font-bold">팝업 메시지 보내기</div>
      <PopupComposer
        submitLabel="보내기"
        confirmMessage="이 유저에게 팝업을 보낼까요?"
        onSubmit={send}
      />
    </div>
  );
}
