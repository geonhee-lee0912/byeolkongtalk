// components/byeolmaru/PremiumBlock.tsx — 개인화 서술 영역.
// 자격자: 서술 전문(빈 서술/로딩 폴백 포함, 업셀 CTA 없음) · 비자격자: 자리별 미끼(스펙 §9 — 자물쇠 대신 초대).
"use client";
import { useEffect } from "react";
import { trackUiEvent } from "@/lib/analytics/ui-events";
import { BYEOLMARU_SUBSCRIPTION } from "@/lib/byeolmaru/constants";
import { BAIT, baitLead, type BaitSlot, type BaitContext } from "@/lib/byeolmaru/bait";
import { MarkdownLite } from "@/lib/markdown-lite";
import { useBaitDismiss } from "./useBaitDismiss";

interface Props {
  entitled: boolean;
  trialUsed: boolean;
  narrative: string | null;   // 자격 && 생성 성공
  teaser: string | null;      // 자격 + 빈 서술 폴백의 첫 줄(자격자 경로 전용)
  loading: boolean;           // 서술 fetch 진행 중
  onStartTrial: (slot?: string) => void;
  onSubscribe: (slot?: string) => void;
  /** 🔴 P5-4 — 미끼는 자리마다 다른 물건이다(스펙 §9 "한 곳에 모으지 않는다"). */
  slot: BaitSlot;
  /** 첫 줄이 이어받을 맥락 — 화면에 이미 떠 있는 것만. */
  baitCtx?: BaitContext;
}

export default function PremiumBlock({ entitled, trialUsed, narrative, teaser, loading, onStartTrial, onSubscribe, slot, baitCtx }: Props) {
  // 🔴 훅은 조건부로 호출할 수 없다 — 아래 entitled 분기(return)보다 위, 다른 훅 옆에서 불러야
  //    자격 상태가 바뀌어도 훅 호출 순서가 그대로 유지된다. dismissed 값 자체는 비자격 분기에서만 쓴다.
  //    아래 gate_shown 계측 effect 가 이 훅의 resolved/dismissed 를 읽으므로 그 effect 보다 위에 둔다.
  const { dismissed, resolved, dismiss } = useBaitDismiss(slot);

  useEffect(() => {
    // 🔴 접힌 자리에선 노출을 찍지 않는다(FIX B) — 화면에 아무것도 안 뜨는데 gate_shown 이 쌓이면
    //    "어느 미끼가 파는가"(스펙 §13)의 분모가 오염되고, 접힘 비율도 raw 로는 못 읽는다.
    //    resolved 전(= localStorage 를 아직 못 읽은 한 프레임)에는 보류한다 — 그래야 자리당
    //    정확히 한 번만 찍힌다. slot 이 바뀌면(허브 인연 칩 토글) resolved 가 잠깐 false 로
    //    떨어졌다가 새 slot 값으로 다시 resolve 되므로 새 자리에 대해서도 정확히 1회 찍힌다.
    // 🔴 surface 는 자리가 아니라 **형태**다(P6-4). saju_report 는 허브 나 탭(여기)과 사주 상세
    //    (PaywallCut)가 같은 slot 값을 쓰므로, 이 필드가 없으면 "절단선이 미끼 카드보다 파는가"를
    //    영영 못 읽는다. 하드코딩이라 호출부 prop 은 필요 없다 — PaywallCut 이 "cut" 을 찍는다.
    //    🔴 두 컴포넌트에 **동시에** 있어야 의미가 있다. 한쪽만 찍으면 그날부터 또 다른 단절이 된다.
    if (!entitled && resolved && !dismissed) trackUiEvent("byeolmaru_gate_shown", { meta: { slot, surface: "bait_card" } });
  }, [entitled, resolved, dismissed, slot]);

  if (entitled) {
    return (
      <section className="rounded-2xl bg-cream-warm p-4">
        <h2 className="mb-2 font-display text-base text-eye-purple">별콩이의 오늘</h2>
        {narrative ? (
          <MarkdownLite text={narrative} className="text-sm leading-relaxed text-eye-purple" />
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
          닫기 버튼만 오른쪽 끝에 붙인다. 제목 span 은 min-w-0 로 줄어들되 줄바꿈되게 두고
          (truncate 금지), 배지·닫기엔 shrink-0 — 375px 처럼 좁은 화면에서도 줄어드는 건
          제목뿐, 배지·닫기는 밀리지 않는다.
          🔴 truncate 였다가 FIX A 로 제거 — saju_report 제목은 375px 기준 여유가 12px 뿐이라 한 글자만
          늘어도 잘렸다("…얹어줄게"에서 동사 "얹어줄게"가 통째로 잘려나가는 식). 페이월 헤드라인의
          약속 동사가 사라지는 셈이라 자르는 대신 줄바꿈으로 — 이건 폭·카피 어느 조합에서도 안전하다.
          (FIX A 당시 근거 하나였던 "tarot_rich 자리의 한 겹 더 좁은 중첩"은 P6-4 Task 9 이후 사라졌다
          — 그 자리는 이제 PaywallCut 이고 이 컴포넌트를 쓰지 않는다. 결론은 saju_report 만으로 선다.) */}
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 font-display text-base text-eye-purple">{copy.title}</span>
          {/* 배지가 자물쇠를 대신해 "유료"를 고지하므로 대비를 양보하지 않는다(eye-purple 7.01:1). */}
          <span className="shrink-0 rounded-full bg-lilac-soft/70 px-1.5 py-0.5 text-[10px] font-bold text-eye-purple">구독</span>
        </div>
        {/* 거절하면 그날은 접힌다(스펙 §9) — slot 별 당일 접힘은 useBaitDismiss 가 localStorage 로 기억.
            meta.surface 는 위 gate_shown 과 짝 — 여기선 늘 "bait_card" 다(접기는 PremiumBlock 에만 있다). */}
        <button
          onClick={() => { trackUiEvent("byeolmaru_gate_dismissed", { meta: { slot, surface: "bait_card" } }); dismiss(); }}
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
          <button onClick={() => onStartTrial(slot)} disabled={loading}
            className="mt-3 w-full rounded-xl bg-gold py-2.5 text-sm font-bold text-night disabled:opacity-60">
            3일 무료로 열어보기
          </button>
          {/* 가격 노출 2단 — 여기선 작게, 구독 시트에서 크게(스펙 §9). */}
          <p className="mt-1.5 text-center text-[11px] text-text-light">
            체험 끝나면 {BYEOLMARU_SUBSCRIPTION.cost}별 / {BYEOLMARU_SUBSCRIPTION.days}일
          </p>
        </>
      ) : (
        <button onClick={() => onSubscribe(slot)} disabled={loading}
          className="mt-3 w-full rounded-xl bg-gold py-2.5 text-sm font-bold text-night disabled:opacity-60">
          구독하고 매일 보기 · {BYEOLMARU_SUBSCRIPTION.cost}별 / {BYEOLMARU_SUBSCRIPTION.days}일
        </button>
      )}
    </section>
  );
}
