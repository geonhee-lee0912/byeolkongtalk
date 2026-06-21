// components/admin/RefundButton.tsx
"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function RefundButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function refund() {
    const reason = prompt("환불 사유", "관리자 환불");
    if (reason === null) return;
    setBusy(true);
    const res = await fetch(`/api/admin/payments/${id}/refund`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    setBusy(false);
    if (!res.ok) { alert("환불 실패: " + (await res.json()).error); return; }
    router.refresh();
  }
  return <button onClick={refund} disabled={busy} className="bg-red-600 text-white px-2 py-1 rounded text-xs">환불</button>;
}
