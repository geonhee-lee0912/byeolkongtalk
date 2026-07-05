"use client";

// components/admin/AdSpendForm.tsx — 광고 지출 1행 추가/수정 폼.
import { useState } from "react";
import { useRouter } from "next/navigation";

export function AdSpendForm({ creativeSuggestions }: { creativeSuggestions: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    spend_date: "", campaign: "", adset: "", creative_key: "",
    impressions: "", clicks: "", spend_won: "", reach: "", note: "",
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    if (!form.spend_date || !form.spend_won) {
      alert("날짜와 지출(원)은 필수예요.");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/admin/ads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    setBusy(false);
    if (res.ok) router.refresh();
    else alert("저장 실패: " + (await res.text()));
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-[13px]">
      <label className="flex flex-col gap-1">날짜<input type="date" value={form.spend_date} onChange={(e) => set("spend_date", e.target.value)} className="bg-night rounded px-2 py-1" /></label>
      <label className="flex flex-col gap-1">캠페인<input value={form.campaign} onChange={(e) => set("campaign", e.target.value)} className="bg-night rounded px-2 py-1" /></label>
      <label className="flex flex-col gap-1">광고세트<input value={form.adset} onChange={(e) => set("adset", e.target.value)} className="bg-night rounded px-2 py-1" /></label>
      <label className="flex flex-col gap-1">소재(utm_content)
        <input list="creatives" value={form.creative_key} onChange={(e) => set("creative_key", e.target.value)} className="bg-night rounded px-2 py-1" />
        <datalist id="creatives">{creativeSuggestions.map((c) => <option key={c} value={c} />)}</datalist>
      </label>
      <label className="flex flex-col gap-1">노출<input type="number" value={form.impressions} onChange={(e) => set("impressions", e.target.value)} className="bg-night rounded px-2 py-1" /></label>
      <label className="flex flex-col gap-1">클릭<input type="number" value={form.clicks} onChange={(e) => set("clicks", e.target.value)} className="bg-night rounded px-2 py-1" /></label>
      <label className="flex flex-col gap-1">지출(원)<input type="number" value={form.spend_won} onChange={(e) => set("spend_won", e.target.value)} className="bg-night rounded px-2 py-1" /></label>
      <label className="flex flex-col gap-1">도달<input type="number" value={form.reach} onChange={(e) => set("reach", e.target.value)} className="bg-night rounded px-2 py-1" /></label>
      <button onClick={submit} disabled={busy} className="col-span-2 md:col-span-4 bg-lilac-deep rounded py-2 font-medium disabled:opacity-50">
        {busy ? "저장 중…" : "저장 (같은 날·소재는 덮어씀)"}
      </button>
    </div>
  );
}
