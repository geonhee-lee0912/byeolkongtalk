"use client";
// components/admin/daily/SurveyInbox.tsx — 새 설문 인박스 + [확인했어요].
// SurveyAnswers 는 훅 없는 순수 컴포넌트라 클라이언트 번들에서도 그대로 쓴다.
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SurveyAnswers } from "@/components/admin/SurveyAnswers";
import type { InboxSurvey } from "@/lib/admin/daily-load";

// lib/admin/daily-load.ts 의 SURVEY_SHOW 와 같은 값 — 그 파일은 서버 전용(supabase)이라
// 클라이언트 번들로 끌어오지 않고 상수만 복제한다. 바꿀 땐 둘을 같이.
const SURVEY_SHOW = 5;

const kst = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  });

export function SurveyInbox({
  count, items, seenUntil,
}: { count: number; items: InboxSurvey[]; seenUntil: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (count === 0 || items.length === 0) {
    return (
      <div className="text-[13px] text-white/50">
        새 설문 없음 · 마지막 확인 {seenUntil ? kst(seenUntil) : "아직 없음"}
      </div>
    );
  }

  const overflow = count > SURVEY_SHOW;
  // 보인 것만 확인 처리한다 — 넘친 응답까지 확인되면 안 본 설문이 사라진다. 최신이 맨 앞.
  const until = overflow ? items[SURVEY_SHOW - 1].created_at : items[0].created_at;

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
      <div className="text-[13px] text-white/80">새 설문 {count}건</div>
      {items.slice(0, SURVEY_SHOW).map((it) => (
        <div key={it.id} className="rounded-xl bg-white/5 border border-white/10 p-4 min-w-0">
          <div className="text-[12px] text-white/50 mb-2">
            {it.nickname ?? "(탈퇴)"} · {kst(it.created_at)}
          </div>
          <SurveyAnswers answers={it.answers} />
        </div>
      ))}
      {overflow && (
        <div className="text-[12px] text-white/50">
          외 {count - SURVEY_SHOW}건 —{" "}
          <Link href="/admin/survey" className="underline">설문 화면에서</Link>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button" onClick={mark} disabled={busy}
          className="rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 px-3 py-1.5 text-[13px] disabled:opacity-50"
        >
          {busy ? "처리 중…" : overflow ? "5건 확인(나머지는 설문 화면)" : "확인했어요"}
        </button>
        {err && <span className="text-[12px] text-red-400">{err}</span>}
      </div>
    </div>
  );
}
