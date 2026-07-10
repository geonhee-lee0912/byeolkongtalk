"use client";

// components/admin/AdSpendUpload.tsx — 메타 Ads Manager CSV 업로드.
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function AdSpendUpload() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function onFile(file: File) {
    setBusy(true);
    setStatus("업로드 중…");
    try {
      const csv = await file.text();
      const res = await fetch("/api/admin/ads/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatus(
          `✅ ${d.imported}건 반영${d.skipped ? ` · ${d.skipped}건 건너뜀` : ""}`
        );
        router.refresh();
      } else {
        setStatus(`❌ ${d.error ?? "실패"}`);
      }
    } catch {
      setStatus("❌ 파일을 읽지 못했어요.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
      <div className="text-[13px] font-bold">CSV 업로드 (메타 Ads Manager 내보내기)</div>
      <p className="text-[12px] text-white/50 leading-relaxed">
        Ads Manager에서 <b>Breakdown: By Day</b>로 내보낸 CSV. 필수 컬럼 <b>Day</b>,{" "}
        <b>Amount spent</b>. 소재 매칭은 <b>Ad name = utm_content</b>(counsel/daily/tarot)로
        맞춰줘. 같은 일자·소재는 덮어쓰니 재업로드해도 안전해.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
        }}
        className="text-[12px] text-white/70 file:mr-3 file:rounded file:border-0 file:bg-lilac-deep file:px-3 file:py-1.5 file:text-white file:text-[12px] disabled:opacity-50"
      />
      {status && <div className="text-[12px] text-white/80">{status}</div>}
    </div>
  );
}
