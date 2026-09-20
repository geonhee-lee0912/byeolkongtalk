"use client";

// components/byeolmaru/DailyCardBlock.tsx — 별마루 블록4: 오늘의 카드.
// 뽑기(CardDrawRitual 재사용, 결제 모달 없이 무료) → 하루 1장 고정(byeolmaru_daily_card) →
// 무료 정적(키워드 템플릿) + 구독자 7블록 리포트 + 게이지(card-narrative, P6-2) + 비구독 PremiumBlock 미끼(P5-4 §9) + 인라인 낙수.
// design §2: docs/superpowers/specs/2026-09-05-별마루-5-원카드-폐지-낙수-design.md
import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { createPortal } from "react-dom";
import { getCard, getCardImagePath } from "@/lib/tarot/cards";
import { getCardTaste } from "@/lib/byeolmaru/static-lines";
import type { CardReport } from "@/lib/byeolmaru/card-report";
import type { DrawnCard } from "@/lib/tarot/spreads";
import CardDrawRitual from "@/components/tarot/CardDrawRitual";
import CardReportView from "./CardReportView";
import PremiumBlock from "./PremiumBlock";
import { shareToKakao, isKakaoReady } from "@/lib/kakao-share";
import { trackUiEvent } from "@/lib/analytics/ui-events";

interface DailyCard {
  cardId: number;
  reversed: boolean;
}

