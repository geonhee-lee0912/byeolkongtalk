"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { PairDayCell, PairBackdrop } from "@/lib/byeolmaru/pair-day";
import { PAIR_TONE_LABEL } from "@/lib/byeolmaru/pair-day";
import { trackUiEvent } from "@/lib/analytics/ui-events";
import CalendarGrid, { type GridCell } from "./CalendarGrid";
import PairDayDetailCard from "./PairDayDetailCard";
import SubjectToggle from "./SubjectToggle";
import WatchAddModal from "./WatchAddModal";
import BackHeader from "./BackHeader";
import { useByeolmaruSubscribe } from "./useByeolmaruSubscribe";

type State =
  | { kind: "loading" }
  | { kind: "need_login" }
  | { kind: "no_profile" }
  | { kind: "error" }
  | { kind: "ready"; entitled: boolean; trialUsed: boolean };

export default function WooriTodayView() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [subject, setSubject] = useState<string>("me");
  const [partners, setPartners] = useState<{ id: string; name: string }[]>([]);
  const [pairData, setPairData] = useState<{ cells: PairDayCell[]; backdrop: PairBackdrop; partnerName: string; entitled: boolean; staticLine: string | null } | null>(null);
  const [pairSelected, setPairSelected] = useState<string | null>(null);
  const [pairLoading, setPairLoading] = useState(false);
  const [pairError, setPairError] = useState(false);
  const [pairNarrative, setPairNarrative] = useState<string | null>(null);
  const [pairNarrativeLoading, setPairNarrativeLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  async function refresh() {
    try {
      const res = await fetch("/api/byeolmaru/calendar", { cache: "no-store" });
      if (res.status === 401) { trackUiEvent("byeolmaru_need_login"); setState({ kind: "need_login" }); return; }
      if (res.status === 404) { trackUiEvent("byeolmaru_no_profile"); setState({ kind: "no_profile" }); return; }
      if (!res.ok) { setState({ kind: "error" }); return; }
      const data = await res.json();
      if (!Array.isArray(data.cells) || data.cells.length === 0) { setState({ kind: "error" }); return; }
      setState({ kind: "ready", entitled: !!data.entitled, trialUsed: !!data.trialUsed });
      void loadPartners();
    } catch { setState({ kind: "error" }); }
  }
  useEffect(() => { void refresh(); }, []);

  async function loadPartners() {
    try {
      const res = await fetch("/api/byeolmaru/watch", { cache: "no-store" });
      if (!res.ok) { setPartners([]); return; }
      const j = await res.json();
      setPartners(Array.isArray(j?.watched) ? j.watched : []);
    } catch { setPartners([]); }
  }

  const entitledNow = state.kind === "ready" && state.entitled;
  const trialUsed = state.kind === "ready" ? state.trialUsed : false;

  const { startTrial, openSubscribe, subscribeModal } = useByeolmaruSubscribe(refresh);

  // subject 가 상대로 바뀔 때마다 우리 캘린더를 새로 받는다. entitledNow 를 deps 에 넣어 같은 상대를
  // 보는 도중 체험/구독이 풀렸을 때도(false→true) 잠금 없는 응답을 자동으로 다시 받는다.
  useEffect(() => {
    if (subject === "me") return;
    let cancelled = false;
    setPairLoading(true); setPairData(null); setPairError(false); setPairSelected(null);
    void (async () => {
      try {
        const res = await fetch(`/api/byeolmaru/calendar?subject=${encodeURIComponent(subject)}`, { cache: "no-store" });
        const j = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || !j) { setPairError(true); return; }
        if (Array.isArray(j.cells) && j.cells.length > 0) {
          setPairData({ cells: j.cells, backdrop: j.backdrop, partnerName: j.partnerName, entitled: !!j.entitled, staticLine: j.staticLine ?? null });
          setPairSelected(j.today);
          return;
        }
        setPairError(true);
      } catch { if (!cancelled) setPairError(true); }
      finally { if (!cancelled) setPairLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [subject, entitledNow]);

  // 우리 오늘 서술 — 위 캘린더 effect 와 deps 는 같지만 의도적으로 분리한다. 캘린더는 룰이라 즉시,
  // 서술은 nano 라 느려서 합치면 서술 완료까지 캘린더 렌더가 묶인다. cancelled 가드는 빠른 subject
  // 전환 시 낡은 fetch 가 최신 상태를 덮어쓰는 것을 막는다. 비자격(!entitledNow)은 아예 호출 안 함(원가 0).
  useEffect(() => {
    if (subject === "me" || !entitledNow) { setPairNarrative(null); setPairNarrativeLoading(false); return; }
    let cancelled = false;
    setPairNarrative(null); setPairNarrativeLoading(true);
    void (async () => {
      try {
        const res = await fetch(`/api/byeolmaru/pair-narrative?subject=${encodeURIComponent(subject)}`, { cache: "no-store" });
        if (!res.ok) { if (!cancelled) setPairNarrative(null); return; }
        const j = await res.json();
        if (!cancelled) setPairNarrative(j.narrative ?? null);
      } catch { if (!cancelled) setPairNarrative(null); }
      finally { if (!cancelled) setPairNarrativeLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [subject, entitledNow]);

  if (state.kind === "loading") return <main className="mx-auto w-full max-w-md p-6 text-center text-text-light">펼치는 중…</main>;
  if (state.kind === "need_login") return (
    <main className="mx-auto w-full max-w-md p-6 text-center">
      <p className="mb-4 text-eye-purple">로그인하면 둘 사이 오늘을 볼 수 있어.</p>
      <Link href="/login?next=/byeolmaru/woori" className="rounded-xl bg-lilac-deep px-4 py-2 text-cream">로그인하러 가기</Link>
    </main>
  );
  if (state.kind === "no_profile") return (
    <main className="mx-auto w-full max-w-md p-6 text-center">
      <p className="mb-4 text-eye-purple">생년월일을 알려주면 시작할 수 있어.</p>
      <Link href="/mypage" className="rounded-xl bg-lilac-deep px-4 py-2 text-cream">생년월일 입력하러 가기</Link>
    </main>
  );
  if (state.kind === "error") return <main className="mx-auto w-full max-w-md p-6 text-center text-text-light">지금은 못 펼쳤어. 잠시 뒤에 다시 와줄래?</main>;

  const pairGridCells: GridCell[] = pairData
    ? pairData.cells.map((c) => ({ date: c.date, ganji: c.ganji, tone: c.tone, label: PAIR_TONE_LABEL[c.tone], isToday: c.isToday, marks: [] }))
    : [];
  const pairCell = pairData ? pairData.cells.find((c) => c.date === pairSelected) ?? pairData.cells[0] : null;

  return (
    <main className="mx-auto w-full max-w-md space-y-4 p-4">
      <BackHeader title="우리 오늘" />

      <SubjectToggle
        partners={partners}
        selected={subject}
        onSelect={(id) => { if (id !== "me") trackUiEvent("byeolmaru_partner_selected"); setSubject(id); }}
        onAdd={() => setAddOpen(true)}
      />

      {subject === "me" ? (
        <p className="rounded-2xl bg-cream-warm p-4 text-center text-sm text-text-light">
          {partners.length === 0
            ? "먼저 상대를 걸어두면(＋) 둘 사이 오늘을 볼 수 있어."
            : "위에서 상대를 골라 둘 사이 오늘을 펼쳐봐."}
        </p>
      ) : pairError ? (
        <p className="rounded-2xl bg-cream-warm p-4 text-center text-sm text-text-light">지금은 우리 오늘을 못 펼쳤어. 잠시 후 다시 볼래?</p>
      ) : pairData && pairCell ? (
        <>
          {pairData.entitled && (
            <section aria-label="우리 30일 캘린더">
              <CalendarGrid cells={pairGridCells} selectedDate={pairCell.date} onSelect={setPairSelected} />
            </section>
          )}
          <PairDayDetailCard
            cell={pairCell}
            backdrop={pairData.backdrop}
            partnerName={pairData.partnerName}
            entitled={pairData.entitled}
            staticLine={pairData.staticLine}
            narrative={pairNarrative}
            narrativeLoading={pairNarrativeLoading}
            trialUsed={trialUsed}
            onStartTrial={() => { trackUiEvent("byeolmaru_subscribe_from_woori", { meta: { action: "trial" } }); void startTrial(); }}
            onSubscribe={() => { trackUiEvent("byeolmaru_subscribe_from_woori", { meta: { action: "subscribe" } }); openSubscribe(); }}
          />
        </>
      ) : pairLoading ? (
        <p className="rounded-2xl bg-cream-warm p-4 text-center text-sm text-text-light">우리 오늘을 펼치는 중…</p>
      ) : null}

      {subscribeModal}
      {addOpen && (
        <WatchAddModal
          onClose={() => setAddOpen(false)}
          onAdded={(id) => { setAddOpen(false); void loadPartners(); setSubject(id); }}
        />
      )}
    </main>
  );
}
