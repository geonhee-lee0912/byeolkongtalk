"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { DayCell, WeekBucket } from "@/lib/byeolmaru/calendar";
import type { PairDayCell, PairBackdrop } from "@/lib/byeolmaru/pair-day";
import { PAIR_TONE_LABEL } from "@/lib/byeolmaru/pair-day";
import { BYEOLMARU_SUBSCRIPTION } from "@/lib/byeolmaru/constants";
import { trackUiEvent } from "@/lib/analytics/ui-events";
import type { AttendanceState } from "@/lib/byeolmaru/attendance";
import { pickCrossSell } from "@/lib/byeolmaru/crosssell";
import CalendarGrid, { type GridCell } from "./CalendarGrid";
import DayDetailCard from "./DayDetailCard";
import PairDayDetailCard from "./PairDayDetailCard";
import SubjectToggle from "./SubjectToggle";
import WatchAddModal from "./WatchAddModal";
import PremiumBlock from "./PremiumBlock";
import AttendanceStrip from "./AttendanceStrip";
import CrossSellCard from "./CrossSellCard";
import StarConfirmModal from "@/components/common/StarConfirmModal";

interface CalendarResponse {
  today: string;
  todayGanji: string;
  cells: DayCell[];
  weeks: WeekBucket[];
  entitled: boolean;
  trialUsed: boolean;
  subscriptionExpiresAt: string | null;
  attendance: AttendanceState;
}

type State =
  | { kind: "loading" }
  | { kind: "need_login" }
  | { kind: "no_profile" }
  | { kind: "error" }
  | { kind: "ready"; data: CalendarResponse };

// "2026-09-04" → "9월 4일" (DayDetailCard 헤더와 동일 포맷).
function fmtMD(date: string): string {
  return `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`;
}

// 우리 오늘 잠금 티저 — ②-a PremiumBlock 의 "시안 C"(첫 줄 맛보기)와 달리 완전 블러다
// (design §4: 상대 캘린더는 점수 유출 0 원칙이라 실제 톤/점수를 한 조각도 보여주지 않는다).
// 장식용 빈 격자만 흐리게 깔아 "여기 캘린더가 있다"는 모양만 암시한다.
function LockedWooriTeaser({
  trialUsed,
  loading,
  onStartTrial,
  onSubscribe,
}: {
  trialUsed: boolean;
  loading: boolean;
  onStartTrial: () => void;
  onSubscribe: () => void;
}) {
  return (
    <section className="rounded-2xl bg-[#F3EEFB] p-4">
      <div className="mb-2 flex items-center gap-1 text-xs text-lilac-deep">
        <span aria-hidden>🔒</span> 우리 오늘
      </div>
      <div aria-hidden className="mb-3 grid grid-cols-7 gap-1 opacity-50 blur-sm select-none">
        {Array.from({ length: 14 }, (_, i) => (
          <div key={i} className="aspect-square rounded-lg bg-lilac-soft" />
        ))}
      </div>
      <p className="text-sm leading-relaxed text-eye-purple">
        둘 사이 오늘의 결, 끌림과 결속까지 — 구독하면 펼쳐져.
      </p>
      {!trialUsed ? (
        <button
          onClick={onStartTrial}
          disabled={loading}
          className="mt-3 w-full rounded-xl bg-gold py-2.5 text-sm font-medium text-eye-purple disabled:opacity-60"
        >
          3일 무료 체험 시작
        </button>
      ) : (
        <button
          onClick={onSubscribe}
          disabled={loading}
          className="mt-3 w-full rounded-xl bg-gold py-2.5 text-sm font-medium text-eye-purple disabled:opacity-60"
        >
          구독하고 우리 오늘 보기 · {BYEOLMARU_SUBSCRIPTION.cost}별 / {BYEOLMARU_SUBSCRIPTION.days}일
        </button>
      )}
    </section>
  );
}

