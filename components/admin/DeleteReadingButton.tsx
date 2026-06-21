// components/admin/DeleteReadingButton.tsx
"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteReadingButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function del() {
    if (!confirm("이 리딩과 대화를 삭제할까요? (복구 불가)")) return;
    setBusy(true);
    const res = await fetch(`/api/admin/readings/${id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) { alert("삭제 실패"); return; }
    router.push("/admin/readings");
  }
  return (
    <button onClick={del} disabled={busy} className="bg-red-600 text-white px-3 py-1 rounded text-sm">
      리딩 삭제
    </button>
  );
}
