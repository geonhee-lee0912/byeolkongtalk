"use client";
// components/admin/daily/SurveyInbox.tsx — 새 설문 인박스 + [확인했어요].
// 기본은 접힌 상태로 건수만 보인다(2026-10-10 사용자: 대시보드에 원문이 바로 펼쳐지는 건 별로).
// [확인했어요]는 펼쳤을 때만 있다 — 안 읽은 응답을 접힌 채로 확인 처리하지 않게.
// SurveyAnswers 는 훅 없는 순수 컴포넌트라 클라이언트 번들에서도 그대로 쓴다.
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SurveyAnswers } from "@/components/admin/SurveyAnswers";
import type { InboxSurvey } from "@/lib/admin/daily-load";
import { kstTimeLabel } from "@/lib/admin/daily";

const kst = (iso: string) => kstTimeLabel(iso, true);

export function SurveyInbox({
  count, items, seenUntil,
}: { count: number; items: InboxSurvey[]; seenUntil: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  if (count === 0 || items.length === 0) {
    return (
      <div className="text-[13px] text-white/50">
        새 설문 없음 · 마지막 확인 {seenUntil ? kst(seenUntil) : "아직 없음"}
      </div>
    );
  }

  // items 는 가장 오래된 미확인부터 오래된→최신 순이다. 보인 것 중 최신까지만 확인 처리한다 —
  // 안 보인(더 새로운) 응답은 확인되지 않고 다음 차례에 나온다.
  const rest = count - items.length;
  const until = items.reduce((m, it) => (Date.parse(it.created_at) > Date.parse(m) ? it.created_at : m), items[0].created_at);

  async function mark() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/seen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "survey", until }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setErr(j?.error ?? `실패 (${res.status})`);
        return;
      }
      router.refresh();
    } catch {
      setErr("네트워크 오류");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="text-[13px] text-white/80 hover:text-white"
      >
        새 설문 <b className="text-gold">{count}건</b>{" "}
        <span className="text-white/40">{open ? "▾ 접기" : "▸ 펼쳐 보기"}</span>
        {open && rest > 0 && <span className="text-white/35"> · 오래된 것부터</span>}
      </button>
      {open && items.map((it) => (
        <div key={it.id} className="rounded-xl bg-white/5 border border-white/10 p-4 min-w-0">
          <div className="text-[12px] text-white/50 mb-2">
            {it.nickname ?? "(탈퇴)"} · {kst(it.created_at)}
          </div>
          <SurveyAnswers answers={it.answers} />
        </div>
      ))}
      {open && rest > 0 && (
        <div className="text-[12px] text-white/50">
          외 {rest}건 —{" "}
          <Link href="/admin/survey" className="underline">설문 화면에서</Link>
        </div>
      )}
      {open && (
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button" onClick={mark} disabled={busy}
          className="rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 px-3 py-1.5 text-[13px] disabled:opacity-50"
        >
          {busy ? "처리 중…" : rest > 0 ? `${items.length}건 확인 (나머지 ${rest}건은 다음에)` : "확인했어요"}
        </button>
        {err && <span className="text-[12px] text-red-400">{err}</span>}
      </div>
      )}
    </div>
  );
}
