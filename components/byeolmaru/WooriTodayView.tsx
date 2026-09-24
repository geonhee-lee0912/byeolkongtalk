"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { PairDayCell, PairBackdrop } from "@/lib/byeolmaru/pair-day";
import { getPairTaste } from "@/lib/byeolmaru/static-lines";
import type { RelationshipStatus } from "@/lib/relationship/types";
import { trackUiEvent } from "@/lib/analytics/ui-events";
import PairDayDetailCard from "./PairDayDetailCard";
import CurrentPartner, { type WatchedPartner } from "./CurrentPartner";
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

// 🔴 initialSubject(?subject=) 가 사라졌다(2026-09-24) — 상대가 한 명이라 고를 것이 없고,
//    그 파라미터를 붙여 보내는 링크도 앱 안엔 없었다. 딥링크가 다시 필요해지면 상대 id 가
//    아니라 "이 상대로 교체" 같은 명시적 동작이어야 한다(조용히 선택을 바꾸면 안 된다).
export default function WooriTodayView() {
  const [state, setState] = useState<State>({ kind: "loading" });
  // 🔴 상대는 0 또는 1명이다 — 목록이 아니라 단일 값. subject 는 여기서 파생시킨다(이중 상태 금지:
  //    예전엔 partners[] 와 subject 가 따로 있어 자동 선택·딥링크가 둘을 맞추는 일을 했다).
  const [partner, setPartner] = useState<WatchedPartner | null>(null);
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
  // 🔴 하루 상한에 걸렸나 — "생성 실패"와 **구분해야** 한다. 둘 다 narrative:null 이지만
  //    전자는 내일이면 풀리고 후자는 지금 다시 오면 된다 — 같은 문구를 쓰면 둘 다 거짓말이 된다.
  const [pairDailyLimit, setPairDailyLimit] = useState(false);
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
      await loadPartners();
    } catch { setState({ kind: "error" }); }
  }
  useEffect(() => { void refresh(); }, []);

  async function loadPartners(): Promise<void> {
    try {
      const res = await fetch("/api/byeolmaru/watch", { cache: "no-store" });
      if (!res.ok) { setPartner(null); return; }
      const j = await res.json();
      // 🔴 서버가 1행만 두지만 클라는 그걸 **믿지 않고** 첫 항목만 쓴다 — 구 API·구 데이터(2명
      //    시절)가 배포 창에 섞여 와도 화면이 조용히 첫 상대로 수렴한다.
      const list: WatchedPartner[] = Array.isArray(j?.watched) ? j.watched : [];
      setPartner(list[0] ?? null);
    } catch { setPartner(null); }
    finally { setPartnersLoaded(true); }
  }

  // 🔴 파생값이다(상태가 아니다) — 상대가 곧 subject 다. 둘을 따로 들면 "칩은 A 인데 달력은 B"
  //    같은 어긋남이 다시 생긴다.
  const subject = partner?.id ?? "me";

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
    if (subject === "me" || !entitledNow) { setPairNarrative(null); setPairDailyLimit(false); setPairNarrativeLoading(false); return; }
    let cancelled = false;
    setPairNarrative(null); setPairDailyLimit(false); setPairNarrativeLoading(true);
    void (async () => {
      try {
        const res = await fetch(`/api/byeolmaru/pair-narrative?subject=${encodeURIComponent(subject)}`, { cache: "no-store" });
        if (!res.ok) { if (!cancelled) setPairNarrative(null); return; }
        const j = await res.json();
        // 🔴 배포 롤아웃 창에선 **새 번들이 구 API 를 만날 수** 있다(스큐). 구 API 는 narrative 를
        //    **문자열**로 돌려주므로 그대로 넣으면 PairReportView 가 report.blocks 에서 터져
        //    화면 전체가 에러 바운더리로 간다. 형태를 확인해 아니면 null — 그러면 "숨 고르는 중"
        //    문구로 떨어져 화면은 멀쩡히 선다(ByeolmaruHub 의 data.strip?. 와 같은 계열의 방어).
        if (!cancelled) {
          setPairNarrative(isPairReport(j.narrative) ? j.narrative : null);
          setPairDailyLimit(j.reason === "daily_limit");
        }
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

      {/* 🔴 칩(여러 명 선택)이 아니라 한 명 카드다(2026-09-24). 고를 대상이 없으니 남은 건
          "누가 걸려 있나"와 "바꾸기" 둘뿐 — 상세는 CurrentPartner 머리 주석. */}
      <CurrentPartner partner={partner} onChange={() => setAddOpen(true)} />

      {subject === "me" ? (
        <p className="rounded-2xl bg-cream-warm p-4 text-center text-sm text-text-light">
          {/* 🔴 상대가 0명인 것과 아직 못 물어본 것을 가른다 — 콜드 진입이라 목록을 받기 전에
              "먼저 걸어두면…"을 띄우면 이미 상대가 있는 사람에게 거짓말이 한 프레임 스친다.
              목록이 도착하고 0명이면 위 칩 자리의 금색 점선 버튼과 이 문구가 한 쌍이 된다. */}
          {partnersLoaded ? "먼저 상대를 걸어두면 둘 사이 오늘을 볼 수 있어." : "펼치는 중…"}
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
              ) : pairDailyLimit ? (
                /* 🔴 페이월이 아니다 — "결제하면 더"가 아니라 "오늘은 여기까지"다. 상대를 바꾸는
                      순간은 대개 관계가 끝난 순간이라 거기에 결제를 붙이지 않기로 했다(교체 과금 기각).
                      되돌아가는 건 캐시 히트라 이 안내에 안 걸린다 — 오늘 이미 본 사람은 그대로 보인다. */
                <div className="mt-4 border-t border-lilac-mid/20 pt-4 text-center">
                  <p className="text-sm text-eye-purple">오늘 깊게 읽어준 사람은 이미 한 명 있어.</p>
                  <p className="mt-1 text-[13px] text-text-light">
                    이 사람 이야기는 내일 들려줄게. 오늘 본 사람은 다시 볼 수 있어.
                  </p>
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
          // 🔴 id 를 안 쓴다 — subject 는 partner 에서 파생되므로 loadPartners() 하나면 화면이
          //    따라온다. 예전엔 setSubject(id) 로 둘을 손으로 맞췄고, 그게 어긋남의 원인이었다.
          onAdded={() => { setAddOpen(false); void loadPartners(); }}
        />
      )}
    </main>
  );
}
