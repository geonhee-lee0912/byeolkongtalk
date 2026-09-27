"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { PairDayCell, PairBackdrop } from "@/lib/byeolmaru/pair-day";
import { getPairTaste } from "@/lib/byeolmaru/static-lines";
import type { RelationshipStatus } from "@/lib/relationship/types";
import { trackUiEvent } from "@/lib/analytics/ui-events";
import PairDayDetailCard from "./PairDayDetailCard";
import GuestLoginWall from "./GuestLoginWall";
import CurrentPartner, { type WatchedPartner } from "./CurrentPartner";
import WatchAddModal from "./WatchAddModal";
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
  | { kind: "ready"; entitled: boolean; trialUsed: boolean; today: string };

// 🔴 initialSubject(?subject=) 가 사라졌다(2026-09-24) — 상대가 한 명이라 고를 것이 없고,
//    그 파라미터를 붙여 보내는 링크도 앱 안엔 없었다. 딥링크가 다시 필요해지면 상대 id 가
//    아니라 "이 상대로 교체" 같은 명시적 동작이어야 한다(조용히 선택을 바꾸면 안 된다).
// 🔴 initialDate 는 pairCell 선택과 pair-narrative 호출 둘 다에 배선된다 — 과거 날짜면 그날의
//    셀(사주·타로와 같은 날)과 그날 캐시된 서술을 함께 보여준다(생성은 없다, cache_only).
//    한때 pairCell 은 "오늘 고정"이었다(2026-09-24, 이 화면에 날짜 개념이 없던 시절의 흔적) —
//    initialDate 를 무시하고 항상 `.find(isToday)` 였고, 그래서 9/20 을 열어도 우리 탭만 9/27
//    (오늘)을 그리는 사고가 났다(2026-09-27, 사주·타로와 다른 날을 보여줌). 지금은 아래
//    `.find(c => c.date === targetDate)` 로 고른다.
//    injected 는 나머지 두 View 와 같은 A′ 데이터 주입형 계약이다.
export default function WooriTodayView({
  initialDate,
  injected,
}: {
  initialDate?: string;
  injected?: { status: number; body: unknown };
}) {
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
  // 🔴 과거 날짜엔 걸어둔 상대가 아니라 **그날 본 상대**를 표시한다 — 안 그러면 B 의 이름
  //    아래 A 의 글이 뜬다. 오늘 응답엔 이 필드가 없어 null 이고, 그땐 기존대로 걸어둔
  //    상대(partner)를 쓴다.
  const [pastPartnerId, setPastPartnerId] = useState<string | null>(null);
  // 🔴 "그날은 기록이 없다"와 "생성에 실패했다"를 가른다 — 둘 다 narrative:null 이지만
  //    전자는 영영 안 생기고(소급 생성 금지) 후자는 지금 다시 오면 된다.
  const [pastNoRecord, setPastNoRecord] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  async function refresh() {
    try {
      const { status, body } =
        injected ??
        (await (async () => {
          const res = await fetch("/api/byeolmaru/calendar", { cache: "no-store" });
          return { status: res.status, body: await res.json().catch(() => null) };
        })());
      if (status === 401) { trackUiEvent("byeolmaru_need_login"); setState({ kind: "need_login" }); return; }
      if (status === 404) { trackUiEvent("byeolmaru_no_profile"); setState({ kind: "no_profile" }); return; }
      if (status < 200 || status >= 300) { setState({ kind: "error" }); return; }
      const data = body as { cells?: unknown[]; entitled?: boolean; trialUsed?: boolean; today?: string } | null;
      // 🔴 today 가 없으면 error 로 접는다 — 이 값이 아래 isPastDate(과거 판정) 의 유일한
      //    근거라, 빈 값을 "오늘 아님"으로 접으면 과거 조회가 조용히 막힌다.
      if (!data || !Array.isArray(data.cells) || data.cells.length === 0 || !data.today) { setState({ kind: "error" }); return; }
      setState({ kind: "ready", entitled: !!data.entitled, trialUsed: !!data.trialUsed, today: data.today });
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

  // 🔴 구독·체험이 바뀐 뒤의 갱신은 **주입을 무시하고 서버를 다시 문다** — 주입값은 껍데기가
  //    진입 시 한 번 받은 스냅샷이라, 그걸 다시 읽으면 방금 산 구독이 화면에 반영되지 않는다.
  const { startTrial, openSubscribe, subscribeModal } = useByeolmaruSubscribe(() => void refreshFromServer());

  async function refreshFromServer() {
    const res = await fetch("/api/byeolmaru/calendar", { cache: "no-store" });
    const body = await res.json().catch(() => null);
    if (res.status === 401) { setState({ kind: "need_login" }); return; }
    if (res.status === 404) { setState({ kind: "no_profile" }); return; }
    if (!res.ok || !body) { setState({ kind: "error" }); return; }
    const data = body as { cells?: unknown[]; entitled?: boolean; trialUsed?: boolean; today?: string };
    if (!Array.isArray(data.cells) || data.cells.length === 0 || !data.today) { setState({ kind: "error" }); return; }
    setState({ kind: "ready", entitled: !!data.entitled, trialUsed: !!data.trialUsed, today: data.today });
  }

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

  // 🔴 "오늘"의 출처 — pairData.today(=상대 기준 캘린더 응답)가 아니라 **자기 캘린더 응답**(위
  //    state, subject 와 무관하게 항상 도는 effect)에서 가져온다. pairData 는 subject==="me"
  //    면 아예 안 채워지므로(바로 위 effect 의 첫 줄), 그걸 근거로 삼으면 상대가 없는 사람은
  //    영원히 "과거"를 판정할 수 없다 — 과거 조회는 정의상 상대가 없어도 가능해야 한다(아래).
  const todayKst = state.kind === "ready" ? state.today : null;
  // 🔴 지난 날엔 생성 유도(하루 상한 안내 등)를 숨기고, 자격과 무관하게 과거 서술을 부른다 —
  //    소급 생성은 금지돼 있어 "생성"이 아니라 "그때 이미 받은 것"을 다시 보여줄 뿐이고, 라우트도
  //    이 경로(cache_only)를 자격 게이트보다 앞에 둔다(스테이지 3). 아래 narrative effect 의
  //    가드가 이 값을 그대로 쓴다.
  const isPastDate = !!initialDate && !!todayKst && initialDate < todayKst;
  // 🔴 미래는 과거와 다르게 다룬다 — 서버가 400(date_out_of_range)을 주므로 narrative 가 늘 null 이고,
  //    그걸 기본 폴백("숨 고르는 중")으로 흘리면 **일시적 장애처럼** 읽힌다. 사주 탭은 같은 날
  //    "그날 아침에 열려."라고 말하는데 우리 탭만 다른 말을 하면 한 화면에서 두 탭이 어긋난다.
  const isFutureDate = !!initialDate && !!todayKst && initialDate > todayKst;

  // 우리 오늘 서술 — 위 캘린더 effect 와 deps 는 비슷하지만 의도적으로 분리한다. 캘린더는 룰이라 즉시,
  // 서술은 nano 라 느려서 합치면 서술 완료까지 캘린더 렌더가 묶인다. cancelled 가드는 빠른 subject
  // 전환 시 낡은 fetch 가 최신 상태를 덮어쓰는 것을 막는다.
  // 🔴 오늘(비과거)은 여전히 비자격이면 아예 호출 안 함(원가 0) — entitledNow 가드는 살아 있다.
  //    다만 **과거는 이 가드를 건너뛴다** — 라우트의 cache_only 분기가 자격 검사 앞에 있어(스테이지 3),
  //    이미 받은 글을 자격 만료 뒤에도 보여주는 게 설계 의도다. 여기서 막으면 "서버는 내주는데
  //    화면은 못 보여주는" 불일치가 남는다(11642fd 가 사주·타로에서 고친 것과 같은 버그 계열).
  useEffect(() => {
    const shouldFetch = isPastDate || (subject !== "me" && entitledNow);
    if (!shouldFetch) { setPairNarrative(null); setPairDailyLimit(false); setPastPartnerId(null); setPastNoRecord(false); setPairNarrativeLoading(false); return; }
    let cancelled = false;
    setPairNarrative(null); setPairDailyLimit(false); setPastPartnerId(null); setPastNoRecord(false); setPairNarrativeLoading(true);
    void (async () => {
      try {
        // 🔴 subject 는 "오늘(generate)" 경로에서만 필수다 — 과거(cache_only)는 유저+날짜로만
        //    찾는다(getPairNarrativeByDate, 상대 무관). subject==="me"(상대 없음)로 과거를 보는
        //    중이면 보낼 subject 자체가 없다 — "me" 를 그대로 보내면 잘못된 값을 보내는 셈이라 아예 뺀다.
        const qs = new URLSearchParams();
        if (subject !== "me") qs.set("subject", subject);
        if (initialDate) qs.set("date", initialDate);
        const res = await fetch(`/api/byeolmaru/pair-narrative?${qs}`, { cache: "no-store" });
        if (!res.ok) { if (!cancelled) setPairNarrative(null); return; }
        const j = await res.json();
        // 🔴 배포 롤아웃 창에선 **새 번들이 구 API 를 만날 수** 있다(스큐). 구 API 는 narrative 를
        //    **문자열**로 돌려주므로 그대로 넣으면 PairReportView 가 report.blocks 에서 터져
        //    화면 전체가 에러 바운더리로 간다. 형태를 확인해 아니면 null — 그러면 "숨 고르는 중"
        //    문구로 떨어져 화면은 멀쩡히 선다.
        if (!cancelled) {
          setPairNarrative(isPairReport(j.narrative) ? j.narrative : null);
          setPairDailyLimit(j.reason === "daily_limit");
          setPastPartnerId(typeof j?.partnerProfileId === "string" ? j.partnerProfileId : null);
          setPastNoRecord(j?.reason === "no_record");
        }
      } catch { if (!cancelled) setPairNarrative(null); }
      finally { if (!cancelled) setPairNarrativeLoading(false); }
    })();
    return () => { cancelled = true; };
    // 🔴 initialDate 를 deps 에 넣는다 — isPastDate 가 "참"에서 안 바뀌어도(과거 날짜 A→다른
    //    과거 날짜 B) 실제로 조회할 날짜는 달라지므로 다시 불러야 한다. 지금은 이 화면 안에
    //    날짜만 바꾸는 링크가 없어 재현되진 않지만, 생기면 조용히 stale 서술을 보여줄 수 있었다.
  }, [subject, entitledNow, isPastDate, initialDate]);

  if (state.kind === "loading") return <p className="text-center text-text-light">펼치는 중…</p>;
  // 🔴 벽은 세 탭이 공유한다(GuestLoginWall) — 문구·레이아웃을 여기서 다시 쓰지 말 것.
  if (state.kind === "need_login") return <GuestLoginWall next="/byeolmaru/day?tab=woori" />;
  if (state.kind === "no_profile") return (
    <div className="text-center">
      <p className="mb-4 text-eye-purple">생년월일을 알려주면 시작할 수 있어.</p>
      <Link href="/mypage" className="rounded-xl bg-lilac-deep px-4 py-2 text-cream">생년월일 입력하러 가기</Link>
    </div>
  );
  if (state.kind === "error") return <p className="text-center text-text-light">지금은 못 펼쳤어. 잠시 뒤에 다시 와줄래?</p>;

  // 🔴 그 날짜의 셀을 고른다 — initialDate 없으면 오늘, 있으면 **반드시 그 날짜로** 찾는다.
  //    예전엔 항상 `.find(isToday)` 여서(2026-09-24 "달력 없음" 시절의 흔적) initialDate 를
  //    통째로 무시했다 — 9/20 을 열어도 우리 탭만 9/27(오늘) 카드를 그렸다(사주·타로와 어긋남,
  //    2026-09-27 실사고). pairData.cells 는 이번 달 전체라 today 도 그 안에 있다.
  const targetDate = initialDate ?? pairData?.today ?? null;
  const pairCell = pairData && targetDate ? pairData.cells.find((c) => c.date === targetDate) ?? null : null;
  // 🔴 이번 달 격자만 이 날짜로 링크하므로 실전에선 안 나야 하는 방어선이다. 그래도 못 찾으면
  //    **오늘로 조용히 바꿔치기하지 않는다** — 그게 방금 고친 버그다(요청한 날과 다른 날을
  //    "오늘"이라는 정상 라벨로 보여주면 못 찾았다는 사실 자체가 안 보인다). 대신 그 사실을
  //    있는 그대로 말한다 — 아래 렌더의 `pairCellMissing` 분기.
  const pairCellMissing = !!pairData && !!targetDate && !pairCell;

  // 무료 taste — 한 번만 만들어 카드(4줄 렌더)와 절단선(글자 수·블러 원문)이 **같은 값**을 쓴다.
  // 🔴 PaywallCut 계약: freeChars 는 "절단선 위에 실제로 그린 글자 수"를 호출부가 센다(하드코딩 금지).
  //    두 곳이 갈리면 "무료 N자" 칩이 화면과 어긋나 그 자리에서 거짓말이 된다.
  //    SajuTodayView 가 tasteText 로 같은 일을 한다.
  const pairTaste =
    pairData && pairCell ? getPairTaste(pairCell.tone, pairCell.tags, pairData.status, pairCell.date) : null;
  const pairTasteText = pairTaste
    ? [pairTaste.signal, pairTaste.relation, pairTaste.lead, pairTaste.advice].filter(Boolean).join(" ")
    : "";

  // 🔴 파생값이다(상태가 아니다). watch 목록에 없는 id 면 교체로 사라진 상대다 — 그때도
  //    이름 자리를 비우지 않는다(빈 칩은 "상대가 없다"로 읽힌다).
  const shownPartner: WatchedPartner | null = pastPartnerId
    ? (partner && partner.id === pastPartnerId ? partner : { id: pastPartnerId, name: "그날의 상대", status: null })
    : partner;

  return (
    <div className="space-y-4">
      {/* 🔴 칩(여러 명 선택)이 아니라 한 명 카드다(2026-09-24). 고를 대상이 없으니 남은 건
          "누가 걸려 있나"와 "바꾸기" 둘뿐 — 상세는 CurrentPartner 머리 주석. */}
      <CurrentPartner partner={shownPartner} onChange={() => setAddOpen(true)} />

      {subject === "me" ? (
        // 🔴 상대가 지금 없어도(교체·해제로 subject==="me") 과거에 받은 기록은 남아있을 수
        //    있다 — getPairNarrativeByDate 는 상대가 아니라 유저+날짜로 찾는다. 그 기록이
        //    있을 때만 이 분기를 쓰고, 없으면 기존 "상대 걸어두기" 안내로 그대로 떨어진다
        //    (else 가지). pairData/pairCell 이 없어 PairDayDetailCard 는 못 쓴다(그건 상대
        //    사주가 있어야 그리는 카드다) — 서술만 단독으로 보여준다.
        isPastDate && (pairNarrativeLoading || pairNarrative || pastNoRecord) ? (
          <div className="rounded-2xl bg-white border border-lilac-mid/20 shadow-[0_8px_30px_rgba(40,30,70,0.08)] p-4">
            {pairNarrativeLoading ? (
              <p className="text-center text-sm text-text-light">별콩이가 그날 이야기를 읽고 있어…</p>
            ) : pairNarrative ? (
              <PairReportView report={pairNarrative} />
            ) : (
              <p className="text-center text-sm text-text-light">
                그날은 리포트를 안 받았어. 지난 날은 그때 받은 것만 보여줄 수 있어.
              </p>
            )}
          </div>
        ) : (
          <p className="rounded-2xl bg-white border border-lilac-mid/20 shadow-[0_8px_30px_rgba(40,30,70,0.08)] p-4 text-center text-sm text-text-light">
            {/* 🔴 상대가 0명인 것과 아직 못 물어본 것을 가른다 — 콜드 진입이라 목록을 받기 전에
                "먼저 걸어두면…"을 띄우면 이미 상대가 있는 사람에게 거짓말이 한 프레임 스친다.
                목록이 도착하고 0명이면 위 칩 자리의 금색 점선 버튼과 이 문구가 한 쌍이 된다. */}
            {partnersLoaded ? "먼저 상대를 걸어두면 둘 사이 오늘을 볼 수 있어." : "펼치는 중…"}
          </p>
        )
      ) : pairError ? (
        <p className="rounded-2xl bg-white border border-lilac-mid/20 shadow-[0_8px_30px_rgba(40,30,70,0.08)] p-4 text-center text-sm text-text-light">지금은 우리 오늘을 못 펼쳤어. 잠시 후 다시 볼래?</p>
      ) : pairCellMissing ? (
        // 🔴 다른 날의 진짜 카드를 대신 그리지 않는다 — 예: 오늘 카드를 그리고 "오늘"이라 라벨하면
        //    요청한 날짜가 조용히 다른 날로 바뀐 게 화면에서 안 보인다(방금 고친 버그와 같은 모양).
        <p className="rounded-2xl bg-white border border-lilac-mid/20 shadow-[0_8px_30px_rgba(40,30,70,0.08)] p-4 text-center text-sm text-text-light">
          그 날짜의 우리 오늘은 못 찾았어. 이번 달 안에서 다시 골라줄래?
        </p>
      ) : pairData && pairCell ? (
        <>
          {/* 🔴 이번 달 우리 캘린더는 제거했다(2026-09-24, 사용자 결정) — 이 화면 **안에** 달력
              그리드를 다시 두지 않는다. 달력은 별마루 허브가 이미 가지고 있고, 여기 또 두면 같은
              물건이 두 탭에 나와 화면의 주제가 흐려졌다.
              🔴 **날짜 이동은 돌아왔다** — 단 이 화면 안의 위젯이 아니라, 날짜 상세 페이지
                 (`/byeolmaru/day?date=…`)가 사주·타로·우리 세 탭에 공통으로 물려주는 initialDate
                 로 온다. "이 화면은 항상 오늘 셀만 본다"는 한때 사실이었지만(위 컴포넌트 머리
                 주석 참조) 그건 날짜 개념 자체가 없던 시절 얘기고, 지금은 pairCell 이
                 initialDate 를 따라간다 — 달력을 되돌리라는 뜻이 아니다. */}
          {/* 🔴 한 장(2026-09-24) — 무료 taste 위, 절단선 아래로 가른다. 오늘 사주(SajuTodayView)·
              오늘 타로(DailyCardBlock)와 같은 구조다. 예전엔 유료 서술이 taste 를 **대체**하고
              CTA 는 카드 밖 PremiumBlock 이었다. */}
          <PairDayDetailCard
            cell={pairCell}
            backdrop={pairData.backdrop}
            partnerName={pairData.partnerName}
            // taste 시점 프레이밍(과거/미래)을 가르는 데만 쓴다 — 그 카드 주석 참고.
            todayKst={todayKst ?? pairData.today}
            // 🔴 선택한 셀 기준이다(오늘 고정이 아니다) — 무료도 이번 달 지나간 날을 고를 수 있다(P5-2).
            //    자격과 무관하게 **항상** 넘긴다: 구독자도 "둘이 어떤 결인지"를 읽어야 한다(§5-3① 과 같은 판단).
            taste={pairTaste}
          >
            {/* 🔴 게이트 순서 — "지금 자격 있나"가 아니라 "보여줄 내용이 있나"를 먼저 본다
                (SajuTodayView 의 `report ? (...)` 와 같은 원칙, 2026-09-26). 안 그러면 방금 고친
                effect 가 과거 서술을 잘 받아와도 이 바깥 게이트가 pairData.entitled(=지금 자격)
                만 보고 PaywallCut 으로 버린다 — 11642fd 가 타로에서 고친 "불러놓고 렌더가 버리는"
                바로 그 패턴이 된다. 자격 만료 뒤에도 그때 받은 글은 그대로 보여야 한다. */}
            {pairNarrativeLoading ? (
              <div className="mt-4 border-t border-lilac-mid/20 pt-4 text-center text-sm text-text-light">
                별콩이가 둘 사이 오늘을 읽고 있어…
              </div>
            ) : pairNarrative ? (
              <div className="mt-4 border-t border-lilac-mid/20 pt-4">
                {/* 🔴 "오늘 기준으로 들려주는 이야기야" 디스클레이머를 뺐다(2026-09-27) — 예전엔
                    이 라우트가 date 를 못 받아 pairNarrative 가 **항상 오늘 얘기**였는데 위
                    pairCell 은 다른 날(과거)일 수 있어서, 그 어긋남을 이 문구로 밝혔었다("카드는
                    그 날인데 글은 오늘 얘기야"). 지금은 pair-narrative 도 ?date= 를 받고 pairCell
                    도 같은 날짜를 고르므로 **카드와 글이 항상 같은 날**을 말한다 — 이 문구를 그대로
                    두면 과거 글을 "오늘 얘기"라고 거꾸로 우기게 된다. 예전 "지우지 말 것" 지시는
                    그 어긋남이 있던 시절 전제라, 어긋남이 없어진 지금은 반대로 적용된다. */}
                <PairReportView report={pairNarrative} />
              </div>
            ) : pastNoRecord ? (
              /* 🔴 과거 + 기록 없음 — 소급 생성은 금지라 "그때 받은 것만" 보여줄 수 있다는 걸
                    분명히 한다(대기·재시도를 권하지 않는다 — 기다려도 안 생긴다). */
              <p className="mt-4 border-t border-lilac-mid/20 pt-4 text-center text-sm text-text-light">
                그날은 리포트를 안 받았어. 지난 날은 그때 받은 것만 보여줄 수 있어.
              </p>
            ) : !pairData.entitled && !isPastDate ? (
              /* 🔴 여기만 border-t 래퍼가 없다(의도) — PaywallCut 이 자체 금색 절단선을 갖고 있어
                    감싸면 선이 두 개가 된다(SajuTodayView 와 같은 규율).
                 🔴 PaywallCut 은 마운트만으로 gate_shown 을 찍는다 — 반드시 "지금 비자격 + 오늘"
                    분기에서만(과거는 위 세 분기가 이미 가로챈다 — 팔 수 없는 날을 분모에서 뺀다,
                    daily-report 의 out_of_range 게이트와 같은 이유).
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
            ) : pairDailyLimit && !isPastDate ? (
              /* 🔴 페이월이 아니다 — "결제하면 더"가 아니라 "오늘은 여기까지"다. 상대를 바꾸는
                    순간은 대개 관계가 끝난 순간이라 거기에 결제를 붙이지 않기로 했다(교체 과금 기각).
                    되돌아가는 건 캐시 히트라 이 안내에 안 걸린다 — 오늘 이미 본 사람은 그대로 보인다.
                 🔴 !isPastDate 게이트 — 하루 상한은 "오늘" 개념이라 과거 조회엔 적용될 수 없다(서버도
                    cache_only 경로에선 이 reason 을 안 준다). 방어적으로 명시한다. */
              <div className="mt-4 border-t border-lilac-mid/20 pt-4 text-center">
                <p className="text-sm text-eye-purple">오늘 깊게 읽어준 사람은 이미 한 명 있어.</p>
                <p className="mt-1 text-[13px] text-text-light">
                  이 사람 이야기는 내일 들려줄게. 오늘 본 사람은 다시 볼 수 있어.
                </p>
              </div>
            ) : isFutureDate ? (
              /* 🔴 미래 — 사주 탭의 같은 자리와 **같은 문구**를 쓴다. 서버가 400 을 주는 건
                 장애가 아니라 정책이다(소급·선행 생성 금지). 아래 기본 폴백으로 흘리면
                 "숨 고르는 중"이 되어 곧 될 것처럼 들린다. */
              <p className="mt-4 border-t border-lilac-mid/20 pt-4 text-center text-sm text-text-light">
                그날 아침에 열려.
              </p>
            ) : (
              <p className="mt-4 border-t border-lilac-mid/20 pt-4 text-center text-sm text-text-light">
                별콩이가 잠깐 숨 고르는 중이야. 조금 뒤에 다시 와줄래?
              </p>
            )}
          </PairDayDetailCard>
        </>
      ) : pairLoading ? (
        <p className="rounded-2xl bg-white border border-lilac-mid/20 shadow-[0_8px_30px_rgba(40,30,70,0.08)] p-4 text-center text-sm text-text-light">우리 오늘을 펼치는 중…</p>
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
    </div>
  );
}
