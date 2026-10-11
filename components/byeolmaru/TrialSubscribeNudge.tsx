"use client";

// components/byeolmaru/TrialSubscribeNudge.tsx — 체험 중, 유료 리포트 끝의 '이어서 구독' 한 줄
// (스펙 docs/superpowers/specs/2026-10-11-별마루-체험중-구독노출-design.md §3-2, 사용자 결정).
// 체험자 대부분은 첫 세션에 체험을 쓰고 떠나 만료 뒤의 구독 버튼을 못 본다(진단: 노출 2명) — 그래서
// 리포트를 다 읽은 바로 그 자리에서 한 번 보여준다. 체험 중에 사도 30일은 체험이 끝난 뒤부터다.
// 🔴 파는 톤 금지(페르소나 원칙): 금색·자물쇠·'끝나면 못 봐' 같은 불안 자극 없이 보조 스타일 한 줄 +
//    버튼 하나, 화면당 하나. 호출부가 `entitled && !subscriptionExpiresAt`(= 체험 중)일 때만 그린다.
import { BYEOLMARU_SUBSCRIPTION } from "@/lib/byeolmaru/constants";
import { daysLeft } from "@/lib/byeolmaru/subscribe-offer";
import type { BaitSlot } from "@/lib/byeolmaru/bait";
import SubscribeOfferShown from "./SubscribeOfferShown";

export default function TrialSubscribeNudge({
  trialEndsAt,
  slot,
  onSubscribe,
}: {
  trialEndsAt: string;
  slot: BaitSlot;
  onSubscribe: () => void;
}) {
  // 렌더 중 Date.now() — HubBanner 와 같은 이유로 괜찮다(캘린더를 받은 뒤 클라에서만 그려진다).
  // D-N 은 배너 칩과 같은 함수다 — 한 사람이 두 자리에서 다른 숫자를 보면 안 된다.
  const n = daysLeft(trialEndsAt, Date.now());
  return (
    <div className="mt-4 border-t border-lilac-mid/20 pt-3 text-center">
      <SubscribeOfferShown surface="report_end" phase="trial" slot={slot} />
      <p className="text-xs leading-relaxed text-text-light">
        체험 D-{n}야. 지금 구독해 두면 체험 끝난 다음부터 {BYEOLMARU_SUBSCRIPTION.days}일 이어서 받아.
      </p>
      {/* 금색 CTA 가 아니라 공유 버튼과 같은 흰 보조 버튼이다. 글자는 lilac-deep(흰 바탕 3:1, AA 미달) 대신
          eye-purple — 12px 굵은 글씨라 큰 글자 예외에 안 든다. */}
      <button
        type="button"
        onClick={onSubscribe}
        className="mt-2 w-full rounded-xl border border-lilac-mid/40 bg-white py-2 text-xs font-bold text-eye-purple"
      >
        이어서 구독하기 · {BYEOLMARU_SUBSCRIPTION.cost}별
      </button>
      <p className="mt-1.5 text-[11px] text-eye-purple">
        자동결제 아니야 — {BYEOLMARU_SUBSCRIPTION.cost}별 한 번이면 끝.
      </p>
    </div>
  );
}
