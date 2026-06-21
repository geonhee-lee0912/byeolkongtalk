// components/admin/ResolveButton.tsx
"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ResolveButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function resolve() {
    setBusy(true);
    const res = await fetch(`/api/admin/errors/${id}/resolve`, { method: "POST" });
    setBusy(false);
    if (!res.ok) { alert("실패"); return; }
    router.refresh();
  }
  return <button onClick={resolve} disabled={busy} className="bg-lilac-deep px-2 py-1 rounded text-xs">해결</button>;
}