type CardState =
  | { kind: "loading" }
  | { kind: "none" }
  | { kind: "drawn"; card: DailyCard };

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
  const [narrativeLoading, setNarrativeLoading] = useState(false);
  // 자격은 있는데 프로필(생일)이 없어 서술을 못 만든 경우("no_profile")만 구분해 남긴다.
  const [narrativeBlocked, setNarrativeBlocked] = useState<"no_profile" | null>(null);
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
        setState(j.card ? { kind: "drawn", card: j.card } : { kind: "none" });
      } catch {
        if (!cancelled) setState({ kind: "none" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [date]);

  // 서술(자격자 + 카드 있을 때만) — ②-a PremiumBlock/pairNarrative 와 동일하게 카드 렌더와 분리된
  // 별도 effect(느린 LLM 호출이 카드 이미지 렌더를 붙잡지 않게).
  // 🔴 지금은 비자격이면 아예 fetch 하지 않는다 — **이 skip 은 곧 걷어내야 한다.** 예전 근거였던
  //    "비자격은 어차피 403" 은 P6-4 Task 3 이후 거짓이다: 라우트는 비자격에게 200
  //    `{ entitled:false, gauge }` 를 준다(게이지는 룰 100%·원가 0이라 무료로 내보낸다, 스펙 §5-3②).
  //    즉 지금 이 skip 은 원가를 아끼는 게 아니라 **무료로 줄 수 있는 게이지를 안 받아오는 것**이다.
  //    Task 9 가 조건을 자격이 아니라 카드 유무(state.kind === "drawn")로 바꾼다.
  useEffect(() => {
    if (!entitled || state.kind !== "drawn") {
      setReport(null);
      setNarrativeLoading(false);
      setNarrativeBlocked(null);
      setNarrativeFailed(false);
      return;
    }
    let cancelled = false;
    setReport(null);
    setNarrativeBlocked(null);
    setNarrativeFailed(false);
    setNarrativeLoading(true);
    void (async () => {
      try {
        const res = await fetch(`/api/byeolmaru/card-narrative?date=${date}`, { cache: "no-store" });
        if (res.status === 404) {
          // card-narrative 는 생일이 없으면 profile_not_found 404 를 준다(정당한 응답 — 카드×사주
          // 서술엔 생일이 필수). 예전엔 이걸 narrative:null 로 접어 무료와 똑같은 화면을 보여줬다.
          if (!cancelled) setNarrativeBlocked("no_profile");
          return;
        }
        if (!res.ok) {
          if (!cancelled) setReport(null);
          return;
        }
        const j = await res.json();
        if (!cancelled) {
          setReport(j.report ?? null);
          // reason:"generation_failed" 는 route 가 명시적으로 구분해 준 신호만 안내한다
          // (reason:"not_drawn" 은 이 분기(카드 이미 뽑음)에서 정상적으로 나올 수 없어 무시해도 안전).
          setNarrativeFailed(!j.report && j.reason === "generation_failed");
        }
      } catch {
        if (!cancelled) setReport(null);
      } finally {
        if (!cancelled) setNarrativeLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entitled, state.kind, date]);

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
      setState({ kind: "drawn", card: j.card });
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

  return (
    <>
      {state.kind === "none" && (
        <section className="rounded-2xl bg-cream-warm p-4">
          <h2 className="mb-2 font-display text-base text-eye-purple">{date === todayKst ? "오늘의 카드" : "그날의 카드"}</h2>
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

      {state.kind === "drawn" &&
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
          // tarotCard 의 non-null narrowing 이 아래 nested 함수 클로저까지 이어지지 않아 별도 캡처.
          const cardNameKr = tarotCard.name_kr;

          function handleShare() {
            const ok = shareToKakao({
              title: `오늘의 카드 · ${cardNameKr}`,
              description: "별마루에서 오늘 카드 한 장 뽑아봐 — 무료로 매일.",
              imageUrl: `${window.location.origin}/api/og/byeolmaru/tarot?card=${drawnCard.cardId}&rev=${drawnCard.reversed ? 1 : 0}`,
              // 이 블록이 허브에서 전용 라우트(/byeolmaru/tarot)로 이전됨 — 허브에는 카드 섹션이 없어
              // 예전처럼 /byeolmaru 로 보내면 수신자가 카드를 못 본다.
              link: `${window.location.origin}/byeolmaru/tarot`,
              buttonTitle: "나도 뽑아보기",
            });
            // 결과(ok) 를 실어 성공 공유와 SDK 미준비 무음실패를 구분 — Loop2 바이럴 지표 정직.
            trackUiEvent("byeolmaru_share_clicked", { meta: { kind: "tarot", ok } });
          }

          return (
            <section className="rounded-2xl bg-cream-warm p-4" aria-live="polite">
              {/* 🔴 위 "카드 없음" 분기와 같은 말을 쓴다 — 날짜 축이 열린 뒤로 "오늘의 카드"는
                  지난 날에서 거짓말이 된다(상단 BackHeader 는 이미 "9월 20일 타로"라고 말한다). */}
              <h2 className="mb-3 font-display text-base text-eye-purple">{date === todayKst ? "오늘의 카드" : "그날의 카드"}</h2>

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

              {entitled ? (
                <>
                  {narrativeLoading ? (
                    <p className="mt-3 text-sm text-text-light">별콩이가 카드를 네 사주 위에 얹는 중…</p>
                  ) : report ? (
                    <CardReportView report={report} />
                  ) : (
                    // 서술 실패 시에도 정적 taste 로 degrade(구독자에게 빈 화면을 주지 않는다).
                    <p className="mt-3 text-sm leading-relaxed text-eye-purple">{taste}</p>
                  )}
                  {/* 자격자인데 프로필(생일)이 없어 서술을 못 만든 경우만 안내 — 에러가 아니라 안내라
                      taste 를 대체하지 않고 그 아래 작은 보조 줄로만 덧붙인다. 비자격자는 이 분기에
                      아예 들어오지 않으므로(entitled 가지 자체) 별도 조건 없이도 안전하다. */}
                  {narrativeBlocked === "no_profile" && (
                    <p className="mt-2 text-xs leading-relaxed text-text-light">
                      생년월일을 알려주면 이 카드를 네 사주에 얹어서 더 깊이 풀어줄게.{" "}
                      <Link href="/mypage" className="text-lilac-deep underline">
                        생년월일 입력하러 가기 →
                      </Link>
                    </p>
                  )}
                  {narrativeFailed && (
                    <p className="mt-2 text-xs leading-relaxed text-text-light">
                      별콩이가 잠깐 숨 고르는 중이야. 조금 뒤에 다시 와줄래?
                    </p>
                  )}
                </>
              ) : (
                <>
                  {/* 무료 taste — 카드 메시지+오늘 적용+조언 ~350자 정적(design §5). */}
                  <p className="mt-3 text-sm leading-relaxed text-eye-purple">{taste}</p>
                  {/* 유료 미끼(P5-4 §9 — 자리별 공용 컴포넌트) — baitCtx 는 안 넘긴다: 이 자리의
                      첫 줄(baitLead)은 등급·상대 같은 맥락 없이도 "지금"만으로 말이 된다.
                      PremiumBlock 은 자체 mt-3 이 없어(공용 컴포넌트라 margin prop 을 안 둔다) 위
                      taste 문단과의 간격을 이 래퍼로 준다. */}
                  <div className="mt-3">
                    <PremiumBlock
                      entitled={false}
                      trialUsed={trialUsed}
                      narrative={null}
                      teaser={null}
                      loading={false}
                      onStartTrial={onStartTrial}
                      onSubscribe={onSubscribe}
                      slot="tarot_rich"
                    />
                  </div>
                  {/* 인라인 낙수(design §5) — 구독자는 이미 LLM 해석을 받으므로 비구독 대상에만 노출 */}
                  <Link href="/" className="mt-3 inline-block text-xs text-lilac-deep underline">
                    이 카드, 타로로 더 깊게 →
                  </Link>
                </>
              )}

              <button
                onClick={handleShare}
                disabled={!isKakaoReady()}
                className="mt-3 w-full rounded-xl border border-lilac-mid/40 bg-white py-2 text-xs font-medium text-lilac-deep disabled:opacity-40"
              >
                공유하기
              </button>
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
