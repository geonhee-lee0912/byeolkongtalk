"use client";

// components/byeolmaru/DailyCardBlock.tsx — 별마루 블록4: 오늘의 카드.
// 뽑기(CardDrawRitual 재사용, 결제 모달 없이 무료) → 하루 1장 고정(byeolmaru_daily_card) →
// **한 장**(P6-4 §5-1 C안): 무료 taste + 게이지 → 절단선 → 구독자 7블록 리포트 / 비구독 PaywallCut.
// 🔴 taste 와 게이지는 자격과 무관하게 **항상** 절단선 위에 있다(§5-3①②) — 유료 프롬프트가 카드 상징
//    재설명을 금지하므로 taste 가 빠지면 돈 낸 사람이 "이 카드가 어떤 카드인지"를 못 읽고, 게이지는
//    룰 100%·원가 0이라 유료로 가둘 이유가 없다.
// design §2: docs/superpowers/specs/2026-09-05-별마루-5-원카드-폐지-낙수-design.md
import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { createPortal } from "react-dom";
import { getCard, getCardImagePath } from "@/lib/tarot/cards";
import { getCardTaste } from "@/lib/byeolmaru/static-lines";
import { dayWordFor } from "@/lib/byeolmaru/report-date";
import type { CardReport } from "@/lib/byeolmaru/card-report";
import type { CardGauge } from "@/lib/byeolmaru/card-gauge";
import { TAROT_PAID_CHARS, TAROT_PAID_SECTIONS } from "@/lib/byeolmaru/paywall-sections";
import type { DrawnCard } from "@/lib/tarot/spreads";
import CardDrawRitual from "@/components/tarot/CardDrawRitual";
import CardReportView, { CardGaugeView } from "./CardReportView";
import PaywallCut from "./PaywallCut";
import { shareToKakao, isKakaoReady } from "@/lib/kakao-share";
import { trackUiEvent } from "@/lib/analytics/ui-events";

interface DailyCard {
  cardId: number;
  reversed: boolean;
}

type CardState =
  | { kind: "loading" }
  | { kind: "none" }
  // 🔴 카드는 **그 카드가 속한 날짜**를 달고 다닌다 — 이 화면은 같은 라우트 안에서 쿼리만 바뀌며
  //    재마운트 없이 다시 그려져서(뒤로가기·"오늘 카드 뽑으러 가기 →"), date prop 이 먼저 바뀌고
  //    카드 재조회는 한 프레임 뒤에 시작된다. 그 틈에 서술 effect 가 (옛 카드 + 새 날짜)로 한 번,
  //    새 카드가 도착한 뒤 또 한 번 나간다 — 캐시 미스면 **LLM 이 두 번 돈다**. date 를 같이 들고
  //    있으면 그 틈을 구조로 막는다(effect 가 정합이 맞을 때만 부른다).
  | { kind: "drawn"; date: string; card: DailyCard };

// 별마루 브랜드 액센트(StarConfirmModal 구독 확인 등과 동일 gold) — 타로 스프레드별 accent 와
// 구분해 "이건 별마루 무료 상품"이라는 톤을 준다.
const RITUAL_ACCENT = "#E8C26A";

// 무료 정적 해석 — 키워드 기반 템플릿(⑤ 스코프, design §2/§6). ⑥에서 별콩 톤 뱅크로 교체 예정.
// 조사(과/와) 활용을 피하려 인용부호+가운뎃점으로 나열한다(받침 유무 계산 없이 문법 오류 회피).
function buildStaticLine(keywords: string[]): string {
  const [a, b] = keywords;
  if (a && b) return `오늘은 '${a}' · '${b}', 그런 결이 스치는 날이야.`;
  if (a) return `오늘은 '${a}', 그런 결이 스치는 날이야.`;
  return "오늘 하루, 이 카드가 네 곁에 있어.";
}

