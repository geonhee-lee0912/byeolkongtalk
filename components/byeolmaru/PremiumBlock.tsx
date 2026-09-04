// components/byeolmaru/PremiumBlock.tsx — 개인화 서술 영역.
// 자격자: 서술 전문(빈 서술/로딩 폴백 포함, 업셀 CTA 없음) · 비자격자: 시안 C(첫 줄 티저 + fade + CTA).
"use client";
import { useEffect } from "react";
import { trackUiEvent } from "@/lib/analytics/ui-events";

interface Props {
  entitled: boolean;
  trialUsed: boolean;
  narrative: string | null;   // 자격 && 생성 성공
  teaser: string | null;      // 비자격, 또는 자격+빈 서술 폴백의 첫 줄
  loading: boolean;           // 서술 fetch 진행 중
  onStartTrial: () => void;
  onSubscribe: () => void;
}

export default function PremiumBlock({ entitled, trialUsed, narrative, teaser, loading, onStartTrial, onSubscribe }: Props) {
  useEffect(() => {
    if (!entitled) trackUiEvent("byeolmaru_gate_shown"); // 잠금 노출 1회(마운트당). 자격자에겐 안 찍는다.
  }, [entitled]);

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

  return (
    <section className="rounded-2xl bg-[#F3EEFB] p-4">
      <div className="mb-1 flex items-center gap-1 text-xs text-lilac-deep"><span aria-hidden>🔒</span> 별콩이의 개인화</div>
      {teaser && <p className="text-sm leading-relaxed text-eye-purple">{teaser}</p>}
      <p className="mt-0.5 text-sm leading-relaxed text-eye-purple [mask-image:linear-gradient(#000,transparent)] opacity-60">
        이어서 별콩이가 네 월·시 기둥까지 겹쳐서 오늘 누구와…
      </p>
      {!trialUsed ? (
        <button onClick={onStartTrial} disabled={loading}
          className="mt-3 w-full rounded-xl bg-gold py-2.5 text-sm font-medium text-eye-purple disabled:opacity-60">
          3일 무료 체험 시작
        </button>
      ) : (
        <button onClick={onSubscribe} disabled={loading}
          className="mt-3 w-full rounded-xl bg-gold py-2.5 text-sm font-medium text-eye-purple disabled:opacity-60">
          구독하고 매일 보기 · 20별 / 30일
        </button>
      )}
    </section>
  );
}
