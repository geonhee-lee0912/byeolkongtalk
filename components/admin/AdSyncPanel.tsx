"use client";

// components/admin/AdSyncPanel.tsx — 광고비 Meta 동기화: 마지막 실행 표시 + 지금 동기화 + 기간 재수집.
import { useState } from "react";
import { useRouter } from "next/navigation";

export interface LastSyncRun {
  started_at: string;
  finished_at: string | null;
  trigger: string;
  date_from: string;
  date_to: string;
  rows_written: number | null;
  ok: boolean | null;
  error: string | null;
}

const TRIGGER_LABEL: Record<string, string> = { cron: "자동", manual: "수동", range: "기간 재수집" };
// 결과 기록 없이 이 시간이 지나면 함수가 타임아웃 등으로 죽은 것으로 본다.
const STALE_MS = 5 * 60 * 1000;

function kstTime(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

export function AdSyncPanel({ last, loadFailed }: { last: LastSyncRun | null; loadFailed: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [now] = useState(() => Date.now());

  async function run(body: Record<string, string> | null) {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/admin/ads/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg(res.ok ? `✅ ${j.days}일 · ${j.rows}행 교체` : `❌ ${j.error ?? res.status}`);
    router.refresh();
  }

  function runRange() {
    if (!from || !to) return setMsg("❌ 시작일·종료일을 넣어줘.");
    if (!confirm(`${from} ~ ${to} 의 Meta 광고비 행을 전부 API 값으로 교체할까요?`)) return;
    run({ from, to });
  }

  const stale = last != null && last.ok == null && now - new Date(last.started_at).getTime() > STALE_MS;

  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-3">
      <div className="text-[13px]">
        {loadFailed ? (
          <span className="text-amber-300/80">마지막 동기화: 조회 실패</span>
        ) : !last ? (
          <span className="text-white/50">마지막 동기화: 아직 없음</span>
        ) : last.ok === false ? (
          <span className="text-red-400">
            마지막 동기화 실패 · {kstTime(last.started_at)} · {TRIGGER_LABEL[last.trigger] ?? last.trigger} — {last.error}
          </span>
        ) : stale ? (
          <span className="text-amber-300/80">마지막 동기화 중단됨 · {kstTime(last.started_at)} 시작 — 결과 기록 없음</span>
        ) : last.ok == null ? (
          <span className="text-white/50">동기화 진행 중 · {kstTime(last.started_at)} 시작</span>
        ) : (
          <span className="text-white/80">
            마지막 동기화: {kstTime(last.finished_at ?? last.started_at)} · {TRIGGER_LABEL[last.trigger] ?? last.trigger} ·
            성공 · {last.date_from}~{last.date_to} · {last.rows_written}행
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button disabled={busy} onClick={() => run(null)}
          className="rounded-lg bg-white/10 px-3 py-1.5 text-[13px] disabled:opacity-40">
          지금 동기화 (최근 8일)
        </button>
        <span className="text-white/30 text-[12px]">|</span>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
          className="rounded bg-white/10 px-2 py-1 text-[13px]" />
        <span className="text-white/40 text-[12px]">~</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
          className="rounded bg-white/10 px-2 py-1 text-[13px]" />
        <button disabled={busy} onClick={runRange}
          className="rounded-lg bg-white/10 px-3 py-1.5 text-[13px] disabled:opacity-40">
          기간 재수집
        </button>
        {busy && <span className="text-[12px] text-white/50">동기화 중…</span>}
      </div>
      {msg && <div className="text-[12px]">{msg}</div>}
    </div>
  );
}
