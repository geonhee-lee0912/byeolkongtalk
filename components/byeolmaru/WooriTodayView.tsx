"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { PairDayCell, PairBackdrop } from "@/lib/byeolmaru/pair-day";
import { getPairTaste } from "@/lib/byeolmaru/static-lines";
import type { RelationshipStatus } from "@/lib/relationship/types";
import { trackUiEvent } from "@/lib/analytics/ui-events";
import PairDayDetailCard from "./PairDayDetailCard";
import PartnerChips, { type PartnerChip } from "./PartnerChips";
import WatchAddModal from "./WatchAddModal";
import BackHeader from "./BackHeader";
import PaywallCut from "./PaywallCut";
import PairReportView from "./PairReportView";
import { isPairReport, type PairReport } from "@/lib/byeolmaru/pair-report";
import { PAIR_PAID_CHARS, PAIR_PAID_SECTIONS } from "@/lib/byeolmaru/paywall-sections";
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
    today: string;
    backdrop: PairBackdrop;
    partnerName: string;
    entitled: boolean;
    status: RelationshipStatus | null;
  } | null>(null);
  const [pairLoading, setPairLoading] = useState(false);
  const [pairError, setPairError] = useState(false);
  // 🔴 5블록 리포트다(2026-09-24). 예전엔 string 이었는데 라우트가 객체를 돌려주도록 바뀌었다 —
  //    `await res.json()` 은 any 라 **tsc 가 이 불일치를 못 잡는다**. 타입을 여기서 못 박아 둔다.
  const [pairNarrative, setPairNarrative] = useState<PairReport | null>(null);
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
    setPairLoading(true); setPairData(null); setPairError(false);
    void (async () => {
      try {
        const res = await fetch(`/api/byeolmaru/calendar?subject=${encodeURIComponent(subject)}`, { cache: "no-store" });
        const j = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || !j) { setPairError(true); return; }
        if (Array.isArray(j.cells) && j.cells.length > 0) {
          setPairData({
            cells: j.cells,
            today: j.today,
            backdrop: j.backdrop,
            partnerName: j.partnerName,
            entitled: !!j.entitled,
            status: j.status ?? null,
          });
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
        // 🔴 배포 롤아웃 창에선 **새 번들이 구 API 를 만날 수** 있다(스큐). 구 API 는 narrative 를
        //    **문자열**로 돌려주므로 그대로 넣으면 PairReportView 가 report.blocks 에서 터져
        //    화면 전체가 에러 바운더리로 간다. 형태를 확인해 아니면 null — 그러면 "숨 고르는 중"
        //    문구로 떨어져 화면은 멀쩡히 선다(ByeolmaruHub 의 data.strip?. 와 같은 계열의 방어).
        if (!cancelled) setPairNarrative(isPairReport(j.narrative) ? j.narrative : null);
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

  // 폴백은 오늘 — cells[0] 은 이번 달 1일이라 첫 진입에서 엉뚱한 날이 열린다.
  // 🔴 달력이 빠져 날짜 선택이 없다(2026-09-24) — 항상 오늘 셀이다. 폴백이 cells[0](이번 달 1일)이
  //    아니라 **마지막 칸**인 이유: 무료(비자격) 응답은 오늘까지만 잘려 오므로 오늘이 항상 마지막이다.
  const pairCell = pairData
    ? pairData.cells.find((c) => c.isToday) ?? pairData.cells[pairData.cells.length - 1]
    : null;

  // 무료 taste — 한 번만 만들어 카드(4줄 렌더)와 절단선(글자 수·블러 원문)이 **같은 값**을 쓴다.
  // 🔴 PaywallCut 계약: freeChars 는 "절단선 위에 실제로 그린 글자 수"를 호출부가 센다(하드코딩 금지).
  //    두 곳이 갈리면 "무료 N자" 칩이 화면과 어긋나 그 자리에서 거짓말이 된다.
  //    SajuTodayView 가 tasteText 로 같은 일을 한다.
  const pairTaste =
    pairData && pairCell ? getPairTaste(pairCell.tone, pairCell.tags, pairData.status, pairCell.date) : null;
  const pairTasteText = pairTaste
    ? [pairTaste.signal, pairTaste.relation, pairTaste.lead, pairTaste.advice].filter(Boolean).join(" ")
    : "";

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
          {/* 🔴 이번 달 우리 캘린더는 제거했다(2026-09-24, 사용자 결정) — 이 화면은 "오늘 둘 사이"
              하나만 말한다. 달력은 별마루 허브가 이미 가지고 있고, 여기 또 두면 같은 물건이 두 탭에
              나와 화면의 주제가 흐려졌다.
              🔴 **딸려 없어진 것**: 날짜 선택(`pairSelected`). 무료 사용자가 이번 달 지나간 날을
                 골라보던 동작(P5-2)이 같이 사라졌고, 이제 이 화면은 항상 오늘 셀만 본다.
                 되살리려면 달력이 아니라 **날짜 이동 컨트롤**을 따로 만들 것(달력을 되돌리지 말 것). */}
          {/* 🔴 한 장(2026-09-24) — 무료 taste 위, 절단선 아래로 가른다. 오늘 사주(SajuTodayView)·
              오늘 타로(DailyCardBlock)와 같은 구조다. 예전엔 유료 서술이 taste 를 **대체**하고
              CTA 는 카드 밖 PremiumBlock 이었다. */}
          <PairDayDetailCard
            cell={pairCell}
            backdrop={pairData.backdrop}
            partnerName={pairData.partnerName}
            // 🔴 선택한 셀 기준이다(오늘 고정이 아니다) — 무료도 이번 달 지나간 날을 고를 수 있다(P5-2).
            //    자격과 무관하게 **항상** 넘긴다: 구독자도 "둘이 어떤 결인지"를 읽어야 한다(§5-3① 과 같은 판단).
            taste={pairTaste}
          >
            {pairData.entitled ? (
              pairNarrativeLoading ? (
                <div className="mt-4 border-t border-lilac-mid/20 pt-4 text-center text-sm text-text-light">
                  별콩이가 둘 사이 오늘을 읽고 있어…
                </div>
              ) : pairNarrative ? (
                <div className="mt-4 border-t border-lilac-mid/20 pt-4">
                  {/* 🔴 pair-narrative 라우트엔 date 파라미터가 없어 이 리포트는 **항상 오늘 기준**이다.
                      다른 날을 보고 있을 땐 이 글이 그 날이 아니라 오늘 얘기라는 걸 밝힌다.
                      (카드 구조를 바꾸면서 이 안내가 한 번 사라졌다 — 지우지 말 것.) */}
                  {!pairCell.isToday && (
                    <p className="mb-2 text-xs text-text-light">오늘 기준으로 들려주는 이야기야</p>
                  )}
                  <PairReportView report={pairNarrative} />
                </div>
              ) : (
                <p className="mt-4 border-t border-lilac-mid/20 pt-4 text-center text-sm text-text-light">
                  별콩이가 잠깐 숨 고르는 중이야. 조금 뒤에 다시 와줄래?
                </p>
              )
            ) : (
              /* 🔴 여기만 border-t 래퍼가 없다(의도) — PaywallCut 이 자체 금색 절단선을 갖고 있어
                    감싸면 선이 두 개가 된다(SajuTodayView 와 같은 규율).
                 🔴 PaywallCut 은 마운트만으로 gate_shown 을 찍는다 — 반드시 비자격 분기에서만.
                 🔴 계측 단절: woori_30d 의 surface 가 "bait_card" → "cut" 으로 바뀌고, PremiumBlock 의
                    `!dismissed` 억제가 없어져 shown 분모에 재방문이 들어온다. 배포일 전후 전환율
                    하락으로 오독하지 말 것(PaywallCut.tsx 머리 주석이 같은 경고를 담고 있다). */
              <PaywallCut
                freeChars={pairTasteText.length}
                paidChars={PAIR_PAID_CHARS}
                sections={PAIR_PAID_SECTIONS}
                blurText={pairTasteText}
                trialUsed={trialUsed}
                slot="woori_30d"
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
          </PairDayDetailCard>
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
