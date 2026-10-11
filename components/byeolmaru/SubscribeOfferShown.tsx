"use client";

// components/byeolmaru/SubscribeOfferShown.tsx — 구독 선택지 노출 계측(그리는 건 없다).
// 🔴 구독 선택지가 **그려지는 자리마다** 이걸 같이 둔다 — 체험 전 절단선 링크 · 체험 중 리포트 끝 넛지 ·
//    체험 후 배너/절단선/받은 글 안내(스펙 2026-10-11 §5). 마운트당 1회(자리·단계·slot 이 바뀌면 다시).
//    이게 클릭(byeolmaru_subscribe_clicked)의 분모다 — 자리를 새로 만들면서 이걸 빼먹으면 그 자리 전환율이
//    무한대로 읽힌다.
// 🔴 byeolmaru_gate_shown 과 합치지 말 것 — 그쪽은 절단선 '형태'의 노출 계열(P6-4)을 잇는 용도라
//    체험 버튼만 있는 절단선도 센다. 이건 **구독** 선택지만 센다.
import { useEffect } from "react";
import { trackUiEvent } from "@/lib/analytics/ui-events";
import type { SubscribePhase, SubscribeSurface } from "@/lib/byeolmaru/subscribe-offer";

export default function SubscribeOfferShown({
  surface,
  phase,
  slot,
}: {
  surface: SubscribeSurface;
  phase: SubscribePhase;
  slot?: string;
}) {
  useEffect(() => {
    trackUiEvent("byeolmaru_subscribe_offer_shown", { meta: { surface, phase, ...(slot ? { slot } : {}) } });
  }, [surface, phase, slot]);
  return null;
}