export default function ByeolmaruView() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [selected, setSelected] = useState<string | null>(null);
  const [premium, setPremium] = useState<{ narrative: string | null; teaser: string | null; loading: boolean }>({
    narrative: null,
    teaser: null,
    loading: false,
  });
  const [confirmOpen, setConfirmOpen] = useState(false);
  // 구독 확인 팝업 잔액 — StarConfirmModal 은 balance===null 이면 확인 버튼이 영구
  // disabled 라(다른 8곳 소비자와 동일 계약) /api/stars/balance 로 실 잔액을 조회해 넘긴다.
  const [subBalance, setSubBalance] = useState<number | null>(null);
  const [subBalanceLoading, setSubBalanceLoading] = useState(false);
  const [attendance, setAttendance] = useState<AttendanceState | null>(null);
  const [checkinLoading, setCheckinLoading] = useState(false);

  // 우리 오늘 — subject="me" 는 기존 나의 오늘(위 상태 그대로). subject=상대 profileId 는
  // 아래 pairXxx 상태로 별도 관리한다(자기 날짜 선택과 뒤섞이지 않게).
  const [subject, setSubject] = useState<string>("me");
  const [partners, setPartners] = useState<{ id: string; name: string }[]>([]);
  const [pairData, setPairData] = useState<{ cells: PairDayCell[]; backdrop: PairBackdrop; partnerName: string } | null>(null);
  const [pairSelected, setPairSelected] = useState<string | null>(null);
  const [pairLocked, setPairLocked] = useState(false);
  const [pairLoading, setPairLoading] = useState(false);
  const [pairError, setPairError] = useState(false);
  // 우리 오늘 서술(nano) — 위 pairData(룰 판정, 즉시)와 트리거는 같지만 별도 state+effect 로 관리한다
  // (②-a 가 narrative 를 calendar 와 분리한 것과 동일 이유 — 느린 LLM 호출이 즉시 캘린더 렌더를 붙잡지 않게).
  const [pairNarrative, setPairNarrative] = useState<string | null>(null);
  const [pairNarrativeLoading, setPairNarrativeLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  // ＋ 를 눌렀는데 비구독이면 WatchAddModal(GET/POST 403) 대신 잠금 티저를 보여준다 — subject 는
  // "나"에 그대로 두고 이 플래그만 켜서(실제 상대 fetch 없이) 완전 블러 카드를 띄운다.
  const [showLockedTeaser, setShowLockedTeaser] = useState(false);

  // 🔴 단일 refresh(): 마운트 + 체험/구독 성공 후 둘 다 이 함수를 부른다. state.kind 는 trial
  // 시작 뒤에도 "ready" 그대로라 useEffect([state.kind]) 로는 서술 재요청이 안 걸린다 — 캘린더+
  // 서술을 매번 통째로 다시 받는 편이 안정적이다(entitled 재판정도 캘린더 응답에 실려 있어 같이
  // 새로고침된다).
  async function refresh() {
    try {
      const res = await fetch("/api/byeolmaru/calendar", { cache: "no-store" });
      // 401 은 "지금 못 펼쳤어"(error) 로 뭉뚱그리지 않는다 — 재시도로는 절대 안 풀리는
      // 로그인 문제라 전용 상태로 분리한다. 별마루가 하단 탭에 들어가면 비로그인 진입이
      // 흔한 경로가 된다(별도 code:"LOGIN_REQUIRED" 를 라우트가 이미 내려주고 있다).
      if (res.status === 401) {
        trackUiEvent("byeolmaru_need_login");
        setState({ kind: "need_login" });
        return;
      }
      if (res.status === 404) {
        trackUiEvent("byeolmaru_no_profile");
        setState({ kind: "no_profile" });
        return;
      }
      if (!res.ok) {
        setState({ kind: "error" });
        return;
      }
      const data: CalendarResponse = await res.json();
      // tsconfig 의 noUncheckedIndexedAccess 가 꺼져 있어 data.cells[0] 은 배열이 비어도
      // 타입상 DayCell 로 보인다 — 런타임 undefined 를 못 잡고 DayDetailCard 가
      // cell.isToday 에서 크래시한다. 지금은 라우트가 빈 캘린더면 500 을 내서 못 만나지만
      // 그건 다른 파일의 계약이고 타입 시스템은 그 회귀를 못 잡아주니 여기서 직접 막는다.
      if (data.cells.length === 0) {
        setState({ kind: "error" });
        return;
      }
      setState({ kind: "ready", data });
      setAttendance(data.attendance);
      // 최초 로드만 오늘 날짜로 맞추고, 체험/구독 후 재조회에서는 유저가 보던 날짜를 유지한다.
      setSelected((prev) => prev ?? data.today);
      // 지켜보는 상대 목록은 자격자만 — 비자격은 /api/byeolmaru/watch 가 403 이라 아예 안 부른다.
      if (data.entitled) {
        void loadPartners();
      } else {
        setPartners([]);
      }
    } catch {
      setState({ kind: "error" });
      return;
    }

    setPremium((p) => ({ ...p, loading: true }));
    try {
      const nRes = await fetch("/api/byeolmaru/narrative", { cache: "no-store" });
      const j = await nRes.json();
      setPremium({ narrative: j.narrative ?? null, teaser: j.teaser ?? null, loading: false });
    } catch {
      setPremium({ narrative: null, teaser: null, loading: false });
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  // 담은 상대 목록(SubjectToggle 칩) — refresh() 최초/재조회 및 WatchAddModal onAdded 후 호출.
  async function loadPartners() {
    try {
      const res = await fetch("/api/byeolmaru/watch", { cache: "no-store" });
      if (!res.ok) {
        setPartners([]); // 403(비자격) 등 — 에러로 취급하지 않고 그냥 빈 목록
        return;
      }
      const j = await res.json();
      setPartners(Array.isArray(j?.watched) ? j.watched : []);
    } catch {
      setPartners([]);
    }
  }

  const entitledNow = state.kind === "ready" && state.data.entitled;

  // subject 가 상대로 바뀔 때마다 우리 캘린더를 새로 받는다. entitledNow 를 의존성에 넣어
  // 같은 상대를 보는 도중 체험/구독이 막 풀렸을 때도(entitled false→true) 자동으로 잠금 없는
  // 응답을 다시 받는다(그렇지 않으면 트라이얼 시작 버튼을 눌러도 화면이 계속 잠긴 채로 남는다).
  useEffect(() => {
    if (subject === "me") return;
    let cancelled = false;
    setPairLoading(true);
    setPairData(null);
    setPairLocked(false);
    setPairError(false);
    setPairSelected(null);
    void (async () => {
      try {
        const res = await fetch(`/api/byeolmaru/calendar?subject=${encodeURIComponent(subject)}`, {
          cache: "no-store",
        });
        const j = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || !j) {
          setPairError(true);
          return;
        }
        if (j.locked) {
          setPairLocked(true);
          return;
        }
        if (j.entitled && Array.isArray(j.cells) && j.cells.length > 0) {
          setPairData({ cells: j.cells, backdrop: j.backdrop, partnerName: j.partnerName });
          setPairSelected(j.today);
          return;
        }
        setPairError(true);
      } catch {
        if (!cancelled) setPairError(true);
      } finally {
        if (!cancelled) setPairLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [subject, entitledNow]);

  // 우리 오늘 서술 fetch — 위 캘린더 effect 와 트리거(deps)는 같지만 의도적으로 분리된 별개
  // effect 다. 캘린더는 룰 판정이라 즉시 오고 서술은 nano 호출이라 느리다 — 하나로 합치면 서술
  // 완료까지 캘린더 렌더가 묶인다. cancelled 가드도 캘린더 effect 와 동일 패턴(빠른 subject
  // 전환 시 먼저 시작된 낡은 fetch 가 나중에 도착해 최신 상태를 덮어쓰는 것을 막는다).
  useEffect(() => {
    if (subject === "me") {
      setPairNarrative(null);
      setPairNarrativeLoading(false);
      return;
    }
    let cancelled = false;
    setPairNarrative(null);
    setPairNarrativeLoading(true);
    void (async () => {
      try {
        const res = await fetch(`/api/byeolmaru/pair-narrative?subject=${encodeURIComponent(subject)}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          // 403(비자격)도 여기로 온다 — 파트너 칩 자체가 자격자에게만 노출되니 실제로는 거의
          // 안 타지만, 타더라도 null 로 흡수하면 그만이다(위 pairLocked 가 잠금 UI 를 이미 맡는다).
          if (!cancelled) setPairNarrative(null);
          return;
        }
        const j = await res.json();
        if (!cancelled) setPairNarrative(j.narrative ?? null);
      } catch {
        if (!cancelled) setPairNarrative(null);
      } finally {
        if (!cancelled) setPairNarrativeLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [subject, entitledNow]);

  async function handleStartTrial() {
    trackUiEvent("byeolmaru_trial_started");
    await fetch("/api/byeolmaru/trial", { method: "POST" });
    await refresh(); // entitled 이 true 로 바뀌고 narrative 가 채워진다
    setShowLockedTeaser(false); // ＋ 경유 잠금 티저를 보던 중이었다면 해제(체험 시작으로 자격 생김)
  }
  async function handleCheckin() {
    trackUiEvent("byeolmaru_checkin", { meta: { streak: attendance?.streak ?? 0 } });
    setCheckinLoading(true);
    try {
      const r = await fetch("/api/byeolmaru/checkin", { method: "POST" });
      const j = await r.json();
      if (j.attendance) setAttendance(j.attendance);
    } finally {
      setCheckinLoading(false);
    }
  }
  function handleSubscribeClick() {
    trackUiEvent("byeolmaru_subscribe_clicked");
    setConfirmOpen(true);
    // 잔액 조회 — app/tarot/draw, app/fortune/[type], ThreadDrawModal 과 동일한
    // /api/stars/balance 패턴(항상 200, 비로그인/에러는 0).
    setSubBalanceLoading(true);
    setSubBalance(null);
    void (async () => {
      try {
        const r = await fetch("/api/stars/balance", { cache: "no-store" });
        const d = r.ok ? await r.json() : null;
        setSubBalance(typeof d?.balance === "number" ? d.balance : 0);
      } catch {
        setSubBalance(0);
      } finally {
        setSubBalanceLoading(false);
      }
    })();
  }
  async function handleSubscribeConfirm() {
    const res = await fetch("/api/byeolmaru/subscribe", { method: "POST" });
    if (res.status === 402) {
      window.location.href = "/shop";
      return;
    }
    if (res.ok) {
      trackUiEvent("byeolmaru_subscribe_completed", { meta: { stars: BYEOLMARU_SUBSCRIPTION.cost } });
      setConfirmOpen(false);
      setShowLockedTeaser(false); // ＋ 경유 잠금 티저를 보던 중이었다면 해제(구독으로 자격 생김)
      await refresh();
      return;
    }
    // 500(purchase_failed) 등 — 모달을 닫아 무한 로딩처럼 보이지 않게 최소 신호를 준다.
    setConfirmOpen(false);
    alert("구독이 안 됐어. 잠시 후 다시 시도해줄래?");
  }

  // ＋ 버튼 — 자격자만 실제 담기 모달을 연다. 비자격은 WatchAddModal 을 열어봤자 GET/POST 가
  // 전부 403 이라, 대신 잠금 티저(구독 유도)를 보여준다(§4 완전 블러 원칙 — 상대 없이도 유도 가능).
  function handleAdd() {
    if (state.kind !== "ready") return;
    if (state.data.entitled) {
      setAddOpen(true);
    } else {
      setShowLockedTeaser(true);
    }
  }

  if (state.kind === "loading") {
    return <main className="mx-auto w-full max-w-md p-6 text-center text-text-light">별마루를 펼치고 있어…</main>;
  }
  if (state.kind === "need_login") {
    return (
      <main className="mx-auto w-full max-w-md p-6 text-center">
        <p className="mb-4 text-eye-purple">로그인하면 네 달력을 펼쳐줄게.</p>
        <Link href="/login?next=/byeolmaru" className="rounded-xl bg-lilac-deep px-4 py-2 text-cream">
          로그인하러 가기
        </Link>
      </main>
    );
  }
  if (state.kind === "no_profile") {
    return (
      <main className="mx-auto w-full max-w-md p-6 text-center">
        <p className="mb-4 text-eye-purple">생년월일을 알려주면 네 달력을 그려줄게.</p>
        {/* /fortune 은 진열대(카탈로그)일 뿐 생일 입력 폼이 없다 — 상품을 골라 들어가도
            내 사주(primary)가 없으면 그 화면조차 결국 /mypage 로 되돌린다
            (FortuneSajuPicker "아직 내 사주를 등록하지 않았어" 분기). /mypage 는 "내 사주"
            섹션에서 바로 "내 사주 입력하기" 버튼 → SelfSajuEditModal 로 한 번에 연결되는
            실제 등록 지점이라 여기서 곧장 이쪽으로 보낸다. */}
        <Link href="/mypage" className="rounded-xl bg-lilac-deep px-4 py-2 text-cream">
          생년월일 입력하러 가기
        </Link>
      </main>
    );
  }
  if (state.kind === "error") {
    return <main className="mx-auto w-full max-w-md p-6 text-center text-text-light">지금은 별마루를 못 펼쳤어. 잠시 뒤에 다시 와줄래?</main>;
  }

  const { data } = state;
  const cell = data.cells.find((c) => c.date === selected) ?? data.cells[0];
  const crossSell = pickCrossSell(cell);

  // CalendarGrid 는 이제 나(DayCell)도 우리(PairDayCell)도 아닌 정규화 셀만 받는다 — 톤 3단
  // (good/normal/caution)이 두 판정 엔진에서 같은 union 이라 매핑에 손실이 없다.
  const selfGridCells: GridCell[] = data.cells.map((c) => ({
    date: c.date,
    ganji: c.ganji,
    tone: c.grade.tone,
    label: c.grade.label,
    isToday: c.isToday,
  }));
  const pairGridCells: GridCell[] = pairData
    ? pairData.cells.map((c) => ({
        date: c.date,
        ganji: c.ganji,
        tone: c.tone,
        label: PAIR_TONE_LABEL[c.tone],
        isToday: c.isToday,
      }))
    : [];
  const pairCell = pairData ? pairData.cells.find((c) => c.date === pairSelected) ?? pairData.cells[0] : null;
  // ＋ 경유 잠금 티저 또는 실제 상대 fetch 가 locked 로 응답한 경우 — 둘 다 같은 완전 블러 카드.
  const lockedTeaser = showLockedTeaser || (subject !== "me" && pairLocked);

  return (
    <main className="mx-auto w-full max-w-md space-y-4 p-4">
      <header>
        <h1 className="font-display text-2xl text-eye-purple">별마루</h1>
        <p className="text-sm text-text-light">
          오늘 들어온 두 글자 · {data.todayGanji}
        </p>
      </header>

      <AttendanceStrip attendance={attendance} loading={checkinLoading} onCheckin={handleCheckin} />

      <SubjectToggle
        partners={partners}
        selected={showLockedTeaser ? "" : subject}
        onSelect={(id) => {
          setShowLockedTeaser(false);
          if (id !== "me") trackUiEvent("byeolmaru_partner_selected");
          setSubject(id);
        }}
        onAdd={handleAdd}
      />

      {subject === "me" && !showLockedTeaser ? (
        <>
          <section aria-label="30일 캘린더">
            <CalendarGrid cells={selfGridCells} selectedDate={cell.date} onSelect={setSelected} />
          </section>
          <DayDetailCard cell={cell} />

          <PremiumBlock
            entitled={data.entitled}
            trialUsed={data.trialUsed}
            narrative={premium.narrative}
            teaser={premium.teaser}
            loading={premium.loading}
            onStartTrial={handleStartTrial}
            onSubscribe={handleSubscribeClick}
          />

          <section className="rounded-2xl bg-cream-warm p-4">
            <h2 className="mb-2 font-display text-base text-eye-purple">앞으로 30일 흐름</h2>
            <ul className="space-y-1 text-sm text-text-light">
              {/* 30일 = 7×4+2 라 버킷은 항상 5개고 마지막은 2일짜리다("4주" 로 부르면 어긋난다 —
                  lib/byeolmaru/calendar.ts weekBuckets 참고). 게다가 이 롤링 7일 버킷은 화면 위
                  CalendarGrid 의 달력 요일 정렬과 경계가 다르다(오늘이 무슨 요일이냐에 따라
                  그리드 1주차 칸 수가 달라짐). "N주차" 라는 이름 자체가 두 그리드를 하나로
                  착각하게 만들어서, 아예 각 버킷을 실제 날짜 범위로만 표시한다. */}
              {data.weeks.map((w) => (
                <li key={w.index}>
                  {fmtMD(w.startDate)}~{fmtMD(w.endDate)} — 잘 맞는 날 {w.good}일 · 챙길 날 {w.caution}일
                </li>
              ))}
            </ul>
          </section>

          <CrossSellCard item={crossSell} />
        </>
      ) : lockedTeaser ? (
        <LockedWooriTeaser
          trialUsed={data.trialUsed}
          loading={premium.loading}
          onStartTrial={() => {
            trackUiEvent("byeolmaru_subscribe_from_woori", { meta: { action: "trial" } });
            handleStartTrial();
          }}
          onSubscribe={() => {
            trackUiEvent("byeolmaru_subscribe_from_woori", { meta: { action: "subscribe" } });
            handleSubscribeClick();
          }}
        />
      ) : pairError ? (
        <p className="rounded-2xl bg-cream-warm p-4 text-center text-sm text-text-light">
          지금은 우리 오늘을 못 펼쳤어. 잠시 후 다시 볼래?
        </p>
      ) : pairData && pairCell ? (
        <>
          <section aria-label="우리 30일 캘린더">
            <CalendarGrid cells={pairGridCells} selectedDate={pairCell.date} onSelect={setPairSelected} />
          </section>
          <PairDayDetailCard
            cell={pairCell}
            backdrop={pairData.backdrop}
            partnerName={pairData.partnerName}
            narrative={pairNarrative}
            narrativeLoading={pairNarrativeLoading}
          />
        </>
      ) : pairLoading ? (
        <p className="rounded-2xl bg-cream-warm p-4 text-center text-sm text-text-light">
          우리 오늘을 펼치는 중…
        </p>
      ) : null}

      {confirmOpen && (
        <StarConfirmModal
          cost={BYEOLMARU_SUBSCRIPTION.cost}
          balance={subBalance}
          loading={subBalanceLoading}
          accent="#E8C26A"
          title="별마루 구독"
          subtitle="30일 동안 매일 개인화를 열어둬"
          confirmLabel="구독하기"
          onConfirm={handleSubscribeConfirm}
          onCharge={() => (window.location.href = "/shop")}
          onClose={() => setConfirmOpen(false)}
        />
      )}

      {addOpen && (
        <WatchAddModal
          onClose={() => setAddOpen(false)}
          onAdded={(id) => {
            setAddOpen(false);
            void loadPartners();
            setSubject(id);
          }}
        />
      )}
    </main>
  );
}