export default function DailyCardBlock({
  date,
  todayKst,
  entitled,
  trialUsed,
  onStartTrial,
  onSubscribe,
}: {
  /** 보고 있는 날짜(YYYY-MM-DD). 오늘이 아니면 뽑기 의식은 열리지 않는다. */
  date: string;
  /** KST 오늘 — 같은지 비교해 "오늘/그날"을 가른다. */
  todayKst: string;
  entitled: boolean;
  trialUsed: boolean;
  onStartTrial: (slot?: string) => void;
  onSubscribe: (slot?: string) => void;
}) {
  const [state, setState] = useState<CardState>({ kind: "loading" });

  const [ritualOpen, setRitualOpen] = useState(false);
  const [pendingDraw, setPendingDraw] = useState<DailyCard | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const [report, setReport] = useState<CardReport | null>(null);
  // 게이지는 리포트와 **따로** 든다 — 비자격자는 report 없이 gauge 만 받는다(라우트 계약 ②).
  const [gauge, setGauge] = useState<CardGauge | null>(null);
  const [narrativeLoading, setNarrativeLoading] = useState(false);
  // 프로필(생일)이 없어 서술을 못 만든 경우("no_profile")만 구분해 남긴다.
  // 🔴 자격과 무관하다 — 라우트는 사주 축을 못 만들면 자격 판정 **전에** 404 를 준다(계약 ⑥).
  const [narrativeBlocked, setNarrativeBlocked] = useState<"no_profile" | null>(null);
  // 지난 날인데 그때 받은 리포트가 없는 경우 — 생성 실패와 구분해야 안내 문구가 맞는다
  // (SajuTodayView 의 notGenerated 와 같은 역할·같은 문구).
  const [notGenerated, setNotGenerated] = useState(false);
  // route 가 report:null 과 함께 reason:"generation_failed" 를 명시적으로 준 경우만 별도 안내 —
  // 진짜 500·네트워크 실패는 여전히 narrative:null 로 조용히 흡수한다(그건 안내할 만큼 확실치 않은 blip).
  // 재시도 버튼은 없다(out of scope) — taste 폴백은 이미 떠 있으니 빈 화면은 아니다.
  const [narrativeFailed, setNarrativeFailed] = useState(false);

  // 그날 카드 조회 — ?date= 없으면 라우트가 오늘로 떨어뜨리지만, 여기선 항상 명시해 보낸다
  // (화면이 보고 있는 날과 조회한 날이 갈라지지 않게).
  useEffect(() => {
    let cancelled = false;
    // 🔴 날짜가 바뀌면 먼저 "모름"으로 되돌린다 — 이 화면은 같은 라우트 안에서 쿼리만 바뀌며
    //    재마운트 없이 다시 그려진다(지난 날 안내의 "오늘 카드 뽑으러 가기 →"가 그 경로다).
    //    안 지우면 새 날짜 헤더 밑에 **직전 날짜의 카드·안내**가 응답이 올 때까지 그대로 남는다.
    setState({ kind: "loading" });
    void (async () => {
      try {
        const res = await fetch(`/api/byeolmaru/daily-card?date=${date}`, { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setState({ kind: "none" });
          return;
        }
        const j = await res.json();
        if (cancelled) return;
        setState(j.card ? { kind: "drawn", date, card: j.card } : { kind: "none" });
      } catch {
        if (!cancelled) setState({ kind: "none" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [date]);

  // 서술 + 게이지 — 카드 렌더와 분리된 별도 effect(느린 LLM 호출이 카드 이미지 렌더를 붙잡지 않게).
  // 🔴 P6-4 §5-3② — **비자격자도 부른다.** 라우트가 자격 판정 **앞에서** 게이지를 만들어 200 으로
  //    주고 LLM 은 돌지 않는다(원가 0). 예전의 "비자격은 skip" 규율은 403 을 피하려던 것이라 이제
  //    무효다 — 그대로 두면 무료로 줄 수 있는 게이지를 안 받아오는 셈이 된다.
  // 🔴 진입 가드는 카드 유무 **그리고 날짜 정합**이다. state.date !== date 인 프레임(= 날짜가 먼저
  //    바뀌고 카드 재조회가 아직 안 끝난 틈)에서 부르면, 새 카드가 도착한 뒤 한 번 더 나가 같은
  //    날짜에 대해 요청이 2회가 된다 — 오늘 캐시 미스면 LLM 이 두 번 돈다.
  const cardDate = state.kind === "drawn" ? state.date : null;
  useEffect(() => {
    if (cardDate !== date) {
      setReport(null); setGauge(null); setNarrativeLoading(false);
      setNarrativeBlocked(null); setNarrativeFailed(false); setNotGenerated(false);
      return;
    }
    let cancelled = false;
    setReport(null); setGauge(null);
    setNarrativeBlocked(null); setNarrativeFailed(false); setNotGenerated(false);
    setNarrativeLoading(entitled); // 로딩 문구는 자격자에게만 — 비자격은 기다릴 글이 없다
    void (async () => {
      try {
        const res = await fetch(`/api/byeolmaru/card-narrative?date=${date}`, { cache: "no-store" });
        if (res.status === 404) {
          // card-narrative 는 생일이 없으면 profile_not_found 404 를 준다(정당한 응답 — 카드×사주
          // 서술은 물론 게이지도 사주 축이 없으면 못 만든다). 예전엔 이걸 narrative:null 로 접어
          // 무료와 똑같은 화면을 보여줬다.
          if (!cancelled) setNarrativeBlocked("no_profile");
          return;
        }
        if (!res.ok) {
          if (!cancelled) { setReport(null); setGauge(null); }
          return;
        }
        const j = await res.json();
        if (!cancelled) {
          setGauge(j.gauge ?? null);
          setReport(j.report ?? null);
          // reason 은 route 가 명시적으로 구분해 준 신호만 읽는다(비자격 응답엔 report·reason 이
          // 아예 없어 둘 다 false 로 떨어진다 — 비자격자에게 안내 문구가 새지 않는다).
          // 과거 날짜의 "그날은 안 받았어"(not_generated)는 실패가 아니다 — 재시도 문구를 띄우지 않는다.
          setNarrativeFailed(!j.report && j.reason === "generation_failed");
          setNotGenerated(!j.report && j.reason === "not_generated");
        }
      } catch {
        if (!cancelled) { setReport(null); setGauge(null); }
      } finally {
        if (!cancelled) setNarrativeLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entitled, cardDate, date]);

  // 🔴 의식이 실제로 떠 있는가 — 포털과 스크롤 잠금이 **같은 하나**를 봐야 한다.
  //    `ritualOpen` 만으로는 부족하다: 이 화면은 같은 라우트 안에서 쿼리만 바뀌면 재마운트가
  //    없어, 오늘 열어둔 의식이 `?date=지난날` 로 돌아가도 그대로 살아남는다(뒤로가기가 그 경로다).
  //    그러면 POST 는 서버 오늘로 저장하는데 화면은 "그날의 카드"라고 말해 — 소급으로 뽑은 것처럼
  //    보인다(스펙 §4 "그때 받은 것만" 위반). 선언적으로 잠근다.
  //    🔴 잠금 effect 와 포털 중 **하나만** 잠그면 안 된다: 포털만 닫으면 ritualOpen 이 true 라
  //       이 effect 의 cleanup 이 안 돌아 body overflow:hidden 이 남는다(다이얼로그 없이 스크롤 먹통).
  const ritualVisible = ritualOpen && date === todayKst;

  // 배경 스크롤 잠금 + ESC 닫기 — WatchAddModal 과 동일 패턴(저장 중엔 닫기 불가).
  useEffect(() => {
    if (!ritualVisible) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) closeRitual();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ritualVisible, saving]);

  function openRitual() {
    // 🔴 소급 뽑기 금지 — POST 는 언제나 **오늘**로 저장한다(스펙 §4 "그때 받은 것만").
    //    ritualVisible 에 이미 같은 조건이 있어 이건 이중 방어다(여는 쪽도 막아둔다).
    if (date !== todayKst) return;
    setSaveError(false);
    setPendingDraw(null);
    setRitualOpen(true);
  }

  function closeRitual() {
    if (saving) return;
    setRitualOpen(false);
    setSaveError(false);
    setPendingDraw(null);
  }

  async function saveDraw(cardId: number, reversed: boolean) {
    setSaving(true);
    setSaveError(false);
    try {
      const res = await fetch("/api/byeolmaru/daily-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId, reversed }),
      });
      if (!res.ok) {
        setSaveError(true);
        return;
      }
      const j = await res.json();
      if (!j.card) {
        setSaveError(true);
        return;
      }
      // 🔴 date 가 아니라 todayKst 를 단다 — POST 는 **언제나 오늘**로 저장하므로 그게 이 카드의
      //    진짜 날짜다. 둘이 갈라지는 경로는 3중으로 막혀 있지만(CTA·openRitual·ritualVisible),
      //    만에 하나 갈라지면 화면이 아무것도 안 그리는 쪽으로 실패한다(엉뚱한 날짜에 카드를
      //    붙여 보여주는 것보다 낫다). 🔴 이 말이 참인 건 렌더 게이트가 `state.date === date` 를
      //    같이 보기 때문이다 — 둘은 한 쌍이니 한쪽만 풀지 말 것.
      setState({ kind: "drawn", date: todayKst, card: j.card });
      setPendingDraw(null);
      setRitualOpen(false);
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  }

  function handleRitualComplete(drawn: DrawnCard[]) {
    const d = drawn[0];
    if (!d) {
      setRitualOpen(false);
      return;
    }
    const cardId = d.card_id;
    const reversed = d.direction === "reversed";
    setPendingDraw({ cardId, reversed });
    void saveDraw(cardId, reversed);
  }

  if (state.kind === "loading") return null; // AttendanceStrip 과 동일 관행(!data → null) — 스켈레톤 없이 조용히 대기

  // 그 날을 부르는 말 — 헤딩 두 곳과 게이지 문구가 같은 값을 쓴다(게이지는 지난 날에 "오늘"이라고
  // 말하던 걸 이걸로 막는다). 🔴 삼항을 손으로 적지 않는다: 이 말의 단일 원천은 report-date.ts 이고,
  // 사주 쪽(SajuTodayView)도 같은 함수를 쓴다.
  const dayWord = dayWordFor(date, todayKst);

  return (
    <>
      {state.kind === "none" && (
        <section className="rounded-2xl bg-cream-warm p-4">
          <h2 className="mb-2 font-display text-base text-eye-purple">{dayWord}의 카드</h2>
          {date === todayKst ? (
            <>
              <p className="mb-3 text-sm text-text-light">오늘 하루, 카드 한 장으로 가볍게 짚어볼까?</p>
              <button
                onClick={openRitual}
                className="w-full rounded-xl py-2.5 text-sm font-bold text-white"
                style={{ background: RITUAL_ACCENT }}
              >
                오늘의 카드 뽑기
              </button>
            </>
          ) : (
            // 🔴 지난 날 소급 뽑기는 하지 않는다(스펙 §4 "그때 받은 것만"). 미래는 아직 안 온 날이다.
            //    이 CTA 게이트만으로는 부족하다 — 쿼리 변경엔 재마운트가 없어, 오늘 연 의식이
            //    이 링크를 거쳐 뒤로가기로 돌아와도 살아남는다. 포털도 `ritualVisible` 로 같이 잠근다.
            <p className="text-sm text-text-light">
              {date < todayKst ? "그날은 카드를 안 뽑았어." : "카드는 그날 뽑는 거야."}{" "}
              <Link href="/byeolmaru/tarot" className="text-lilac-deep underline">오늘 카드 뽑으러 가기 →</Link>
            </p>
          )}
        </section>
      )}

      {/* 🔴 날짜 정합까지 본다 — 이 화면은 쿼리만 바뀌면 재마운트가 없어, date prop 이 먼저 바뀌고
          카드 재조회는 한 프레임 뒤에 끝난다. kind 만 보면 그 틈에 **옛 카드가 새 날짜 헤더 밑에서
          깜빡인다**(taste·인사말은 이미 새 날짜 시드라 글과 카드가 섞인 상태로). 정합이 안 맞으면
          아무것도 그리지 않는다 — 로딩과 같은 화면(빈 자리)이고, 그게 위 saveDraw 주석이 말하는
          "아무것도 안 그리는 쪽으로 실패"를 실제로 참이게 만드는 게이트다. */}
      {state.kind === "drawn" && state.date === date &&
        (() => {
          const drawnCard = state.card;
          const tarotCard = getCard(drawnCard.cardId);
          if (!tarotCard) return null; // 카드 마스터 불일치 방어 — 빈 화면 대신 조용히 스킵
          const reversed = drawnCard.reversed;
          const orientLabel = reversed ? "역위" : "정위";
          const kwList = reversed ? tarotCard.reversed : tarotCard.upright;
          // ⑥/1C 무료 타로 taste(~350자 별콩 톤 정적) 우선, 뱅크 미스면 키워드 템플릿 폴백.
          // 🔴 인사말 로테이션 시드는 **보고 있는 날짜**다 — 오늘 KST 로 고정하면 지난 날을 다시 열
          //    때마다 인사말이 바뀌어, "그때 받은 글"이어야 할 것이 매번 달라진다.
          const taste = getCardTaste(drawnCard.cardId, reversed, date) ?? buildStaticLine(kwList);
          // 지난 날이라 taste 위에 시점 프레이밍 줄을 얹는가 — 그 줄과 taste 의 간격이 한 쌍으로 걸린다.
          const framed = date !== todayKst;
          // tarotCard 의 non-null narrowing 이 아래 nested 함수 클로저까지 이어지지 않아 별도 캡처.
          const cardNameKr = tarotCard.name_kr;

          function handleShare() {
            const ok = shareToKakao({
              title: `오늘의 카드 · ${cardNameKr}`,
              description: "별마루에서 오늘 카드 한 장 뽑아봐 — 무료로 매일.",
              imageUrl: `${window.location.origin}/api/og/byeolmaru/tarot?card=${drawnCard.cardId}&rev=${drawnCard.reversed ? 1 : 0}`,
              // 🔴 착지 경로는 건드리지 않는다 — 파라미터만 붙인다(§10-1①). 이 블록이 허브에서 전용
              //    라우트로 이전돼 허브엔 카드 섹션이 없다: /byeolmaru 로 바꾸면 수신자가 카드를 못
              //    보고, 그건 utm 이 재려는 바로 그 첫 칸을 깎는다(사주 쪽 788136d 의 교훈).
              //    비로그인 수신자용 보조 링크("별마루 먼저 둘러보기")는 이 화면에 이미 있다.
              link: `${window.location.origin}/byeolmaru/tarot?utm_source=byeolmaru_tarot&utm_medium=share`,
              buttonTitle: "나도 뽑아보기",
            });
            // 결과(ok) 를 실어 성공 공유와 SDK 미준비 무음실패를 구분 — Loop2 바이럴 지표 정직.
            trackUiEvent("byeolmaru_share_clicked", { meta: { kind: "tarot", ok } });
          }

          return (
            <section className="rounded-2xl bg-cream-warm p-4">
              {/* 🔴 위 "카드 없음" 분기와 **같은 값**을 쓴다 — 날짜 축이 열린 뒤로 "오늘의 카드"는
                  지난 날에서 거짓말이 된다(상단 BackHeader 는 이미 "9월 20일 타로"라고 말한다). */}
              <h2 className="mb-3 font-display text-base text-eye-purple">{dayWord}의 카드</h2>

              {/* 🔴 live region 은 **무료 구간만** 감싼다(section 전체가 아니다) — DayDetailCard 가
                  Task 6 에서 내린 것과 같은 판단이다. 아래 자격 삼항에는 유료 리포트(~1,800자)가
                  **몇 초 뒤 비동기로** 꽂히는데, 그게 live region 안이면 그 삽입이 addition 으로 잡혀
                  1,800자가 통째로 불쑥 낭독된다. 자손에 live 를 off 로 덮어 상속을 끊는 방법은
                  스크린리더 구현 편차가 있어 사주 쪽에서 이미 기각했다 — 아예 밖에 두면 구조로 보장된다.
                  🔴 다만 **사주와 달리 낭독이 보장된다고 보기 어렵다**(미검증·추정): 이 화면은 날짜가
                     바뀌면 state 가 loading 으로 떨어져 위에서 `return null` 이라 region 자체가 DOM 에서
                     사라졌다 다시 꽂힌다. 삽입과 **동시에** 생긴 region 은 스크린리더가 대체로 안 읽는다고
                     알려져 있다(region 이 먼저 DOM 에 있어야 한다는 ARIA 실무 지침). DayDetailCard 는
                     언마운트가 없어 그 전제가 선다. 구조를 맞추려면 로딩 중에도 region 을 남겨야 하는데,
                     그건 이 태스크 범위 밖이다(`return null` 은 Task 9 이전부터의 패턴). 실제 스크린리더로
                     확인한 적은 없으니 "그래서 안 읽힌다"로 단정하지도 말 것. */}
              <div aria-live="polite">
                <div className="flex flex-col items-center text-center">
                  <div className="relative h-[187px] w-[110px] overflow-hidden rounded-lg shadow-md">
                    <Image
                      src={getCardImagePath(drawnCard.cardId)}
                      alt={tarotCard.name_kr}
                      fill
                      sizes="110px"
                      className={`object-cover ${reversed ? "rotate-180" : ""}`}
                    />
                  </div>
                  <p className="mt-2 font-display text-[15px] text-eye-purple">
                    {tarotCard.name_kr} <span className="text-xs text-text-light">· {orientLabel}</span>
                  </p>
                  <p className="mt-1 text-xs text-text-light">{kwList.join(", ")}</p>
                </div>

                {/* 🔴 과거 날짜 프레이밍 — card-taste.json 본문 156/156 이 "오늘" 기준 현재형이라
                    (본문당 평균 3.9회), 지난 날 화면에서 라벨·게이지·리포트만 "그날"로 돌면 taste 만
                    시제가 어긋난다. 312문장을 다시 쓰는 대신(§5-2 "무료는 안 건드린다") 이 한 줄로
                    **읽는 시점**을 그날로 옮긴다(사용자 확정 2026-09-21).
                    🔴 기계 치환("오늘"→"그날")은 기각됐다 — 본문이 현재형이라 "그날은 … 좋은
                       흐름이야"가 비문이 된다. 인사말 교체도 안 된다(인사말엔 "오늘"이 거의 없다).
                    🔴 과거/미래를 또 가르지 말 것 — **미래는 이 자리에 오지 않는다.** 미래 날짜엔
                       카드 행이 없어 state.kind 가 "none" 으로 떨어진다(POST 는 언제나 오늘로 저장).
                       그래서 2분기(`date !== todayKst`)로 충분하다. */}
                {framed && (
                  <p className="mt-3 text-xs text-text-light">그날 이 카드를 뽑았을 때 별콩이가 건넨 말이야.</p>
                )}
                {/* 무료 taste — 🔴 자격 여부와 무관하게 **항상** 그린다(§5-3①). 유료 프롬프트가 카드
                    상징 재설명을 금지하므로, 이게 없으면 돈 낸 사람만 "이 카드가 어떤 카드인지"를
                    키워드 말고는 못 읽는다. 사주 쪽(DayDetailCard)과 같은 동작이다.
                    🔴 상단 간격이 framed 에 걸린다 — 프레이밍 줄과 둘 다 mt-3 이면 한 덩어리로
                       읽혀야 할 둘 사이가 벌어진다(그 줄은 이 문단의 머리말이다). */}
                <p className={`${framed ? "mt-1.5" : "mt-3"} text-sm leading-relaxed text-eye-purple`}>{taste}</p>

                {/* 게이지 — 절단선 **위**(무료). 룰 100%·원가 0이라 §5 경계 원칙에 걸리지 않는다(§5-3②). */}
                {gauge && <CardGaugeView gauge={gauge} reversed={reversed} dayWord={dayWord} />}

                {/* 생일 안내 — 🔴 자격 분기 **밖**이다. 404(profile_not_found)는 자격 판정 앞에서 나와
                    비자격자도 받는데(라우트 계약 ⑥), 자격 분기 안에 두면 그 사람은 게이지도 리포트도
                    없는 채 절단선만 보고 **왜 비었는지**를 영영 못 듣는다. 여기 두면 자격자에게는
                    기존과 같은 자리에 뜨고(그 경우 위 taste·게이지 바로 아래가 곧 이 줄이다),
                    비자격자에게는 절단선 **앞**에 뜬다 — 유료가 파는 것의 전제 조건이라 그 순서가 맞다. */}
                {narrativeBlocked === "no_profile" && (
                  <p className="mt-2 text-xs leading-relaxed text-text-light">
                    생년월일을 알려주면 이 카드를 네 사주에 얹어서 더 깊이 풀어줄게.{" "}
                    <Link href="/mypage" className="text-lilac-deep underline">
                      생년월일 입력하러 가기 →
                    </Link>
                  </p>
                )}
              </div>

              {entitled ? (
                <>
                  {narrativeLoading ? (
                    <p className="mt-4 border-t border-lilac-mid/20 pt-4 text-center text-sm text-text-light">
                      별콩이가 카드를 네 사주 위에 얹는 중…
                    </p>
                  ) : report ? (
                    // 🔴 border-t 래퍼를 씌우지 말 것 — CardReportView 의 첫 블록이 이미 자기 선을 긋는다.
                    <CardReportView report={report} />
                  ) : notGenerated ? (
                    <p className="mt-4 border-t border-lilac-mid/20 pt-4 text-center text-sm text-text-light">
                      그날은 리포트를 안 받았어. 지난 날은 그때 받은 것만 보여줄 수 있어.
                    </p>
                  ) : null}
                  {narrativeFailed && (
                    <p className="mt-2 text-xs leading-relaxed text-text-light">
                      별콩이가 잠깐 숨 고르는 중이야. 조금 뒤에 다시 와줄래?
                    </p>
                  )}
                </>
              ) : (
                <>
                  {/* 🔴 PaywallCut 은 마운트만으로 gate_shown 을 찍는다 — **비자격 분기 전용**이다
                      (자격자에게 그리면 그 계측의 분모가 구독자로 오염된다).
                      🔴 래퍼로 감싸지 말 것: 자체 mt-4 와 금색 절단선을 갖고 있고, min-h 실측이
                         "page p-4 + card p-4" 중첩을 가정한다(래퍼가 끼면 그 실측이 깨진다). */}
                  <PaywallCut
                    freeChars={taste.length}
                    paidChars={TAROT_PAID_CHARS}
                    sections={TAROT_PAID_SECTIONS}
                    blurText={taste}
                    trialUsed={trialUsed}
                    onStartTrial={onStartTrial}
                    onSubscribe={onSubscribe}
                    slot="tarot_rich"
                  />
                  {/* 인라인 낙수(design §5) — 구독자는 이미 LLM 해석을 받으므로 비구독 대상에만 노출 */}
                  <Link href="/" className="mt-3 inline-block text-xs text-lilac-deep underline">
                    이 카드, 타로로 더 깊게 →
                  </Link>
                </>
              )}

              {/* 🔴 오늘만 — 지난 날을 보다 공유하면 "오늘의 카드" 라벨로 다른 날 카드가 나간다
                  (OG 라우트도 카드 id 만 받아 날짜를 모른다). SajuTodayView 의 cell.isToday 와 같은 규율. */}
              {date === todayKst && (
                <button
                  onClick={handleShare}
                  disabled={!isKakaoReady()}
                  className="mt-3 w-full rounded-xl border border-lilac-mid/40 bg-white py-2 text-xs font-medium text-lilac-deep disabled:opacity-40"
                >
                  공유하기
                </button>
              )}
            </section>
          );
        })()}

      {ritualVisible &&
        createPortal(
          <div
            className="fixed inset-0 z-[75] flex flex-col overflow-y-auto bg-cream animate-fade-in"
            role="dialog"
            aria-modal="true"
            aria-label="오늘의 카드 뽑기"
          >
            <div className="flex shrink-0 items-center justify-between px-5 pt-5 pb-2">
              <h2 className="font-display text-[15px] font-bold text-eye-purple">오늘의 카드</h2>
              <button
                onClick={closeRitual}
                aria-label="닫기"
                disabled={saving}
                className="flex h-8 w-8 items-center justify-center rounded-full text-text-light/70 hover:bg-lilac-soft/50 disabled:opacity-40"
              >
                ✕
              </button>
            </div>

            {saveError ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 px-5 text-center">
                <p className="text-sm text-text-light">카드를 저장하지 못했어. 다시 시도해줄래?</p>
                <button
                  onClick={() => pendingDraw && void saveDraw(pendingDraw.cardId, pendingDraw.reversed)}
                  disabled={saving}
                  className="rounded-full px-5 py-2 text-sm font-bold text-white disabled:opacity-50"
                  style={{ background: RITUAL_ACCENT }}
                >
                  다시 시도
                </button>
              </div>
            ) : (
              <CardDrawRitual
                cardCount={1}
                slotLabels={["오늘의 카드"]}
                accent={RITUAL_ACCENT}
                ritualLabel="오늘의 카드"
                completeLabel="오늘의 카드 확인"
                onComplete={handleRitualComplete}
              />
            )}
          </div>,
          document.body
        )}
    </>
  );
}
