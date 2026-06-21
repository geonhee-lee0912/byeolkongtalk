"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ResolveAllErrorsButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (!confirm("미해결 에러를 전부 해결 처리할까요?")) return;
    setBusy(true);
    const res = await fetch("/api/admin/errors/resolve-all", { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      alert("실패했습니다.");
      return;
    }
    const { count } = await res.json();
    alert(`${count}건 해결`);
    router.refresh();
  }

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      className="bg-lilac-deep text-white px-3 py-1.5 rounded text-sm disabled:opacity-50"
    >
      {busy ? "처리 중..." : "전체 해결"}
    </button>
  );
}
