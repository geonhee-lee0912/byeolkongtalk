"use client";

// components/byeolmaru/DailyCardBlock.tsx — 별마루 블록4: 오늘의 카드.
// 뽑기(CardDrawRitual 재사용, 결제 모달 없이 무료) → 하루 1장 고정(byeolmaru_daily_card) →
// 무료 정적(키워드 템플릿) + 구독자 LLM 서술(card-narrative, ②-a 패턴) + 비구독 블러+CTA + 인라인 낙수.
// design §2: docs/superpowers/specs/2026-09-05-별마루-5-원카드-폐지-낙수-design.md
import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { createPortal } from "react-dom";
import { getCard, getCardImagePath } from "@/lib/tarot/cards";
import type { DrawnCard } from "@/lib/tarot/spreads";
import CardDrawRitual from "@/components/tarot/CardDrawRitual";
import StarConfirmModal from "@/components/common/StarConfirmModal";
import { BYEOLMARU_SUBSCRIPTION } from "@/lib/byeolmaru/constants";

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

export default function DailyCardBlock({ entitled }: { entitled: boolean }) {
  const [state, setState] = useState<CardState>({ kind: "loading" });

  const [ritualOpen, setRitualOpen] = useState(false);
  const [pendingDraw, setPendingDraw] = useState<DailyCard | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const [narrative, setNarrative] = useState<string | null>(null);
  const [narrativeLoading, setNarrativeLoading] = useState(false);

  // 구독/체험 CTA — 부모(ByeolmaruView)로부터 콜백을 받지 않는 자체완결 플로우(props 는 entitled
  // 하나뿐). trialUsed 를 모르니 항상 체험을 먼저 시도하고, 서버가 "이미 사용"이면 구독 확인으로
  // 폴백한다(startTrial 은 멱등이라 안전 — lib/byeolmaru/entitlement.ts startTrial 참조).
  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const [subBalance, setSubBalance] = useState<number | null>(null);
  const [subBalanceLoading, setSubBalanceLoading] = useState(false);
  const [subBusy, setSubBusy] = useState(false);

  // 오늘 카드 조회
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/byeolmaru/daily-card", { cache: "no-store" });
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
  }, []);

  // 서술(자격자 + 카드 있을 때만) — ②-a PremiumBlock/pairNarrative 와 동일하게 카드 렌더와 분리된
  // 별도 effect(느린 LLM 호출이 카드 이미지 렌더를 붙잡지 않게). 비자격은 아예 fetch 하지 않는다
  // (card-narrative 는 403 을 주지만, 호출 자체를 skip 하는 편이 원가·의도 모두 더 깔끔하다).
  useEffect(() => {
    if (!entitled || state.kind !== "drawn") {
      setNarrative(null);
      setNarrativeLoading(false);
      return;
    }
    let cancelled = false;
    setNarrative(null);
    setNarrativeLoading(true);
    void (async () => {
      try {
        const res = await fetch("/api/byeolmaru/card-narrative", { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setNarrative(null);
          return;
        }
        const j = await res.json();
        if (!cancelled) setNarrative(j.narrative ?? null);
      } catch {
        if (!cancelled) setNarrative(null);
      } finally {
        if (!cancelled) setNarrativeLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entitled, state.kind]);

  // 배경 스크롤 잠금 + ESC 닫기 — WatchAddModal 과 동일 패턴(저장 중엔 닫기 불가).
  useEffect(() => {
    if (!ritualOpen) return;
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
  }, [ritualOpen, saving]);

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

  function handleSubscribeCta() {
    if (subBusy) return;
    setSubBusy(true);
    void (async () => {
      try {
        const r = await fetch("/api/byeolmaru/trial", { method: "POST" });
        if (r.ok) {
          const j = await r.json();
          if (j.started) {
            window.location.reload(); // entitled 는 이 컴포넌트가 직접 못 바꾸는 부모 prop — 새로고침으로 동기화
            return;
          }
        }
      } catch {
        // 무시 — 아래 구독 확인 폴백으로 이어간다
      }
      setSubBusy(false);
      setSubscribeOpen(true);
      setSubBalanceLoading(true);
      setSubBalance(null);
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
      window.location.reload();
      return;
    }
    setSubscribeOpen(false);
    alert("구독이 안 됐어. 잠시 후 다시 시도해줄래?");
  }

  if (state.kind === "loading") return null; // AttendanceStrip 과 동일 관행(!data → null) — 스켈레톤 없이 조용히 대기

  return (
    <>
      {state.kind === "none" && (
        <section className="rounded-2xl bg-cream-warm p-4">
          <h2 className="mb-2 font-display text-base text-eye-purple">오늘의 카드</h2>
          <p className="mb-3 text-sm text-text-light">오늘 하루, 카드 한 장으로 가볍게 짚어볼까?</p>
          <button
            onClick={openRitual}
            className="w-full rounded-xl py-2.5 text-sm font-bold text-white"
            style={{ background: RITUAL_ACCENT }}
          >
            오늘의 카드 뽑기
          </button>
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
          return (
            <section className="rounded-2xl bg-cream-warm p-4" aria-live="polite">
              <h2 className="mb-3 font-display text-base text-eye-purple">오늘의 카드</h2>

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
                <p className="mt-2 text-sm leading-relaxed text-eye-purple">{buildStaticLine(kwList)}</p>
              </div>

              {entitled ? (
                narrativeLoading ? (
                  <p className="mt-3 text-sm text-text-light">별콩이가 카드를 읽는 중…</p>
                ) : narrative ? (
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-eye-purple">{narrative}</p>
                ) : null
              ) : (
                <>
                  <p className="mt-3 text-sm leading-relaxed text-eye-purple [mask-image:linear-gradient(#000,transparent)] opacity-60">
                    별콩이가 이 카드를 네 사주 위에 겹쳐서 오늘 흐름을 풀어주면…
                  </p>
                  <button
                    onClick={handleSubscribeCta}
                    disabled={subBusy}
                    className="mt-3 w-full rounded-xl bg-gold py-2.5 text-sm font-medium text-eye-purple disabled:opacity-60"
                  >
                    구독하고 이 카드 개인화 해석 보기
                  </button>
                  {/* 인라인 낙수(design §5) — 구독자는 이미 LLM 해석을 받으므로 비구독 대상에만 노출 */}
                  <Link href="/" className="mt-3 inline-block text-xs text-lilac-deep underline">
                    이 카드, 타로로 더 깊게 →
                  </Link>
                </>
              )}
            </section>
          );
        })()}

      {ritualOpen &&
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

      {subscribeOpen && (
        <StarConfirmModal
          cost={BYEOLMARU_SUBSCRIPTION.cost}
          balance={subBalance}
          loading={subBalanceLoading}
          accent={RITUAL_ACCENT}
          title="별마루 구독"
          subtitle="구독하면 오늘의 카드도 사주 위에서 풀어줘"
          confirmLabel="구독하기"
          onConfirm={() => void handleSubscribeConfirm()}
          onCharge={() => (window.location.href = "/shop")}
          onClose={() => setSubscribeOpen(false)}
        />
      )}
    </>
  );
}
