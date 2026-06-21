// components/admin/UserActions.tsx — 잔액 조정 / 무료 운세 부여 (client).
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function UserActions({ userId }: { userId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [kind, setKind] = useState("daily");
  const [bonus, setBonus] = useState("");

  async function adjust() {
    if (!delta || !confirm(`별 ${delta} 조정할까요?`)) return;
    setBusy(true);
    const res = await fetch(`/api/admin/users/${userId}/stars/adjust`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ delta: Number(delta), reason }),
    });
    setBusy(false);
    if (!res.ok) { alert("실패: " + (await res.json()).error); return; }
    setDelta(""); setReason(""); router.refresh();
  }

  async function grant() {
    if (!bonus || !confirm(`${kind} 무료 ${bonus}회 부여할까요?`)) return;
    setBusy(true);
    const res = await fetch(`/api/admin/users/${userId}/fortune-grant`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fortuneKind: kind, bonus: Number(bonus), reason }),
    });
    setBusy(false);
    if (!res.ok) { alert("실패: " + (await res.json()).error); return; }
    setBonus(""); router.refresh();
  }

  return (
    <div className="space-y-4 rounded-xl bg-white/5 p-4">
      <div className="space-y-2">
        <div className="text-sm font-bold">별 잔액 조정</div>
        <div className="flex gap-2">
          <input value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="+/- 별"
            className="bg-white/10 rounded px-2 py-1 text-sm w-24" />
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="사유"
            className="bg-white/10 rounded px-2 py-1 text-sm flex-1" />
          <button onClick={adjust} disabled={busy} className="bg-gold text-black px-3 py-1 rounded text-sm">적용</button>
        </div>
      </div>
      <div className="space-y-2">
        <div className="text-sm font-bold">무료 운세 횟수 부여</div>
        <div className="flex gap-2">
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="bg-white text-night rounded px-2 py-1 text-sm">
            <option value="daily">오늘의 운세</option>
            <option value="tarot_daily">오늘의 타로</option>
          </select>
          <input value={bonus} onChange={(e) => setBonus(e.target.value)} placeholder="횟수"
            className="bg-white/10 rounded px-2 py-1 text-sm w-20" />
          <button onClick={grant} disabled={busy} className="bg-gold text-black px-3 py-1 rounded text-sm">부여</button>
        </div>
      </div>
    </div>
  );
}
