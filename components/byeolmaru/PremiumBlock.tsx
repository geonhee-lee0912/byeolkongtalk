// components/byeolmaru/PremiumBlock.tsx — 개인화 서술 영역.
// 자격자: 서술 전문(빈 서술/로딩 폴백 포함, 업셀 CTA 없음) · 비자격자: 자리별 미끼(스펙 §9 — 자물쇠 대신 초대).
"use client";
import { useEffect } from "react";
import { trackUiEvent } from "@/lib/analytics/ui-events";
import { BYEOLMARU_SUBSCRIPTION } from "@/lib/byeolmaru/constants";
import { BAIT, baitLead, type BaitSlot, type BaitContext } from "@/lib/byeolmaru/bait";
import { useBaitDismiss } from "./useBaitDismiss";

interface Props {
  entitled: boolean;
  trialUsed: boolean;
  narrative: string | null;   // 자격 && 생성 성공
  teaser: string | null;      // 자격 + 빈 서술 폴백의 첫 줄(자격자 경로 전용)
  loading: boolean;           // 서술 fetch 진행 중
  onStartTrial: () => void;
  onSubscribe: () => void;
  /** 🔴 P5-4 — 미끼는 자리마다 다른 물건이다(스펙 §9 "한 곳에 모으지 않는다"). */
  slot: BaitSlot;
  /** 첫 줄이 이어받을 맥락 — 화면에 이미 떠 있는 것만. */
  baitCtx?: BaitContext;
}

export default function PremiumBlock({ entitled, trialUsed, narrative, teaser, loading, onStartTrial, onSubscribe, slot, baitCtx }: Props) {
  useEffect(() => {
    if (!entitled) trackUiEvent("byeolmaru_gate_shown", { meta: { slot } }); // 슬롯 노출마다 1회 — slot 이 바뀌면 같은 마운트에서도 다시 찍힌다(허브 인연 칩 토글 등). 자격자에겐 안 찍는다.
  }, [entitled, slot]);
  // 🔴 훅은 조건부로 호출할 수 없다 — 아래 entitled 분기(return)보다 위, 다른 훅 옆에서 불러야
  //    자격 상태가 바뀌어도 훅 호출 순서가 그대로 유지된다. dismissed 값 자체는 비자격 분기에서만 쓴다.
  const { dismissed, dismiss } = useBaitDismiss(slot);

  if (entitled) {
    return (
      <section className="rounded-2xl bg-cream-warm p-4">
        <h2 className="mb-2 font-display text-base text-eye-purple">별콩이의 오늘</h2>
        {narrative ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-eye-purple">{narrative}</p>
        ) : loading ? (
          <p className="text-sm text-text-light">오늘 흐름을 풀어보는 중…</p>
        ) : (
          <>
            {teaser && <p className="text-sm leading-relaxed text-eye-purple">{teaser}</p>}
            <p className="mt-2 text-xs text-text-light">별콩이가 잠깐 숨 고르는 중이야. 조금 뒤에 다시 와줄래?</p>
          </>
        )}
      </section>
    );
  }

  // 🔴 반드시 위 자격자 분기 뒤에 둔다 — 앞에 두면 구독자가 자기 서술을 잃는다(스펙 §9).
  if (dismissed) return null;

  const copy = BAIT[slot];
  const lead = baitLead(slot, baitCtx ?? {});
  return (
    <section className="rounded-2xl border border-lilac-mid/25 bg-white p-4 shadow-[0_2px_10px_rgba(159,138,208,0.08)]">
      {/* 🔴 자물쇠를 쓰지 않는다(스펙 §9) — 잠긴 게 아니라 "더 깊이 읽어주겠다"는 초대다.
          유료라는 사실은 사라지지 않고 작은 '구독' 배지가 명확히 남긴다. */}
      {/* 제목 행 3요소(제목·배지·닫기) — 제목+배지를 한 그룹으로 묶어 justify-between 으로
          닫기 버튼만 오른쪽 끝에 붙인다. 제목 span 에 min-w-0+truncate, 배지·닫기엔 shrink-0 —
          375px 처럼 좁은 화면에서 제목이 길어도 줄어드는 건 제목뿐, 배지·닫기는 밀리지 않는다. */}
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 truncate font-display text-base text-eye-purple">{copy.title}</span>
          {/* 배지가 자물쇠를 대신해 "유료"를 고지하므로 대비를 양보하지 않는다(eye-purple 7.01:1). */}
          <span className="shrink-0 rounded-full bg-lilac-soft/70 px-1.5 py-0.5 text-[10px] font-bold text-eye-purple">구독</span>
        </div>
        {/* 거절하면 그날은 접힌다(스펙 §9) — slot 별 당일 접힘은 useBaitDismiss 가 localStorage 로 기억. */}
        <button
          onClick={() => { trackUiEvent("byeolmaru_gate_dismissed", { meta: { slot } }); dismiss(); }}
          aria-label="오늘은 그만 보기"
          className="shrink-0 rounded-full px-2 py-1 text-[11px] text-text-light/70"
        >
          오늘은 그만
        </button>
      </div>
      {/* 증거 — "길다·정확하다"를 말이 아니라 분량·구성으로 보여준다(2탭 분량 힌트 관행). */}
      <div className="mb-2 flex flex-wrap gap-1">
        {copy.chips.map((c) => (
          <span key={c} className="rounded-full bg-cream-warm px-2 py-0.5 text-[11px] font-medium text-text-light">
            {c}
          </span>
        ))}
      </div>
      {/* 첫 줄은 위 무료 요약을 이어받는다 → 무료→유료가 한 흐름으로 읽힌다. */}
      <p className="text-sm leading-relaxed text-eye-purple">{lead}</p>
      <p className="mt-0.5 text-sm leading-relaxed text-eye-purple opacity-60 [mask-image:linear-gradient(#000,transparent)]">
        {copy.tail}
      </p>
      {!trialUsed ? (
        <>
          {/* CTA 는 잠금이 아니라 **열쇠**다(스펙 §9). */}
          <button onClick={onStartTrial} disabled={loading}
            className="mt-3 w-full rounded-xl bg-gold py-2.5 text-sm font-bold text-night disabled:opacity-60">
            3일 무료로 열어보기
          </button>
          {/* 가격 노출 2단 — 여기선 작게, 구독 시트에서 크게(스펙 §9). */}
          <p className="mt-1.5 text-center text-[11px] text-text-light">
            체험 끝나면 {BYEOLMARU_SUBSCRIPTION.cost}별 / {BYEOLMARU_SUBSCRIPTION.days}일
          </p>
        </>
      ) : (
        <button onClick={onSubscribe} disabled={loading}
          className="mt-3 w-full rounded-xl bg-gold py-2.5 text-sm font-bold text-night disabled:opacity-60">
          구독하고 매일 보기 · {BYEOLMARU_SUBSCRIPTION.cost}별 / {BYEOLMARU_SUBSCRIPTION.days}일
        </button>
      )}
    </section>
  );
}
