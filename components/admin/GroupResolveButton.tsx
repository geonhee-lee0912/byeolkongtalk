// components/admin/GroupResolveButton.tsx
"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function GroupResolveButton({ groupKey }: { groupKey: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function resolve() {
    setBusy(true);
    const res = await fetch("/api/admin/errors/resolve-group", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: groupKey }),
    });
    setBusy(false);
    if (!res.ok) {
      alert("해결 처리 실패");
      return;
    }
    router.refresh();
  }

  return (
    <button
      onClick={resolve}
      disabled={busy}
      className="bg-lilac-deep hover:bg-lilac text-white text-xs px-3 py-1.5 rounded font-semibold transition-colors disabled:opacity-50"
    >
      {busy ? "처리중..." : "그룹 전체 해결"}
    </button>
  );
}
