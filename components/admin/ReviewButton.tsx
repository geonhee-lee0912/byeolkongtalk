// components/admin/ReviewButton.tsx
"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

const ACTIONS = [
  { value: "no_action", label: "조치 없음" },
  { value: "contacted", label: "연락함" },
  { value: "forwarded", label: "기관 전달" },
  { value: "false_positive", label: "오탐" },
];

export function ReviewButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState("no_action");
  const [note, setNote] = useState("");

  async function submit() {
    setBusy(true);
    const res = await fetch(`/api/admin/sensitive/${id}/review`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, note }),
    });
    setBusy(false);
    if (!res.ok) { alert("실패"); return; }
    setOpen(false); router.refresh();
  }

  if (!open) {
    return <button onClick={() => setOpen(true)} className="bg-lilac-deep px-2 py-1 rounded text-xs">검토</button>;
  }
  return (
    <div className="flex flex-col gap-1 items-end">
      <select value={action} onChange={(e) => setAction(e.target.value)} className="bg-white/10 rounded px-1 py-0.5 text-xs">
        {ACTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
      </select>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="메모(선택)" className="bg-white/10 rounded px-1 py-0.5 text-xs" />
      <button onClick={submit} disabled={busy} className="bg-gold text-black px-2 py-0.5 rounded text-xs">완료</button>
    </div>
  );
}
