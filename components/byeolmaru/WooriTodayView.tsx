"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { PairDayCell, PairBackdrop } from "@/lib/byeolmaru/pair-day";
import type { LockedCell } from "@/lib/byeolmaru/calendar";
import { PAIR_TONE_LABEL, pairMarks } from "@/lib/byeolmaru/pair-day";
import { getPairTaste } from "@/lib/byeolmaru/static-lines";
import type { RelationshipStatus } from "@/lib/relationship/types";
import { trackUiEvent } from "@/lib/analytics/ui-events";
import CalendarGrid, { type GridCell } from "./CalendarGrid";
import PairDayDetailCard from "./PairDayDetailCard";
import PartnerChips, { type PartnerChip } from "./PartnerChips";
import WatchAddModal from "./WatchAddModal";
import BackHeader from "./BackHeader";
import PremiumBlock from "./PremiumBlock";
import { useByeolmaruSubscribe } from "./useByeolmaruSubscribe";

type State =
  | { kind: "loading" }
  | { kind: "need_login" }
  | { kind: "no_profile" }
  | { kind: "error" }
  | { kind: "ready"; entitled: boolean; trialUsed: boolean };

export default function WooriTodayView({ initialSubject }: { initialSubject?: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [subject, setSubject] = useState<string>("me");
  const [partners, setPartners] = useState<PartnerChip[]>([]);
  // 🔴 "상대가 0명"과 "아직 못 물어봤다"를 구분한다 — 이 화면은 이제 무료 목록 행에서 `?subject=`
  //    없이 콜드 진입하므로, 구분이 없으면 상대가 있는 사람에게도 "먼저 상대를 걸어두면…"이
  //    한 프레임 스쳤다(refresh 가 state=ready 를 loadPartners 보다 먼저 세운다).
  const [partnersLoaded, setPartnersLoaded] = useState(false);
  const [pairData, setPairData] = useState<{
    cells: PairDayCell[];
    lockedCells: LockedCell[];
    today: string;
    backdrop: PairBackdrop;
    partnerName: string;
    entitled: boolean;
    status: RelationshipStatus | null;
  } | null>(null);
  const [pairSelected, setPairSelected] = useState<string | null>(null);
  const [pairLoading, setPairLoading] = useState(false);
  const [pairError, setPairError] = useState(false);
  const [pairNarrative, setPairNarrative] = useState<string | null>(null);
  const [pairNarrativeLoading, setPairNarrativeLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  // ?subject= 로 넘어온 초기 상대(T3 ?date= 와 동일 패턴, I-2). 최초 loadPartners
  // 응답 1회에만 적용한다 — 이후 체험/구독 완료로 refresh() 가 다시 불릴 때(useByeolmaruSubscribe
  // 의 onChanged) 이미 딴 상대를 보고 있던 사용자를 URL 값으로 되돌리면 안 되기 때문.
  // 🔴 이제 앱 안에서 이 파라미터를 붙여 보내는 링크는 없다(허브 인연 칩이 사라졌다) — 남겨둔 건
  //    공유·딥링크로 특정 상대를 곧장 열 여지 때문이고, 없으면 아래 "1명이면 자동 선택"이 받는다.
  const appliedInitialSubjectRef = useRef(false);

  async function refresh() {
    try {
      const res = await fetch("/api/byeolmaru/calendar", { cache: "no-store" });
      if (res.status === 401) { trackUiEvent("byeolmaru_need_login"); setState({ kind: "need_login" }); return; }
      if (res.status === 404) { trackUiEvent("byeolmaru_no_profile"); setState({ kind: "no_profile" }); return; }
      if (!res.ok) { setState({ kind: "error" }); return; }
      const data = await res.json();
      if (!Array.isArray(data.cells) || data.cells.length === 0) { setState({ kind: "error" }); return; }
      setState({ kind: "ready", entitled: !!data.entitled, trialUsed: !!data.trialUsed });
      const list = await loadPartners();
      // 🔴 initialSubject 검증 — 실제 내 상대 목록(list)에 있을 때만 적용한다. 임의 UUID(직접 URL
      //    조작)는 어떤 상대의 id 와도 안 맞아 자연히 무시되고 아래 자동 선택으로 떨어진다.
      // 🔴 파라미터가 없으면 **첫 상대를 자동으로 펼친다.** 무료 목록에서 콜드 진입하는 지금,
      //    자동 선택이 없으면 상대가 1명뿐인 사람(무료 한도 2명이라 대부분)에게도 "골라라"
      //    안내만 띄우고 끝나 한 번의 의미 없는 탭을 요구한다. 0명이면 걸어두기 유도가 받는다.
      if (!appliedInitialSubjectRef.current) {
        appliedInitialSubjectRef.current = true;
        const initial =
          initialSubject && list.some((p) => p.id === initialSubject) ? initialSubject : list[0]?.id;
        if (initial) setSubject(initial);
      }
    } catch { setState({ kind: "error" }); }
  }
  useEffect(() => { void refresh(); }, []);

  async function loadPartners(): Promise<PartnerChip[]> {
    try {
      const res = await fetch("/api/byeolmaru/watch", { cache: "no-store" });
      if (!res.ok) { setPartners([]); return []; }
      const j = await res.json();
      const list: PartnerChip[] = Array.isArray(j?.watched) ? j.watched : [];
      setPartners(list);
      return list;
    } catch { setPartners([]); return []; }
    finally { setPartnersLoaded(true); }
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
          setPairData({
            cells: j.cells,
            lockedCells: Array.isArray(j.lockedCells) ? j.lockedCells : [],
            today: j.today,
            backdrop: j.backdrop,
            partnerName: j.partnerName,
            entitled: !!j.entitled,
            status: j.status ?? null,
          });
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
    ? pairData.cells.map((c) => ({ date: c.date, ganji: c.ganji, tone: c.tone, label: PAIR_TONE_LABEL[c.tone], isToday: c.isToday, marks: pairMarks(c.tags) }))
    : [];
  // 폴백은 오늘 — cells[0] 은 이번 달 1일이라 첫 진입에서 엉뚱한 날이 열린다.
  const pairCell = pairData
    ? pairData.cells.find((c) => c.date === pairSelected) ??
      pairData.cells.find((c) => c.isToday) ??
      pairData.cells[pairData.cells.length - 1]
    : null;

  return (
    <main className="mx-auto w-full max-w-md space-y-4 p-4">
      <BackHeader title="우리 오늘" />

      {/* 🔴 허브에서 내려온 칩이다(2026-09-21) — 상대 선택이 이 화면의 일이 되면서 허브 전용이던
          PartnerChips 를 여기로 옮겼다. 구 SubjectToggle 보다 세 가지가 낫다: ①관계 유형 색
          ②0명일 때 금색 점선 "＋ 인연 걸어두기"가 크게 떠 콜드스타트를 그 자체로 받는다.
          ③덤으로 대비 결함이 사라진다 — SubjectToggle 의 활성 칩은 bg-lilac-deep + text-cream
          = 2.78:1 로 WCAG AA(4.5:1) 미달이었고, PartnerChips 는 text-night 로 이미 고쳐져 있다. */}
      <PartnerChips
        partners={partners}
        selected={subject}
        onSelect={(id) => { trackUiEvent("byeolmaru_partner_selected"); setSubject(id); }}
        onAdd={() => setAddOpen(true)}
      />

      {subject === "me" ? (
        <p className="rounded-2xl bg-cream-warm p-4 text-center text-sm text-text-light">
          {/* 🔴 상대가 0명인 것과 아직 못 물어본 것을 가른다 — 콜드 진입이라 목록을 받기 전에
              "먼저 걸어두면…"을 띄우면 이미 상대가 있는 사람에게 거짓말이 한 프레임 스친다.
              목록이 도착하고 0명이면 위 칩 자리의 금색 점선 버튼과 이 문구가 한 쌍이 된다. */}
          {partnersLoaded ? "먼저 상대를 걸어두면(＋) 둘 사이 오늘을 볼 수 있어." : "펼치는 중…"}
        </p>
      ) : pairError ? (
        <p className="rounded-2xl bg-cream-warm p-4 text-center text-sm text-text-light">지금은 우리 오늘을 못 펼쳤어. 잠시 후 다시 볼래?</p>
      ) : pairData && pairCell ? (
        <>
          <section aria-label="이번 달 우리 캘린더">
            <CalendarGrid
              cells={pairGridCells}
              lockedCells={pairData.lockedCells}
              todayDate={pairData.today}
              selectedDate={pairCell.date}
              onSelect={setPairSelected}
              subjectKind="pair"
            />
          </section>
          <PairDayDetailCard
            cell={pairCell}
            backdrop={pairData.backdrop}
            partnerName={pairData.partnerName}
            entitled={pairData.entitled}
            // 🔴 선택한 셀 기준이다(오늘 고정이 아니다) — 무료도 이번 달 지나간 날을 고를 수 있다(P5-2).
            taste={pairData.entitled ? null : getPairTaste(pairCell.tone, pairCell.tags, pairData.status, pairCell.date)}
            narrative={pairNarrative}
            narrativeLoading={pairNarrativeLoading}
          />
          {/* 🔴 자격자에겐 아예 렌더하지 않는다 — 우리 오늘의 서술은 PairDayDetailCard 안에 있고,
              PremiumBlock 의 자격자 분기("별콩이의 오늘")까지 띄우면 빈 블록이 하나 더 생긴다.
              🔴 판독 주의(2026-09-21 갱신): woori_30d 의 노출 면이 **이 화면 하나로 줄었다** —
              허브 인연 칩이 사라져 허브는 saju_report 만 띄운다. 즉 배포 경계에서 woori_30d 의
              gate_shown 이 **아래로** 뛴다(노출 면이 둘→하나). 자리끼리 비교하던 P5-4 규칙
              ((user_id, slot, KST일자) distinct 정규화)은 이제 불필요하다. */}
          {!pairData.entitled && (
            <PremiumBlock
              entitled={false}
              trialUsed={trialUsed}
              narrative={null}
              teaser={null}
              loading={false}
              slot="woori_30d"
              baitCtx={{ partnerName: pairData.partnerName }}
              onStartTrial={(slot) => {
                trackUiEvent("byeolmaru_subscribe_from_woori", { meta: { action: "trial", slot } });
                void startTrial(slot);
              }}
              onSubscribe={(slot) => {
                trackUiEvent("byeolmaru_subscribe_from_woori", { meta: { action: "subscribe", slot } });
                openSubscribe(slot);
              }}
            />
          )}
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
