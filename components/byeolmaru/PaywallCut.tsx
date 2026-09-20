"use client";

// components/byeolmaru/PaywallCut.tsx — C안 절단선(스펙 §5-1): 한 장 안에서 무료/유료를 가른다.
// 🔴 PremiumBlock(별도 미끼 카드)을 상세·타로에서 대체한다. 허브·우리 탭의 PremiumBlock 은 그대로다.
// 🔴 "오늘은 그만" 접기는 여기 없다(사용자 확정 2026-09-20) — 이 블록은 광고가 아니라 **리포트 본문의
//    가려진 부분**이라, 접으면 리포트 자리가 통째로 비어 화면이 끊긴다. 대신 gate_shown 계측은 이식한다.
import { useEffect } from "react";
import { trackUiEvent } from "@/lib/analytics/ui-events";
import { BYEOLMARU_SUBSCRIPTION } from "@/lib/byeolmaru/constants";
import type { BaitSlot } from "@/lib/byeolmaru/bait";

// 형제 CardReportView.tsx 와 같은 관행 — 인라인 style 로 쓸 금색은 지역 상수로 둔다(@theme --color-gold 와 같은 값).
const GOLD = "#E8C26A";

interface Props {
  /** 절단선 위에 실제로 그린 글자 수 — 호출부가 센다(하드코딩 금지). */
  freeChars: number;
  /** 절단선 아래 유료 분량(paywall-sections.ts). */
  paidChars: number;
  /** 블러 위에 또렷하게 얹을 섹션 이름들(paywall-sections.ts). */
  sections: readonly string[];
  /** 블러로 깔 글자 — 정적 뱅크 재활용(§5-1). 스크린리더 중복을 막으려 aria-hidden 으로 감싼다. */
  blurText: string;
  trialUsed: boolean;
  onStartTrial: (slot?: string) => void;
  onSubscribe: (slot?: string) => void;
  slot: BaitSlot;
}

export default function PaywallCut({ freeChars, paidChars, sections, blurText, trialUsed, onStartTrial, onSubscribe, slot }: Props) {
  useEffect(() => {
    // PremiumBlock 에서 이식 — 자리별 노출 분모(스펙 §13)가 끊기지 않게 같은 이벤트·같은 meta 를 쓴다.
    // 접기가 없어져 resolved/dismissed 대기도 없다(자리당 정확히 1회).
    trackUiEvent("byeolmaru_gate_shown", { meta: { slot } });
  }, [slot]);

  return (
    <div className="mt-4">
      {/* 절단선 — 금색 선 + 무료 분량 칩. "여기서 잘렸다"를 자물쇠 없이 말한다(스펙 §9 톤). */}
      <div className="flex items-center gap-2">
        <span className="h-px flex-1" style={{ background: GOLD }} />
        <span className="shrink-0 whitespace-nowrap rounded-full border border-gold/50 bg-[#FFF7E8] px-2.5 py-0.5 text-[11px] font-bold text-[#8A6A1A]">
          여기까지 무료 · {freeChars}자
        </span>
        <span className="h-px flex-1" style={{ background: GOLD }} />
      </div>

      {/* 🔴 min-h 는 절대 위치 상자가 블러 문단보다 높아 위아래로 삐져나오는 걸 막는 방어다.
          플랜의 132px 은 실측으로 부족해 160px 로 올렸다(구현 시 브라우저 실측):
          상자 = p-3 24 + 제목 18 + mb-1.5 6 + 칩 4줄 96 = 144px, 여기에 wrap 의 p-2 16 을 더해 160px.
          칩은 사주 11개·타로 7개 **둘 다 4줄**로 떨어지고(한글 폰트 폴백 4종에서 동일), 호스트 폭
          263~343px 구간 전체에서 144px 로 일정하다. 5줄(169px→184px)은 호스트 폭이 ~247px 아래로
          내려가야 나오는데 375px 뷰포트의 실제 중첩(page p-4 + card p-4 = 311px)은 거기 닿지 않는다.
          실사용 blurText(card-taste 319~384자)는 이 바닥을 한참 넘으므로 min-h 는 짧은 뱅크 문장
          (saju-taste 중앙값 72자)에서만 실제로 작동한다 — 즉 이 값이 틀리면 조용히만 깨진다. */}
      <div className="relative mt-3">
        {/* 🔴 aria-hidden 필수 — 같은 taste 가 위에 선명하게 떠 있다. 없으면 스크린리더가 두 번 읽는다. */}
        <p aria-hidden="true" className="min-h-[160px] select-none text-[13px] leading-[1.85] text-[#4F4A5E] blur-[3px] opacity-50">
          {blurText}
        </p>
        <div className="absolute inset-0 flex items-center justify-center p-2">
          <div className="max-w-[260px] rounded-xl bg-white/90 p-3 text-center shadow-[0_4px_16px_rgba(90,62,140,0.14)]">
            <b className="mb-1.5 block text-[12px] font-bold text-eye-purple">
              여기부터 {paidChars.toLocaleString()}자가 더 있어
            </b>
            <div className="flex flex-wrap justify-center gap-1">
              {sections.map((s) => (
                <span key={s} className="rounded-lg border border-lilac-mid/50 px-1.5 py-0.5 text-[10px] font-bold text-[#6E6880]">
                  {s}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* CTA 는 잠금이 아니라 열쇠다(스펙 §9) — PremiumBlock 과 같은 문구·같은 2단 가격 노출. */}
      {!trialUsed ? (
        <>
          <button onClick={() => onStartTrial(slot)} className="mt-4 w-full rounded-xl bg-gold py-2.5 text-sm font-bold text-night">
            3일 무료로 열어보기
          </button>
          <p className="mt-1.5 text-center text-[11px] text-text-light">
            체험 끝나면 {BYEOLMARU_SUBSCRIPTION.cost}별 / {BYEOLMARU_SUBSCRIPTION.days}일
          </p>
        </>
      ) : (
        <button onClick={() => onSubscribe(slot)} className="mt-4 w-full rounded-xl bg-gold py-2.5 text-sm font-bold text-night">
          구독하고 매일 보기 · {BYEOLMARU_SUBSCRIPTION.cost}별 / {BYEOLMARU_SUBSCRIPTION.days}일
        </button>
      )}
    </div>
  );
}
